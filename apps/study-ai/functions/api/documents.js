/**
 * Cloudflare Pages API: /api/documents
 * Handles ingestion, listing, chunking, and deletion of student textbooks, lecture notes, and PDFs.
 * Edge storage backed 100% by Cloudflare D1.
 */

// Helper to generate unique IDs
function generateId(prefix = "doc") {
  const timestamp = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${rand}`;
}

// Text chunker for long-form textbooks and papers
function chunkText(text, maxChunkSize = 2500, overlap = 200) {
  if (!text || text.length <= maxChunkSize) {
    return [text];
  }
  const chunks = [];
  let startIndex = 0;
  while (startIndex < text.length) {
    let endIndex = startIndex + maxChunkSize;
    if (endIndex < text.length) {
      // Find nearest paragraph break or sentence break
      const lastParagraph = text.lastIndexOf("\n\n", endIndex);
      const lastSentence = text.lastIndexOf(". ", endIndex);
      if (lastParagraph > startIndex + maxChunkSize * 0.5) {
        endIndex = lastParagraph + 2;
      } else if (lastSentence > startIndex + maxChunkSize * 0.5) {
        endIndex = lastSentence + 2;
      }
    }
    chunks.push(text.slice(startIndex, endIndex).trim());
    startIndex = endIndex - overlap;
  }
  return chunks;
}

// GET: List documents or get a single document with its materials
export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(
      JSON.stringify({
        error: "D1 Database Not Bound",
        message: "Binding 'DB' is missing in wrangler.toml or local dev flags. Run with --d1=nexus-study-db.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(request.url);
  const docId = url.searchParams.get("id");
  const subject = url.searchParams.get("subject");

  try {
    if (docId) {
      // Get single document
      const doc = await db
        .prepare("SELECT * FROM documents WHERE id = ?")
        .bind(docId)
        .first();

      if (!doc) {
        return new Response(
          JSON.stringify({ error: "Not Found", message: `Document ${docId} not found.` }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      // Fetch associated materials
      const materialsResult = await db
        .prepare(
          "SELECT id, material_type, created_at, content_json FROM study_materials WHERE document_id = ? ORDER BY created_at DESC"
        )
        .bind(docId)
        .all();

      const materials = (materialsResult.results || []).map((m) => {
        let parsed = null;
        try {
          parsed = JSON.parse(m.content_json);
        } catch (_) {
          parsed = m.content_json;
        }
        return {
          id: m.id,
          material_type: m.material_type,
          created_at: m.created_at,
          content: parsed,
        };
      });

      // Get count of flashcards created for this document
      const cardsCount = await db
        .prepare(
          `SELECT COUNT(c.id) as total_cards,
                  SUM(CASE WHEN c.box_level = 5 THEN 1 ELSE 0 END) as mastered_cards
           FROM spaced_repetition_cards c
           JOIN study_materials m ON c.material_id = m.id
           WHERE m.document_id = ?`
        )
        .bind(docId)
        .first();

      return new Response(
        JSON.stringify({
          document: {
            ...doc,
            char_count: doc.raw_content ? doc.raw_content.length : 0,
            word_count: doc.raw_content ? doc.raw_content.split(/\s+/).filter(Boolean).length : 0,
          },
          materials,
          stats: cardsCount || { total_cards: 0, mastered_cards: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // List all documents with material count summaries
    let query = `
      SELECT d.id, d.title, d.subject, d.created_at,
             LENGTH(d.raw_content) as char_count,
             SUBSTR(d.raw_content, 1, 160) as preview,
             COUNT(DISTINCT m.id) as materials_count,
             COUNT(DISTINCT c.id) as cards_count
      FROM documents d
      LEFT JOIN study_materials m ON d.id = m.document_id
      LEFT JOIN spaced_repetition_cards c ON m.id = c.material_id
    `;
    const params = [];

    if (subject && subject !== "All") {
      query += ` WHERE d.subject = ?`;
      params.push(subject);
    }

    query += ` GROUP BY d.id ORDER BY d.created_at DESC`;

    const stmt = params.length > 0 ? db.prepare(query).bind(...params) : db.prepare(query);
    const result = await stmt.all();

    // Distinct subjects for the filter UI
    const subjectsResult = await db
      .prepare("SELECT DISTINCT subject FROM documents WHERE subject IS NOT NULL ORDER BY subject ASC")
      .all();
    const subjects = (subjectsResult.results || []).map((r) => r.subject).filter(Boolean);

    return new Response(
      JSON.stringify({
        documents: result.results || [],
        subjects,
        total: (result.results || []).length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Documents GET Error]", err);
    return new Response(
      JSON.stringify({ error: "Database Query Failed", message: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// POST: Ingest new textbook/notes document
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(
      JSON.stringify({ error: "D1 Database Not Bound", message: "Check DB binding in wrangler.toml." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await request.json();
    const { title, subject, raw_content } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return new Response(
        JSON.stringify({ error: "Validation Error", message: "A non-empty 'title' is required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!raw_content || typeof raw_content !== "string" || !raw_content.trim()) {
      return new Response(
        JSON.stringify({ error: "Validation Error", message: "Document 'raw_content' cannot be empty." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const docId = generateId("doc");
    const cleanTitle = title.trim().slice(0, 255);
    const cleanSubject = (subject && typeof subject === "string" ? subject.trim() : "General").slice(0, 100);
    const cleanContent = raw_content.trim();

    // Store in D1
    await db
      .prepare(
        "INSERT INTO documents (id, title, subject, raw_content, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
      )
      .bind(docId, cleanTitle, cleanSubject, cleanContent)
      .run();

    const charCount = cleanContent.length;
    const wordCount = cleanContent.split(/\s+/).filter(Boolean).length;
    const chunks = chunkText(cleanContent);

    return new Response(
      JSON.stringify({
        success: true,
        document: {
          id: docId,
          title: cleanTitle,
          subject: cleanSubject,
          char_count: charCount,
          word_count: wordCount,
          chunks_count: chunks.length,
          created_at: new Date().toISOString(),
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Documents POST Error]", err);
    return new Response(
      JSON.stringify({ error: "Ingestion Failed", message: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// DELETE: Remove document and cascade delete its materials & cards
export async function onRequestDelete(context) {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(
      JSON.stringify({ error: "D1 Database Not Bound" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(request.url);
    let docId = url.searchParams.get("id");

    if (!docId) {
      try {
        const body = await request.json();
        docId = body.id;
      } catch (_) {}
    }

    if (!docId) {
      return new Response(
        JSON.stringify({ error: "Missing ID", message: "Document ID is required to delete." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Cascade delete in D1
    // First, find all material_ids for this document
    const materials = await db
      .prepare("SELECT id FROM study_materials WHERE document_id = ?")
      .bind(docId)
      .all();

    const matIds = (materials.results || []).map((m) => m.id);

    // Delete cards for these materials
    for (const mId of matIds) {
      await db.prepare("DELETE FROM spaced_repetition_cards WHERE material_id = ?").bind(mId).run();
    }

    // Delete materials
    await db.prepare("DELETE FROM study_materials WHERE document_id = ?").bind(docId).run();

    // Delete document
    const result = await db.prepare("DELETE FROM documents WHERE id = ?").bind(docId).run();

    return new Response(
      JSON.stringify({
        success: true,
        deleted_id: docId,
        materials_removed: matIds.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Documents DELETE Error]", err);
    return new Response(
      JSON.stringify({ error: "Deletion Failed", message: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Cloudflare Pages API: /api/documents
 * Document Ingestion & Micro-Chunking Engine
 * Converts lengthy textbook chapters into 3-minute, single-concept accessible notes.
 */

export async function onRequest(context) {
  const { request, env, data } = context;

  // 1. GET: Fetch documents & their micro-chunks
  if (request.method === "GET") {
    let docs = [];
    if (env.DB) {
      try {
        const res = await env.DB.prepare(
          "SELECT id, title, course_name, subject, word_count, created_at FROM documents ORDER BY created_at DESC"
        ).all();
        docs = res.results || [];
      } catch (e) {
        console.warn("D1 docs fetch error:", e.message);
      }
    }

    if (docs.length === 0) {
      docs = [
        { id: "doc_bio_01", title: "Cellular Respiration & ATP Synthesis", course_name: "Biology 101", subject: "Cellular Biology", word_count: 70 }
      ];
    }

    return new Response(JSON.stringify({ success: true, documents: docs }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // 2. POST: Ingest document and generate micro-chunks
  if (request.method === "POST") {
    try {
      const body = await request.json();
      const { title = "Textbook Chapter", course = "General Course", text = "", file_type = "pdf" } = body;
      const customKey = data?.customKey || body.custom_key;

      if (!text || text.trim().length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Text content is required." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const docId = `doc_${Date.now()}`;
      const wordCount = text.trim().split(/\s+/).length;

      // Generate Micro-Chunks using Groq / Workers AI
      const chunkPrompt = `You are the Nexus Scholar Micro-Chunking Assistant for students with ADHD and cognitive fatigue.
Analyze this textbook text and decompose it into 3 distinct, bite-sized "3-Minute Concept Cards".
Each card must focus on ONE isolated principle with a crystal-clear summary and a brief spoken script.

Text:
"${text.slice(0, 3500)}"

Return STRICT JSON:
{
  "chunks": [
    {
      "section_title": "Concept 1 Name",
      "concept_summary": "1-2 sentence core concept explanation",
      "audio_walkthrough_text": "Spoken explanation designed for 60-90 second listening",
      "duration_minutes": 3
    }
  ]
}`;

      let chunks = [];
      const groqKey = (customKey && customKey.startsWith("gsk_")) ? customKey : env.GROQ_API_KEY;
      if (groqKey) {
        try {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${groqKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [{ role: "user", content: chunkPrompt }],
              response_format: { type: "json_object" },
              temperature: 0.2,
            }),
          });
          if (res.ok) {
            const parsed = await res.json();
            const data = JSON.parse(parsed.choices?.[0]?.message?.content);
            chunks = data.chunks || [];
          }
        } catch (e) {
          console.warn("Chunking error:", e.message);
        }
      }

      if (chunks.length === 0) {
        chunks = [
          {
            section_title: "Core Foundational Principle",
            concept_summary: text.slice(0, 250) + "...",
            audio_walkthrough_text: "Welcome to this concept breakdown. " + text.slice(0, 300),
            duration_minutes: 3
          }
        ];
      }

      // Store in D1
      if (env.DB) {
        try {
          await env.DB.prepare(
            `INSERT INTO documents (id, title, course_name, subject, raw_text, file_type, word_count)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(docId, title, course, "General", text, file_type, wordCount).run();

          for (let i = 0; i < chunks.length; i++) {
            const ch = chunks[i];
            const noteId = `note_${docId}_${i}`;
            await env.DB.prepare(
              `INSERT INTO accessible_notes (id, document_id, section_title, concept_summary, audio_walkthrough_text, duration_minutes, chunk_order)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).bind(noteId, docId, ch.section_title, ch.concept_summary, ch.audio_walkthrough_text, ch.duration_minutes || 3, i + 1).run();
          }
        } catch (dbErr) {
          console.warn("D1 insert doc error:", dbErr.message);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          document_id: docId,
          title,
          word_count: wordCount,
          chunks,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

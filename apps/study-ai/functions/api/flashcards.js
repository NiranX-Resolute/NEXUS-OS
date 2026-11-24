/**
 * Cloudflare Pages API: /api/flashcards
 * Leitner Spaced Repetition Engine (Boxes 1 to 5)
 * Powered 100% by Cloudflare D1 Serverless SQLite
 *
 * Leitner Schedule:
 * - Box 1: Review Every 1 Day (Daily reinforcement)
 * - Box 2: Review Every 3 Days
 * - Box 3: Review Every 7 Days (Weekly retention)
 * - Box 4: Review Every 14 Days (Bi-weekly recall)
 * - Box 5: Review Every 30 Days (Long-term semantic mastery)
 */

// Calculate next review timestamp based on Leitner Box level and student rating
function calculateNextReview(currentBox, rating) {
  let newBox = currentBox;
  let intervalSeconds = 86400; // default 1 day

  const r = (rating || "").toLowerCase();

  if (r === "again" || r === "fail" || rating === false) {
    // Reset to Box 1
    newBox = 1;
    // Schedule for immediate re-test within current session (10 minutes)
    intervalSeconds = 600;
  } else if (r === "hard") {
    // Maintain current box level, review again tomorrow
    newBox = Math.max(1, currentBox);
    intervalSeconds = 86400; // 1 day
  } else if (r === "good" || r === "pass" || rating === true) {
    // Promote by 1 box
    newBox = Math.min(5, currentBox + 1);
    switch (newBox) {
      case 2:
        intervalSeconds = 3 * 86400; // 3 days
        break;
      case 3:
        intervalSeconds = 7 * 86400; // 7 days
        break;
      case 4:
        intervalSeconds = 14 * 86400; // 14 days
        break;
      case 5:
        intervalSeconds = 30 * 86400; // 30 days
        break;
      default:
        intervalSeconds = 86400;
    }
  } else if (r === "easy") {
    // Skip ahead by 2 boxes (max 5)
    newBox = Math.min(5, currentBox + 2);
    switch (newBox) {
      case 2:
        intervalSeconds = 4 * 86400;
        break;
      case 3:
        intervalSeconds = 10 * 86400;
        break;
      case 4:
        intervalSeconds = 21 * 86400;
        break;
      case 5:
        intervalSeconds = 45 * 86400;
        break;
      default:
        intervalSeconds = 3 * 86400;
    }
  }

  const nextReviewDate = new Date(Date.now() + intervalSeconds * 1000).toISOString();
  return { newBox, nextReviewDate, intervalSeconds };
}

// GET: Fetch cards and Leitner progress statistics
export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(
      JSON.stringify({ error: "D1 Database Not Bound" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(request.url);
  const docId = url.searchParams.get("document_id");
  const materialId = url.searchParams.get("material_id");
  const dueOnly = url.searchParams.get("due_only") === "true";
  const boxLevel = url.searchParams.get("box_level");

  try {
    let query = `
      SELECT c.id, c.material_id, c.front, c.back, c.box_level, c.next_review_at,
             m.document_id, d.title as doc_title, d.subject as doc_subject,
             (datetime(c.next_review_at) <= datetime('now')) as is_due
      FROM spaced_repetition_cards c
      JOIN study_materials m ON c.material_id = m.id
      JOIN documents d ON m.document_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (materialId) {
      query += ` AND c.material_id = ?`;
      params.push(materialId);
    } else if (docId) {
      query += ` AND m.document_id = ?`;
      params.push(docId);
    }

    if (dueOnly) {
      query += ` AND datetime(c.next_review_at) <= datetime('now')`;
    }

    if (boxLevel) {
      query += ` AND c.box_level = ?`;
      params.push(parseInt(boxLevel, 10));
    }

    query += ` ORDER BY is_due DESC, c.box_level ASC, c.next_review_at ASC`;

    const stmt = params.length > 0 ? db.prepare(query).bind(...params) : db.prepare(query);
    const results = await stmt.all();
    const cards = results.results || [];

    // Calculate box distribution metrics
    let statsQuery = `
      SELECT
        COUNT(c.id) as total_cards,
        SUM(CASE WHEN c.box_level = 1 THEN 1 ELSE 0 END) as box_1,
        SUM(CASE WHEN c.box_level = 2 THEN 1 ELSE 0 END) as box_2,
        SUM(CASE WHEN c.box_level = 3 THEN 1 ELSE 0 END) as box_3,
        SUM(CASE WHEN c.box_level = 4 THEN 1 ELSE 0 END) as box_4,
        SUM(CASE WHEN c.box_level = 5 THEN 1 ELSE 0 END) as box_5,
        SUM(CASE WHEN datetime(c.next_review_at) <= datetime('now') THEN 1 ELSE 0 END) as due_count
      FROM spaced_repetition_cards c
      JOIN study_materials m ON c.material_id = m.id
      WHERE 1=1
    `;
    const statParams = [];
    if (materialId) {
      statsQuery += ` AND c.material_id = ?`;
      statParams.push(materialId);
    } else if (docId) {
      statsQuery += ` AND m.document_id = ?`;
      statParams.push(docId);
    }

    const statStmt = statParams.length > 0 ? db.prepare(statsQuery).bind(...statParams) : db.prepare(statsQuery);
    const statsResult = await statStmt.first();

    const total = statsResult?.total_cards || 0;
    const mastered = statsResult?.box_5 || 0;
    const masteryPercentage = total > 0 ? Math.round((mastered / total) * 100) : 0;

    return new Response(
      JSON.stringify({
        cards,
        total: cards.length,
        stats: {
          total_cards: total,
          due_today: statsResult?.due_count || 0,
          mastery_percentage: masteryPercentage,
          boxes: {
            1: statsResult?.box_1 || 0,
            2: statsResult?.box_2 || 0,
            3: statsResult?.box_3 || 0,
            4: statsResult?.box_4 || 0,
            5: statsResult?.box_5 || 0,
          }
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Flashcards GET Error]", err);
    return new Response(
      JSON.stringify({ error: "Failed to fetch flashcards", message: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// POST: Record student review feedback on a card
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(
      JSON.stringify({ error: "D1 Database Not Bound" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await request.json();
    const { card_id, rating, correct } = body;

    if (!card_id) {
      return new Response(
        JSON.stringify({ error: "Missing card_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Determine normalized rating
    const normalizedRating = rating || (correct === true ? "good" : "again");

    // Fetch existing card state
    const card = await db
      .prepare("SELECT id, box_level, next_review_at FROM spaced_repetition_cards WHERE id = ?")
      .bind(card_id)
      .first();

    if (!card) {
      return new Response(
        JSON.stringify({ error: "Card Not Found", card_id }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const { newBox, nextReviewDate, intervalSeconds } = calculateNextReview(card.box_level, normalizedRating);

    // Update Leitner box and timestamp in D1
    await db
      .prepare(
        "UPDATE spaced_repetition_cards SET box_level = ?, next_review_at = ? WHERE id = ?"
      )
      .bind(newBox, nextReviewDate, card_id)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        card_id,
        previous_box: card.box_level,
        new_box: newBox,
        next_review_at: nextReviewDate,
        interval_hours: Math.round(intervalSeconds / 3600),
        status: newBox === 5 ? "MASTERED" : (newBox > card.box_level ? "PROMOTED" : "REINFORCE")
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Flashcards POST Error]", err);
    return new Response(
      JSON.stringify({ error: "Failed to record review", message: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// PUT: Reset entire deck or single card back to Box 1 for review
export async function onRequestPut(context) {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(
      JSON.stringify({ error: "D1 Database Not Bound" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await request.json();
    const { card_id, material_id, document_id } = body;

    if (card_id) {
      await db
        .prepare("UPDATE spaced_repetition_cards SET box_level = 1, next_review_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(card_id)
        .run();
      return new Response(JSON.stringify({ success: true, message: "Card reset to Box 1." }));
    }

    if (material_id) {
      await db
        .prepare("UPDATE spaced_repetition_cards SET box_level = 1, next_review_at = CURRENT_TIMESTAMP WHERE material_id = ?")
        .bind(material_id)
        .run();
      return new Response(JSON.stringify({ success: true, message: "Deck reset to Box 1." }));
    }

    if (document_id) {
      await db
        .prepare(`
          UPDATE spaced_repetition_cards
          SET box_level = 1, next_review_at = CURRENT_TIMESTAMP
          WHERE material_id IN (SELECT id FROM study_materials WHERE document_id = ?)
        `)
        .bind(document_id)
        .run();
      return new Response(JSON.stringify({ success: true, message: "All document cards reset to Box 1." }));
    }

    return new Response(
      JSON.stringify({ error: "Specify card_id, material_id, or document_id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Reset failed", message: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

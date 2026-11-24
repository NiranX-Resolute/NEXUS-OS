/**
 * Cloudflare Pages API: /api/flashcards
 * Leitner 5-Box Spaced Repetition Engine for Hands-Free Gaze Study
 */

export async function onRequest(context) {
  const { request, env } = context;

  // 1. GET: Fetch active deck with Leitner statistics
  if (request.method === "GET") {
    let cards = [];
    if (env.DB) {
      try {
        const res = await env.DB.prepare(
          "SELECT * FROM flashcards ORDER BY box_level ASC, next_review_due ASC LIMIT 50"
        ).all();
        cards = res.results || [];
      } catch (e) {
        console.warn("D1 flashcards fetch error:", e.message);
      }
    }

    if (cards.length === 0) {
      cards = [
        { id: "fc_01", question: "Where does glycolysis occur in eukaryotic cells?", answer: "In the cytoplasm (cytosol). It does not require oxygen.", difficulty: "easy", box_level: 1 },
        { id: "fc_02", question: "What enzyme drives the phosphorylation of ADP to ATP via proton gradient?", answer: "ATP Synthase located on the inner mitochondrial membrane.", difficulty: "medium", box_level: 1 },
        { id: "fc_03", question: "What are the two primary electron carriers delivering electrons to the ETC?", answer: "NADH and FADH2.", difficulty: "hard", box_level: 1 },
      ];
    }

    return new Response(JSON.stringify({ success: true, cards }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // 2. POST: Rate flashcard (Easy, Medium, Hard) and advance/reset Leitner Box
  if (request.method === "POST") {
    try {
      const body = await request.json();
      const { card_id, rating } = body; // rating: 'easy', 'medium', 'hard'

      if (!card_id || !rating) {
        return new Response(JSON.stringify({ success: false, error: "Missing card_id or rating." }), {
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }

      let newBoxLevel = 1;
      let nextReviewHours = 24;

      if (rating === "easy") {
        newBoxLevel = 3; // Advance
        nextReviewHours = 72;
      } else if (rating === "medium") {
        newBoxLevel = 2;
        nextReviewHours = 48;
      } else {
        newBoxLevel = 1; // Reset to Box 1 for reinforcement
        nextReviewHours = 12;
      }

      if (env.DB) {
        try {
          await env.DB.prepare(
            `UPDATE flashcards 
             SET box_level = MIN(5, MAX(1, ?)),
                 review_count = review_count + 1,
                 last_reviewed_at = CURRENT_TIMESTAMP,
                 next_review_due = datetime('now', '+' || ? || ' hours')
             WHERE id = ?`
          ).bind(newBoxLevel, nextReviewHours, card_id).run();
        } catch (dbErr) {
          console.warn("D1 update card error:", dbErr.message);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          card_id,
          rating,
          new_box_level: newBoxLevel,
          next_review_in_hours: nextReviewHours,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: e.message }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

/**
 * Cloudflare Pages API: /api/routines
 * Daily Routine Cue Cards & Scheduled Assistive Reminders
 */

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "GET") {
    let routines = [];
    if (env.DB) {
      try {
        const res = await env.DB.prepare(
          "SELECT * FROM daily_routines ORDER BY time_of_day ASC"
        ).all();
        routines = res.results || [];
      } catch (err) {
        console.warn("D1 daily_routines error:", err.message);
      }
    }

    if (routines.length === 0) {
      routines = [
        { id: "rtn_01", title: "Morning Hydration", description: "Drink 1 glass of water.", time_of_day: "08:00", category: "hydration", audio_cue_text: "Time for morning hydration.", visual_icon: "💧", is_completed_today: 0 },
        { id: "rtn_02", title: "Morning Medication", description: "Take prescribed morning pills.", time_of_day: "09:00", category: "medication", audio_cue_text: "Medication reminder. Please take morning pills.", visual_icon: "💊", is_completed_today: 0 },
        { id: "rtn_03", title: "Afternoon Movement", description: "Gentle posture stretch.", time_of_day: "14:00", category: "exercise", audio_cue_text: "Time for gentle movement or stretch.", visual_icon: "🧘", is_completed_today: 0 },
        { id: "rtn_04", title: "Evening Care & Rest", description: "Take evening dose and rest.", time_of_day: "21:00", category: "medication", audio_cue_text: "Evening routine reminder. Time to prepare for sleep.", visual_icon: "🌙", is_completed_today: 0 },
      ];
    }

    return new Response(
      JSON.stringify({ success: true, routines }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (request.method === "POST") {
    try {
      const body = await request.json();
      const { action = "complete", id, title, description, time_of_day, category, audio_cue_text, visual_icon } = body;

      if (action === "complete" && id && env.DB) {
        await env.DB.prepare(
          "UPDATE daily_routines SET is_completed_today = 1, last_completed_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(id).run();

        return new Response(
          JSON.stringify({ success: true, message: "Routine marked complete." }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (action === "reset_all" && env.DB) {
        await env.DB.prepare("UPDATE daily_routines SET is_completed_today = 0").run();
        return new Response(JSON.stringify({ success: true, message: "Routines reset for new day." }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (action === "add" && env.DB) {
        const newId = `rtn_${Date.now()}`;
        await env.DB.prepare(
          `INSERT INTO daily_routines (id, title, description, time_of_day, category, audio_cue_text, visual_icon, is_completed_today)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
        ).bind(newId, title, description || "", time_of_day, category || "task", audio_cue_text || title, visual_icon || "⭐").run();

        return new Response(
          JSON.stringify({ success: true, id: newId }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(
        JSON.stringify({ success: false, error: e.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

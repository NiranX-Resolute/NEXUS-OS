/**
 * Cloudflare Pages API: /api/aac
 * AAC Communication Engine & Dynamic Predictive Tile Generator
 * 
 * Features:
 * 1. Generative 4-Tile Prediction: Dynamically predicts the 4 most relevant quick-response tiles
 *    based on what an interlocutor/caregiver said, or what tiles the user has built so far.
 * 2. Custom Phrase CRUD backed by Cloudflare D1.
 */

export async function onRequest(context) {
  const { request, env, data } = context;
  const url = new URL(request.url);

  // 1. GET /api/aac - Fetch custom and favorite phrases
  if (request.method === "GET") {
    let phrases = [];
    if (env.DB) {
      try {
        const res = await env.DB.prepare(
          "SELECT * FROM aac_phrases ORDER BY is_favorite DESC, usage_count DESC"
        ).all();
        phrases = res.results || [];
      } catch (e) {
        console.warn("D1 aac_phrases fetch error:", e.message);
      }
    }

    return new Response(
      JSON.stringify({ success: true, phrases }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. POST /api/aac - Handle Predictive Tile Generation or Add Custom Tile
  if (request.method === "POST") {
    try {
      const body = await request.json();
      const action = body.action || "predict"; // 'predict', 'create_tile', 'log_usage'

      if (action === "predict") {
        const contextText = body.context || body.last_spoken || "";
        const currentSentence = body.current_sentence || "";
        const customKey = data?.customKey || body.custom_key;

        const systemPrompt = `You are an AAC (Augmentative and Alternative Communication) assistive AI.
A non-verbal individual with motor/speech disabilities is communicating.
Context / What was just said: "${contextText}"
What the user has selected so far: "${currentSentence}"

Generate EXACTLY 4 highly relevant, intuitive, one-tap response tiles that the user would realistically want to choose next.
Format your response as a STRICT JSON array of 4 objects:
[
  { "label": "Short Title", "speak_text": "Full sentence to speak aloud", "icon": "Relevant single emoji", "category": "needs|feelings|routine|medical" }
]
Output ONLY valid JSON.`;

        let predictiveTiles = null;

        // Try Groq Llama-3.3-70B
        const groqKey = (customKey && customKey.startsWith("gsk_")) ? customKey : env.GROQ_API_KEY;
        if (groqKey) {
          try {
            const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${groqKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: systemPrompt }],
                response_format: { type: "json_object" },
                temperature: 0.3,
              }),
            });

            if (groqRes.ok) {
              const groqData = await groqRes.json();
              const raw = groqData.choices?.[0]?.message?.content;
              const parsed = JSON.parse(raw);
              predictiveTiles = Array.isArray(parsed) ? parsed : (parsed.tiles || parsed.predictions || Object.values(parsed)[0]);
            }
          } catch (err) {
            console.warn("Groq prediction failed:", err.message);
          }
        }

        // Try Gemini if Groq did not succeed
        const geminiKey = (customKey && customKey.startsWith("AIza")) ? customKey : env.GEMINI_API_KEY;
        if (geminiKey && !predictiveTiles) {
          try {
            const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
                  generationConfig: {
                    temperature: 0.3,
                    response_mime_type: "application/json",
                  },
                }),
              }
            );

            if (geminiRes.ok) {
              const geminiData = await geminiRes.json();
              const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                const parsed = JSON.parse(text);
                predictiveTiles = Array.isArray(parsed) ? parsed : (parsed.tiles || parsed.predictions || Object.values(parsed)[0]);
              }
            }
          } catch (e) {
            console.warn("Gemini prediction failed:", e.message);
          }
        }

        // Workers AI Fallback
        if (env.AI && !predictiveTiles) {
          try {
            const aiRes = await env.AI.run("@cf/meta/llama-3.3-70b-instruct", {
              prompt: systemPrompt,
            });
            if (aiRes?.response) {
              const match = aiRes.response.match(/\[[\s\S]*\]/);
              if (match) {
                predictiveTiles = JSON.parse(match[0]);
              }
            }
          } catch (e) {
            console.warn("Workers AI prediction failed:", e.message);
          }
        }

        // Intelligent Static Fallback if AI offline
        if (!predictiveTiles || !Array.isArray(predictiveTiles) || predictiveTiles.length < 4) {
          predictiveTiles = [
            { label: "Yes, Please", speak_text: "Yes, please.", icon: "✅", category: "needs" },
            { label: "No, Thank You", speak_text: "No, thank you.", icon: "❌", category: "needs" },
            { label: "Need More Time", speak_text: "Please give me a moment.", icon: "⏳", category: "routine" },
            { label: "I Feel Good", speak_text: "I am feeling comfortable and good right now.", icon: "😊", category: "feelings" },
          ];
        }

        return new Response(
          JSON.stringify({ success: true, tiles: predictiveTiles.slice(0, 4) }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (action === "create_tile" && env.DB) {
        const { label, speak_text, icon_symbol = "💬", category = "custom", is_favorite = 0 } = body;
        const id = `aac_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await env.DB.prepare(
          `INSERT INTO aac_phrases (id, category, label, speak_text, icon_symbol, is_favorite, usage_count)
           VALUES (?, ?, ?, ?, ?, ?, 1)`
        ).bind(id, category, label, speak_text, icon_symbol, is_favorite).run();

        return new Response(
          JSON.stringify({ success: true, id, message: "Custom AAC tile added." }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (action === "log_usage" && env.DB && body.id) {
        await env.DB.prepare(
          "UPDATE aac_phrases SET usage_count = usage_count + 1 WHERE id = ?"
        ).bind(body.id).run();

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "Invalid action specified." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || "Failed to process AAC request." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

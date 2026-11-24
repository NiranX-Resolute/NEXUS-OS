/**
 * Cloudflare Pages API: /api/curate
 * Principal EdTech Material Curation Engine
 * Generates:
 * 1. FLASHCARDS: Spaced-repetition Leitner decks with mnemonics
 * 2. QUIZ: Multiple-choice practice questions with distractors & explanations
 * 3. SUMMARY: High-yield concept breakdowns, formulas, and exam takeaways
 *
 * Free-Tier Fallback Hierarchy:
 * Custom Gemini Pro / Groq (User LocalStorage Key) -> Groq Cloud Free API -> Cloudflare Workers AI Free Neurons
 */

function generateId(prefix = "mat") {
  const timestamp = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${rand}`;
}

// Extract and parse JSON safely from LLM output
function extractJsonFromText(rawText) {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Empty response from AI model.");
  }

  // Remove code blocks
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  // First try direct JSON.parse
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Attempt to isolate JSON array [...]
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (e2) {}
    }

    // Attempt to isolate JSON object {...}
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (e3) {}
    }

    throw new Error("Could not parse structured JSON output from AI response.");
  }
}

// Call Google Gemini API
async function callGemini(apiKey, modelName, systemPrompt, userPrompt, jsonMode = false) {
  const model = modelName || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: `${systemPrompt}\n\n${userPrompt}` }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 3000,
      ...(jsonMode ? { responseMimeType: "application/json" } : {})
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned empty candidate content.");
  }
  return text;
}

// Call Groq Cloud API
async function callGroq(apiKey, modelName, systemPrompt, userPrompt, jsonMode = false) {
  const model = modelName || "llama-3.3-70b-versatile";
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const payload = {
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.25,
    max_tokens: 3000,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {})
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq returned empty text response.");
  }
  return content;
}

// Call Cloudflare Workers AI
async function callCloudflareAI(aiBinding, systemPrompt, userPrompt) {
  if (!aiBinding) {
    throw new Error("Cloudflare Workers AI binding is unavailable.");
  }

  // Model fallback: Llama-3.3-70b-instruct or Llama-3.1-8b-instruct
  const model = "@cf/meta/llama-3.3-70b-instruct";
  const result = await aiBinding.run(model, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2,
    max_tokens: 2500
  });

  return result.response || result.result || JSON.stringify(result);
}

// Unified AI Dispatcher
async function dispatchAIRequest(context, systemPrompt, userPrompt, jsonMode = false) {
  const { env, data } = context;
  const customKey = data?.customKey;
  const aiProvider = data?.aiProvider;
  const customModel = data?.customModel;
  const groqEnvKey = env.GROQ_API_KEY;
  const geminiEnvKey = env.GEMINI_API_KEY;

  // 1. If explicit Gemini provider or Gemini API Key (starts with AIza...)
  if (customKey && (aiProvider === "gemini" || customKey.startsWith("AIza"))) {
    try {
      return await callGemini(customKey, customModel, systemPrompt, userPrompt, jsonMode);
    } catch (e) {
      console.warn("[Gemini Custom Error, falling back]", e.message);
    }
  }

  // 2. Custom Groq API Key
  if (customKey && (aiProvider === "groq" || customKey.startsWith("gsk_"))) {
    try {
      return await callGroq(customKey, customModel, systemPrompt, userPrompt, jsonMode);
    } catch (e) {
      console.warn("[Groq Custom Error, falling back]", e.message);
    }
  }

  // 3. Environment Groq API Key (0 Cost Free Tier)
  if (groqEnvKey) {
    try {
      return await callGroq(groqEnvKey, customModel || "llama-3.3-70b-versatile", systemPrompt, userPrompt, jsonMode);
    } catch (e) {
      console.warn("[Groq Env Key Error, falling back]", e.message);
    }
  }

  // 4. Environment Gemini Key
  if (geminiEnvKey) {
    try {
      return await callGemini(geminiEnvKey, customModel || "gemini-1.5-flash", systemPrompt, userPrompt, jsonMode);
    } catch (e) {
      console.warn("[Gemini Env Key Error, falling back]", e.message);
    }
  }

  // 5. Cloudflare Workers AI free neuron allowance
  if (env.AI) {
    try {
      return await callCloudflareAI(env.AI, systemPrompt, userPrompt);
    } catch (e) {
      console.error("[Cloudflare AI Error]", e.message);
      throw new Error(`Workers AI execution failed: ${e.message}. Please configure a Groq or Gemini API key in Settings.`);
    }
  }

  throw new Error("No AI Provider configured. Please provide a free Groq or Google Gemini API key in Settings.");
}

// POST: Trigger Curation for a Document
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
    const { document_id, material_type, focus_topic } = body;

    if (!document_id) {
      return new Response(
        JSON.stringify({ error: "Missing document_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const validTypes = ["SUMMARY", "FLASHCARDS", "QUIZ"];
    const typeUpper = (material_type || "").toUpperCase();
    if (!validTypes.includes(typeUpper)) {
      return new Response(
        JSON.stringify({ error: "Invalid material_type", allowed: validTypes }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Retrieve document
    const doc = await db
      .prepare("SELECT id, title, subject, raw_content FROM documents WHERE id = ?")
      .bind(document_id)
      .first();

    if (!doc) {
      return new Response(
        JSON.stringify({ error: "Document Not Found", document_id }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Truncate safely if huge to fit context window
    const contentExcerpt = doc.raw_content.slice(0, 16000);

    let systemPrompt = "";
    let userPrompt = "";
    let isJson = false;

    if (typeUpper === "FLASHCARDS") {
      isJson = true;
      systemPrompt = `You are a cognitive psychology specialist and master educator implementing the Leitner Spaced Repetition learning methodology.
Extract high-yield concepts, definitions, formulas, and mechanisms from the source text.
You MUST reply with a strict JSON object containing a "flashcards" array:
{
  "flashcards": [
    {
      "front": "Clear concept, term, or question",
      "back": "Concise, precise explanation or definition (under 3 sentences)",
      "mnemonic": "Clever memory aid, vivid acronym, or everyday analogy"
    }
  ]
}
Generate between 6 and 12 high-impact cards. Ensure cards test active recall rather than passive recognition.`;

      userPrompt = `Subject: ${doc.subject}\nTitle: ${doc.title}${focus_topic ? `\nFocus Topic: ${focus_topic}` : ""}\n\nSource Material:\n${contentExcerpt}`;

    } else if (typeUpper === "QUIZ") {
      isJson = true;
      systemPrompt = `You are an expert academic examiner and test designer.
Create a rigorous, multi-faceted practice exam based strictly on the source material.
Generate between 5 and 8 multiple-choice questions.
You MUST reply with a strict JSON object containing a "quiz" array:
{
  "quiz": [
    {
      "question": "Engaging, clear question testing conceptual understanding or application",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_idx": 0,
      "explanation": "Detailed pedagogical explanation of why this answer is correct and why common distractors are incorrect."
    }
  ]
}
Ensure correct_idx is an integer (0, 1, 2, or 3). Randomize the correct option index across questions.`;

      userPrompt = `Subject: ${doc.subject}\nTitle: ${doc.title}${focus_topic ? `\nFocus Topic: ${focus_topic}` : ""}\n\nSource Material:\n${contentExcerpt}`;

    } else if (typeUpper === "SUMMARY") {
      isJson = false;
      systemPrompt = `You are an elite academic tutor creating a structured, high-yield NotebookLM-style study guide.
Synthesize the source material into clean, beautifully formatted Markdown with:
1. 📌 **Executive Overview**: High-level thesis and core purpose (2-3 sentences).
2. 🧠 **Core Concepts & Architecture**: Deep dive into essential principles with clear bullet points and bold terms.
3. 📐 **Key Formulas, Laws & Definitions**: Explicitly formatted math/terms.
4. ⚠️ **High-Frequency Exam Traps & Misconceptions**: Common student mistakes and how to avoid them.
5. 🎯 **Active Recall Questions**: 3 probing questions for the student to test their retention.
Keep the tone encouraging, lucid, and intellectually rigorous. Use Markdown formatting.`;

      userPrompt = `Subject: ${doc.subject}\nTitle: ${doc.title}${focus_topic ? `\nFocus Topic: ${focus_topic}` : ""}\n\nSource Material:\n${contentExcerpt}`;
    }

    // Call AI engine
    const rawAiResponse = await dispatchAIRequest(context, systemPrompt, userPrompt, isJson);

    let parsedContent;
    let contentJsonString;

    if (typeUpper === "FLASHCARDS") {
      const parsedObj = extractJsonFromText(rawAiResponse);
      const cards = Array.isArray(parsedObj) ? parsedObj : (parsedObj.flashcards || parsedObj.cards || []);
      if (!Array.isArray(cards) || cards.length === 0) {
        throw new Error("AI did not produce valid flashcard entries.");
      }
      parsedContent = cards.map(c => ({
        front: c.front || c.question || "Concept",
        back: c.back || c.answer || "Explanation",
        mnemonic: c.mnemonic || ""
      }));
      contentJsonString = JSON.stringify(parsedContent);
    } else if (typeUpper === "QUIZ") {
      const parsedObj = extractJsonFromText(rawAiResponse);
      const questions = Array.isArray(parsedObj) ? parsedObj : (parsedObj.quiz || parsedObj.questions || []);
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error("AI did not produce valid quiz questions.");
      }
      parsedContent = questions.map(q => ({
        question: q.question,
        options: Array.isArray(q.options) ? q.options : ["Option A", "Option B", "Option C", "Option D"],
        correct_idx: typeof q.correct_idx === "number" ? q.correct_idx : 0,
        explanation: q.explanation || "Correct answer based on source text."
      }));
      contentJsonString = JSON.stringify(parsedContent);
    } else {
      // SUMMARY
      parsedContent = {
        markdown: rawAiResponse.trim(),
        title: `${doc.title} - Executive Summary`,
        subject: doc.subject
      };
      contentJsonString = JSON.stringify(parsedContent);
    }

    // Persist to D1 study_materials
    const materialId = generateId("mat");
    await db
      .prepare(
        "INSERT INTO study_materials (id, document_id, material_type, content_json, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
      )
      .bind(materialId, document_id, typeUpper, contentJsonString)
      .run();

    // If FLASHCARDS, also populate spaced_repetition_cards for the Leitner Box engine!
    let insertedCardsCount = 0;
    if (typeUpper === "FLASHCARDS" && Array.isArray(parsedContent)) {
      for (const card of parsedContent) {
        const cardId = generateId("card");
        const cardBack = card.mnemonic ? `${card.back}\n\n💡 Mnemonic: ${card.mnemonic}` : card.back;
        await db
          .prepare(
            `INSERT INTO spaced_repetition_cards (id, material_id, front, back, box_level, next_review_at)
             VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`
          )
          .bind(cardId, materialId, card.front, cardBack)
          .run();
        insertedCardsCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        material: {
          id: materialId,
          document_id,
          material_type: typeUpper,
          content: parsedContent,
          created_at: new Date().toISOString(),
          cards_created: insertedCardsCount
        }
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Curate POST Error]", err);
    return new Response(
      JSON.stringify({
        error: "Curation Failed",
        message: err.message
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// GET: Retrieve existing study material by material_id or by document_id
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
  const materialId = url.searchParams.get("material_id");
  const docId = url.searchParams.get("document_id");
  const type = url.searchParams.get("type");

  try {
    if (materialId) {
      const mat = await db
        .prepare("SELECT * FROM study_materials WHERE id = ?")
        .bind(materialId)
        .first();

      if (!mat) {
        return new Response(
          JSON.stringify({ error: "Material Not Found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      let parsed = null;
      try {
        parsed = JSON.parse(mat.content_json);
      } catch (_) {
        parsed = mat.content_json;
      }

      return new Response(
        JSON.stringify({
          material: {
            ...mat,
            content: parsed
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (docId) {
      let query = "SELECT * FROM study_materials WHERE document_id = ?";
      const params = [docId];
      if (type) {
        query += " AND material_type = ?";
        params.push(type.toUpperCase());
      }
      query += " ORDER BY created_at DESC";

      const results = await db.prepare(query).bind(...params).all();
      const list = (results.results || []).map(m => {
        let parsed = null;
        try {
          parsed = JSON.parse(m.content_json);
        } catch (_) {
          parsed = m.content_json;
        }
        return { ...m, content: parsed };
      });

      return new Response(
        JSON.stringify({ materials: list }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Provide material_id or document_id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Query Failed", message: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

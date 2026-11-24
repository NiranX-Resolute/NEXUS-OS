/**
 * Cloudflare Pages API: /api/tutor
 * Socratic Conversational Voice Tutor Engine
 * Features:
 * 1. Ultra-Low Latency Speech-to-Text: Groq Whisper (`whisper-large-v3-turbo`) with Cloudflare Workers AI fallback.
 * 2. Socratic Dialogue Engine: Groq Llama-3.3-70b / Google Gemini / Cloudflare Workers AI.
 * 3. Grounded Context: Injects active document notes from D1.
 * 4. Pedagogical Persona Adaptation (Socratic, ELI5, Rigorous Exam, Coding Mentor).
 */

function generateId(prefix = "tut") {
  const timestamp = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${rand}`;
}

const PERSONA_PROMPTS = {
  "Socratic Tutor": `You are an encouraging, expert academic tutor. Help the student understand core concepts using vivid everyday analogies and the Socratic method. Never give monologue lectures; explain the concept concisely in 2-3 sentences and ask a focused check-for-understanding question. Use uploaded study notes as context.`,
  "Explain Like I'm 5 (ELI5)": `You are a fun, brilliant mentor who explains complex academic subjects to a beginner using simple words, playful real-world analogies, and zero unnecessary jargon. Keep your explanation to 2-3 clear sentences and finish with a simple intuitive question.`,
  "Rigorous Exam Prep": `You are an elite academic professor preparing a student for high-stakes exams (MCAT, USMLE, Bar, GRE, AP). Focus on diagnostic precision, high-yield distinctions, formulas, and tricky edge cases. Keep your answer strictly under 3 sentences and conclude with a sharp, board-style question.`,
  "Medical & Clinical": `You are a clinical educator and physician-scientist. Frame all concepts through physiological mechanisms, pathology, and clinical vignettes. Keep explanations concise (2-3 sentences) and ask a diagnostic question.`,
  "Code & Engineering": `You are a Principal Software Engineer and Systems Architect mentor. Explain principles using distributed systems, clean patterns, and time complexity. Explain in 2-3 sentences and ask a practical architectural follow-up question.`
};

// 1. Transcription Handler via Groq Whisper or Cloudflare Workers AI
async function handleTranscription(request, env, data) {
  const customKey = data?.customKey;
  const groqApiKey = (customKey && customKey.startsWith("gsk_")) ? customKey : env.GROQ_API_KEY;

  const contentType = request.headers.get("content-type") || "";
  let audioBytes = null;
  let mimeType = "audio/webm";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") || formData.get("audio");
    if (!file) {
      throw new Error("No audio file found in form data.");
    }
    audioBytes = await file.arrayBuffer();
    mimeType = file.type || "audio/webm";
  } else if (contentType.includes("application/json")) {
    const jsonBody = await request.json();
    if (!jsonBody.audio_base64) {
      throw new Error("Missing audio_base64 in JSON request.");
    }
    const binaryStr = atob(jsonBody.audio_base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    audioBytes = bytes.buffer;
    mimeType = jsonBody.mime_type || "audio/webm";
  } else {
    // Raw binary stream
    audioBytes = await request.arrayBuffer();
    mimeType = contentType.split(";")[0] || "audio/webm";
  }

  if (!audioBytes || audioBytes.byteLength === 0) {
    throw new Error("Audio buffer is empty.");
  }

  // A. Try Groq Whisper API (whisper-large-v3-turbo: ultra fast ~200ms)
  if (groqApiKey) {
    try {
      const groqFormData = new FormData();
      const audioBlob = new Blob([audioBytes], { type: mimeType });
      groqFormData.append("file", audioBlob, "audio.webm");
      groqFormData.append("model", "whisper-large-v3-turbo");
      groqFormData.append("temperature", "0");
      groqFormData.append("response_format", "json");

      const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
        },
        body: groqFormData,
      });

      if (groqRes.ok) {
        const groqJson = await groqRes.json();
        return groqJson.text || "";
      } else {
        const errText = await groqRes.text();
        console.warn("[Groq Whisper Failed, trying CF AI]", errText);
      }
    } catch (e) {
      console.warn("[Groq Whisper Exception]", e.message);
    }
  }

  // B. Fallback to Cloudflare Workers AI Whisper
  if (env.AI) {
    try {
      const uint8 = new Uint8Array(audioBytes);
      const cfResponse = await env.AI.run("@cf/openai/whisper", {
        audio: [...uint8],
      });
      return cfResponse.text || "";
    } catch (cfErr) {
      console.error("[Cloudflare Whisper Error]", cfErr);
      throw new Error("Voice transcription failed across all providers: " + cfErr.message);
    }
  }

  throw new Error("No transcription engine available. Please configure a free Groq API key in Settings.");
}

// 2. Chat Dialogue Handler
async function handleChat(request, env, data) {
  const db = env.DB;
  const body = await request.json();
  const { message, document_id, history = [], persona } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    throw new Error("Message cannot be empty.");
  }

  const selectedPersona = persona || data?.studyPersona || "Socratic Tutor";
  const baseSystemPrompt = PERSONA_PROMPTS[selectedPersona] || PERSONA_PROMPTS["Socratic Tutor"];

  // Grounding context from document
  let documentContext = "";
  if (document_id && db) {
    const doc = await db
      .prepare("SELECT title, subject, raw_content FROM documents WHERE id = ?")
      .bind(document_id)
      .first();

    if (doc) {
      documentContext = `\n\n--- ACTIVE STUDY MATERIAL CONTEXT ---\nSubject: ${doc.subject}\nTitle: ${doc.title}\nContent Excerpt:\n${doc.raw_content.slice(0, 10000)}\n-------------------------------------\n`;
    }
  }

  const systemPrompt = `${baseSystemPrompt}${documentContext}\n\nRemember: Be concise (2-3 sentences), encouraging, use vivid real-world analogies, and always finish with one focused check-for-understanding question.`;

  // Build message history
  const messages = [{ role: "system", content: systemPrompt }];
  if (Array.isArray(history)) {
    // Keep last 6 exchanges for context
    const recentHistory = history.slice(-6);
    for (const h of recentHistory) {
      if (h.role && h.content) {
        messages.push({ role: h.role, content: h.content });
      }
    }
  }
  messages.push({ role: "user", content: message });

  const customKey = data?.customKey;
  const aiProvider = data?.aiProvider;
  const customModel = data?.customModel;
  let replyText = "";

  // 1. Check Gemini Provider
  if (customKey && (aiProvider === "gemini" || customKey.startsWith("AIza"))) {
    try {
      const model = customModel || "gemini-1.5-flash";
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${customKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\nStudent: ${message}` }]
            }
          ],
          generationConfig: { temperature: 0.5, maxOutputTokens: 1000 }
        })
      });
      if (res.ok) {
        const j = await res.json();
        replyText = j.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
    } catch (e) {
      console.warn("[Gemini Chat Fallback]", e.message);
    }
  }

  // 2. Groq Llama-3.3-70b-versatile
  const groqKey = (customKey && customKey.startsWith("gsk_")) ? customKey : env.GROQ_API_KEY;
  if (!replyText && groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: customModel || "llama-3.3-70b-versatile",
          messages: messages,
          temperature: 0.4,
          max_tokens: 1000
        })
      });
      if (res.ok) {
        const j = await res.json();
        replyText = j.choices?.[0]?.message?.content || "";
      }
    } catch (e) {
      console.warn("[Groq Chat Fallback]", e.message);
    }
  }

  // 3. Cloudflare Workers AI Fallback
  if (!replyText && env.AI) {
    try {
      const cfRes = await env.AI.run("@cf/meta/llama-3.3-70b-instruct", {
        messages: messages,
        max_tokens: 1000,
        temperature: 0.3
      });
      replyText = cfRes.response || cfRes.result || "";
    } catch (e) {
      console.error("[CF AI Chat Error]", e);
    }
  }

  if (!replyText) {
    replyText = `That is an excellent study question about this topic! Think of this concept like an everyday delivery network: when requests come in, buffers prevent traffic jams. Does this analogy help clarify the mechanism, or would you like to explore another angle?`;
  }

  // Extract Socratic question if present (usually the last sentence ending in '?')
  let socraticQuestion = "";
  const sentences = replyText.split(/(?<=[.?!])\s+/);
  const lastQuestionSentence = sentences.slice().reverse().find(s => s.trim().endsWith("?"));
  if (lastQuestionSentence) {
    socraticQuestion = lastQuestionSentence.trim();
  }

  // Persist session to D1 tutor_sessions if DB is available
  if (db) {
    try {
      const sessionId = generateId("session");
      await db
        .prepare(
          "INSERT INTO tutor_sessions (id, document_id, user_query, tutor_response, socratic_question, persona, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
        )
        .bind(sessionId, document_id || null, message, replyText, socraticQuestion || null, selectedPersona)
        .run();
    } catch (dbErr) {
      console.warn("[Session Log Failed]", dbErr.message);
    }
  }

  return {
    reply: replyText,
    socratic_question: socraticQuestion,
    document_id: document_id || null,
    persona: selectedPersona,
  };
}

// Main POST handler
export async function onRequestPost(context) {
  const { request, env, data } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    // If action is transcribe or content-type is audio
    const contentType = request.headers.get("content-type") || "";
    if (action === "transcribe" || contentType.startsWith("audio/") || contentType.includes("multipart/form-data")) {
      const transcript = await handleTranscription(request, env, data);
      return new Response(
        JSON.stringify({ success: true, transcript }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Default: Socratic Chat Dialogue
    const chatResult = await handleChat(request, env, data);
    return new Response(
      JSON.stringify({ success: true, ...chatResult }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Tutor Error]", err);
    return new Response(
      JSON.stringify({ error: "Tutor Service Error", message: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// GET: Retrieve past tutor conversations
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

  try {
    let query = "SELECT * FROM tutor_sessions";
    const params = [];
    if (docId) {
      query += " WHERE document_id = ?";
      params.push(docId);
    }
    query += " ORDER BY created_at DESC LIMIT 20";

    const stmt = params.length > 0 ? db.prepare(query).bind(...params) : db.prepare(query);
    const results = await stmt.all();

    return new Response(
      JSON.stringify({ sessions: results.results || [] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to query sessions", message: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

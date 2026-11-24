/**
 * Cloudflare Pages API: /api/tutor
 * Accessible Socratic Oral & AAC Tutor
 * 
 * Features:
 * 1. High-Tolerance Voice Mode: Accommodates dysarthria, stuttering, and slow speech rates
 *    using Groq Whisper (`whisper-large-v3-turbo`) with relaxed prompt conditioning.
 * 2. Non-Verbal Quiz Generator: Generates 4 high-contrast pictogram exam tiles for gaze/switch study.
 * 3. Conversational Socratic Dialogue: 2-3 sentence concept explanations + 1 focus question.
 */

export async function onRequest(context) {
  const { request, env, data } = context;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let action = "socratic_chat"; // 'socratic_chat', 'transcribe', 'generate_quiz', 'evaluate_quiz'
    let studentInput = "";
    let courseContext = "";
    let customKey = data?.customKey;
    let persona = request.headers.get("X-Study-Persona") || "Socratic Oral Tutor";

    // 1. Process Multipart Audio or JSON Payload
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      action = formData.get("action") || "transcribe_and_tutor";
      courseContext = formData.get("context") || "";
      const audioFile = formData.get("audio") || formData.get("file");

      if (audioFile) {
        // High-tolerance STT with Groq Whisper
        const groqKey = (customKey && customKey.startsWith("gsk_")) ? customKey : env.GROQ_API_KEY;
        if (groqKey) {
          try {
            const whisperFormData = new FormData();
            whisperFormData.append("file", audioFile, "student_voice.webm");
            whisperFormData.append("model", "whisper-large-v3-turbo");
            whisperFormData.append("temperature", "0.2");
            // Prompt conditioning specifically tuned to guide Whisper for stuttered/repetitive speech
            whisperFormData.append("prompt", "The speaker may pause, stutter, repeat syllables, or speak slowly. Transcribe their intended academic thoughts completely without truncating.");

            const whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
              method: "POST",
              headers: { "Authorization": `Bearer ${groqKey}` },
              body: whisperFormData,
            });

            if (whisperRes.ok) {
              const whisperData = await whisperRes.json();
              studentInput = whisperData.text || "";
            }
          } catch (sttErr) {
            console.warn("Groq Whisper error:", sttErr.message);
          }
        }
      }

      if (!studentInput) {
        studentInput = formData.get("student_input") || "Could you explain this study topic to me?";
      }
    } else {
      const body = await request.json();
      action = body.action || "socratic_chat";
      studentInput = body.student_input || body.query || "";
      courseContext = body.context || "";
      if (body.custom_key) customKey = body.custom_key;
    }

    // 2. Action: Non-Verbal Quiz Generation
    if (action === "generate_quiz") {
      const quizPrompt = `You are the Nexus Scholar Non-Verbal Accessible Examiner.
Create an accessible 4-tile multiple choice quiz question based on this study content:
"${courseContext || "Mitochondrial ATP production and cellular respiration"}"

Rules for Accessible Non-Verbal Exam Mode:
- 1 concise, clear question.
- EXACTLY 4 options (A, B, C, D).
- Each option MUST have a distinct, visually memorable emoji icon.
- Return STRICT JSON with this schema:
{
  "question": "Clear, single-concept exam question",
  "options": [
    { "letter": "A", "text": "Option text", "icon": "🍎", "is_correct": false },
    { "letter": "B", "text": "Option text", "icon": "⚡", "is_correct": true },
    { "letter": "C", "text": "Option text", "icon": "💧", "is_correct": false },
    { "letter": "D", "text": "Option text", "icon": "🛡️", "is_correct": false }
  ],
  "explanation": "High-yield Socratic explanation for why option B is correct."
}
Return ONLY valid JSON.`;

      let quizData = null;
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
              messages: [{ role: "user", content: quizPrompt }],
              response_format: { type: "json_object" },
              temperature: 0.3,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            quizData = JSON.parse(data.choices?.[0]?.message?.content);
          }
        } catch (e) {
          console.warn("Quiz generation error:", e.message);
        }
      }

      // Default accessible quiz if offline
      if (!quizData) {
        quizData = {
          question: "Which organelle is responsible for generating the majority of cellular ATP?",
          options: [
            { letter: "A", text: "Nucleus (DNA vault)", icon: "🧬", is_correct: false },
            { letter: "B", text: "Mitochondria (Powerhouse)", icon: "⚡", is_correct: true },
            { letter: "C", text: "Ribosome (Protein factory)", icon: "🧱", is_correct: false },
            { letter: "D", text: "Golgi Apparatus (Packaging)", icon: "📦", is_correct: false }
          ],
          explanation: "Mitochondria conduct oxidative phosphorylation via ATP Synthase, yielding most cellular energy."
        };
      }

      return new Response(
        JSON.stringify({ success: true, quiz: quizData }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Action: Socratic Conversational Dialogue
    const tutorPrompt = `You are Nexus Scholar's Socratic Oral Tutor.
The student has motor, speech, or visual disabilities.
Persona: ${persona}.
Student Speech/Input: "${studentInput}"
Context from study notes: "${courseContext}"

Guidelines:
1. Speak in a warm, patient, and encouraging voice.
2. Limit your explanation to 2 or 3 clear, high-yield sentences using vivid real-world analogies.
3. Finish with EXACTLY 1 focused Socratic check-for-understanding question.
4. Format response strictly as JSON:
{
  "tutor_speech": "Direct oral text for Web Speech API / TTS",
  "key_concept": "1-3 word topic tag",
  "follow_up_question": "The single Socratic check question"
}`;

    let tutorResult = null;

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
            messages: [{ role: "user", content: tutorPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.3,
          }),
        });

        if (groqRes.ok) {
          const parsed = await groqRes.json();
          tutorResult = JSON.parse(parsed.choices?.[0]?.message?.content);
        }
      } catch (e) {
        console.warn("Groq tutor error:", e.message);
      }
    }

    // Fallback: Gemini Pro / Flash
    const geminiKey = (customKey && customKey.startsWith("AIza")) ? customKey : env.GEMINI_API_KEY;
    if (geminiKey && !tutorResult) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: tutorPrompt }] }],
              generationConfig: { temperature: 0.3, response_mime_type: "application/json" },
            }),
          }
        );
        if (geminiRes.ok) {
          const gemData = await geminiRes.json();
          const t = gemData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (t) tutorResult = JSON.parse(t);
        }
      } catch (e) {
        console.warn("Gemini tutor error:", e.message);
      }
    }

    // Fallback: Workers AI
    if (env.AI && !tutorResult) {
      try {
        const aiRes = await env.AI.run("@cf/meta/llama-3.3-70b-instruct", { prompt: tutorPrompt });
        if (aiRes?.response) {
          const m = aiRes.response.match(/\{[\s\S]*\}/);
          if (m) tutorResult = JSON.parse(m[0]);
        }
      } catch (e) {
        console.warn("Workers AI tutor error:", e.message);
      }
    }

    // Static encouraging fallback
    if (!tutorResult) {
      tutorResult = {
        tutor_speech: "Great thought! Cellular respiration is essentially like a water turbine: hydrogen ions build up pressure, and as they rush through ATP Synthase, they spin the rotor to lock energy into ATP.",
        key_concept: "ATP Synthase",
        follow_up_question: "What do you think happens to that turbine if oxygen isn't around to catch the electrons at the end?"
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        transcribed_speech: studentInput,
        response: tutorResult,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to process tutor dialogue." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

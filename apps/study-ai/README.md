# 🎓 Nexus Study AI — Socratic Audio Tutor & NotebookLM Ecosystem

> **Principal EdTech & Systems AI Architecture**  
> An open-source, zero-cost student study ecosystem combining automated textbook curation (concept summaries, Leitner spaced-repetition flashcards, adaptive practice exams) and a real-time Socratic voice companion.

---

## ⚡ Zero-Cost Infrastructure Matrix (100% Free Tiers, Zero Cards)

| Layer | Technology | Free Tier Provision | Cost |
| :--- | :--- | :--- | :--- |
| **Frontend & PWA** | Cloudflare Pages | Unmetered CDN traffic, global edge delivery | **$0.00** |
| **Edge Compute** | Cloudflare Pages Functions | 100,000 edge invocations / day | **$0.00** |
| **Database & Storage** | Cloudflare D1 (SQLite) | 5 GB serverless database, 5M reads/day | **$0.00** |
| **PDF Extraction** | Client-Side PDF.js | 100% browser-executed parsing (zero server load) | **$0.00** |
| **Voice Transcription** | Groq Cloud API | `whisper-large-v3-turbo` (<250ms latency) | **$0.00** |
| **Material Curation** | Groq Cloud API | `llama-3.3-70b-versatile` structured JSON output | **$0.00** |
| **AI Fallback** | Cloudflare Workers AI | Keyless `@cf/meta/llama-3.3-70b-instruct` | **$0.00** |
| **Voice Output** | Web Speech API / Edge-TTS | Browser native synthesis (zero cloud tokens) | **$0.00** |

---

## 📂 Directory Structure

```text
nexus-study-ai/
├── frontend/                     # Cloudflare Pages PWA
│   ├── index.html                # Dark-mode student workspace (Library, Deck, Audio HUD)
│   ├── app.js                    # Client controller, PDF.js parsing, Web Audio & Speech
│   ├── manifest.json             # Installable PWA mobile configuration
│   └── sw.js                     # Offline caching service worker
├── functions/                    # Cloudflare Pages Edge Functions
│   ├── _middleware.js            # CORS handling, auth token & custom headers
│   └── api/
│       ├── documents.js          # Ingestion & chunking of notes & textbooks
│       ├── curate.js             # Generates summaries, flashcard decks & quizzes
│       ├── flashcards.js         # Leitner Box 1-5 spaced repetition engine in D1
│       └── tutor.js              # Socratic voice tutor conversational engine
├── desktop_agent/                # Local Desktop Companion (Python + Edge-TTS)
│   ├── nexus_study_daemon.py     # Voice tutor & flashcard audio reader
│   └── requirements.txt          # edge-tts, pygame, requests
├── schema.sql                    # Cloudflare D1 Database Schema
├── wrangler.toml                 # Cloudflare configuration
└── README.md                     # Architectural documentation & quickstart
```

---

## 🚀 Quickstart & Deployment Instructions

### 1. Initialize Cloudflare D1 Database
From within the `nexus-study-ai` directory, run:

```bash
# 1. Create the serverless D1 database
npx wrangler d1 create nexus-study-db
```

*Note: Copy the returned `database_id` and replace the placeholder in `wrangler.toml` under `[[d1_databases]]`.*

### 2. Apply Database Schema
Execute the D1 schema locally or remotely:

```bash
# Apply schema to local development D1 database:
npx wrangler d1 execute nexus-study-db --local --file=schema.sql

# Apply schema to production Cloudflare D1:
npx wrangler d1 execute nexus-study-db --remote --file=schema.sql
```

### 3. Start Local Development
Run the local Pages development server with D1 binding:

```bash
npx wrangler pages dev frontend --d1=nexus-study-db
```
The app will be accessible at: **`http://localhost:8788`**.

---

## 🧠 Core Pedagogical Systems

### 1. Leitner Spaced Repetition Engine (Boxes 1 to 5)
Every generated flashcard enters **Box 1** in Cloudflare D1. Student ratings adjust review schedules mathematically:

- **Box 1**: Daily reinforcement (Interval: 1 day; reset to 10m on failure)
- **Box 2**: Early recall (Interval: 3 days)
- **Box 3**: Mid-term consolidation (Interval: 7 days)
- **Box 4**: Extended retention (Interval: 14 days)
- **Box 5**: Semantic mastery (Interval: 30 days)

### 2. Socratic Voice Tutor HUD
- **Real-Time Mic Visualizer**: Uses the Web Audio API `AnalyserNode` to render live waveform animations in an HTML5 canvas.
- **Microsecond Transcription**: Streams audio buffers to Groq Whisper (`whisper-large-v3-turbo`) with fallback to Cloudflare Workers AI Whisper.
- **Pedagogical Persona**: Explains concepts concisely in 2-3 sentences using everyday analogies and poses targeted check-for-understanding questions.
- **Zero-Token Voice Output**: Plays speech through the native browser `window.speechSynthesis` API without consuming any GPU audio credits.

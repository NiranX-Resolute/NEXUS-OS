# 🎓 Nexus Scholar — Accessible Student Studio & EdTech Suite

> **Principal EdTech & Assistive Systems Architecture**  
> An open-source, 100% zero-cost AI study ecosystem tailored specifically for disabled students (visual impairments, dyslexia, ADHD, motor limitations, dysarthria/stuttering, and non-verbal communication).

---

## ⚡ Zero-Cost Infrastructure Matrix (100% Free Tiers ONLY, Zero Credit Cards)

| Layer | Component | Free Tier Provision | Cost |
| :--- | :--- | :--- | :--- |
| **Frontend PWA** | Cloudflare Pages | Unmetered global CDN delivery, WCAG 2.2 AAA | **$0.00** |
| **Edge Compute** | Cloudflare Pages Functions | 100,000 edge invocations / day | **$0.00** |
| **Edge Database** | Cloudflare D1 (SQLite) | 5 GB serverless storage, 5M reads / day | **$0.00** |
| **Hands-Free Gaze** | WebGazer.js CDN | Client-side webcam pupil tracking & dwell engine | **$0.00** |
| **Diagram Sonifier** | Gemini Pro / Workers AI | Multimodal chart, formula, and anatomical parsing | **$0.00** |
| **High-Tolerance STT** | Groq Whisper | `whisper-large-v3-turbo` with dysarthria/stutter tolerance | **$0.00** |
| **Socratic Engine** | Groq Llama-3.3-70B | Concise Socratic tutoring + dynamic 4-tile quiz generator | **$0.00** |
| **Audio Readouts** | Browser Web Speech API | Client-side instant speech synthesis & audio cues | **$0.00** |

---

## 📂 Project Structure

```text
nexus-scholar/
├── frontend/
│   ├── index.html          # Accessible Student Workspace (WCAG 2.2 AAA compliant)
│   ├── app.js              # Application coordinator & state machine
│   ├── reader.js           # Dyslexia fonts, Bionic Reading, ADHD focus ruler, micro-chunking
│   ├── gaze_study.js       # WebGazer.js integration, Leitner 5-box flashcards, dwell click
│   ├── manifest.json       # Installable PWA manifest
│   └── sw.js               # Offline caching service worker
├── functions/
│   ├── _middleware.js      # Global CORS and Developer Key normalization
│   └── api/
│       ├── sonify.js       # Hierarchical diagram & formula audio sonifier
│       ├── tutor.js        # Socratic oral tutor & non-verbal 4-tile quiz generator
│       ├── documents.js    # Document ingestion & 3-minute concept micro-chunking
│       └── flashcards.js   # Leitner 5-box spaced repetition engine in D1
├── schema.sql              # Cloudflare D1 Database Schema
├── wrangler.toml           # Cloudflare Pages & D1 bindings configuration
└── README.md               # Architecture & quickstart guide
```

---

## 🔬 Specialized Accessibility Study Modules

### 1. Diagram & Formula Sonifier (`functions/api/sonify.js`)
- Allows blind and low-vision students to upload textbook charts, math formulas, biology diagrams, and circuits.
- Generates a **3-Tier Hierarchical Audio Walkthrough**:
  1. **Tier 1 (High-Level Summary):** Structural orientation (e.g. *"A bar graph illustrating regional population from 2000 to 2025"*).
  2. **Tier 2 (Granular Breakdown):** Individual data points, anatomical flows, or variables.
  3. **Tier 3 (Exam Takeaway):** The core tested principle or rate-limiting takeaway.
- Immediately synthesizes and speaks the walkthrough aloud via Text-to-Speech.

### 2. Cognitive & Neurodivergent Reading Engine (`frontend/reader.js`)
- **Dyslexia Mode:** Toggles OpenDyslexic typography with increased letter-spacing (`0.12em`) and line-height (`2.0`).
- **Bionic Reading Filter:** Dynamically wraps the first 40-50% (first 2-3 letters) of every word in high-contrast bold tags to eliminate eye strain and visual skipping.
- **ADHD Reading Ruler / Mask:** A horizontal high-contrast focus bar that smoothly follows mouse cursor or WebGazer gaze coordinates, isolating 1-2 lines of text at a time.
- **Micro-Chunking Agent:** Summarizes long textbook chapters into bite-sized **3-minute concept cards** with dedicated audio scripts.

### 3. Hands-Free Gaze Study Workspace (`frontend/gaze_study.js`)
- Gaze-operated flashcards powered by `WebGazer.js` and assistive external switches (Space / Enter).
- **1200ms Dwell Action:** Lingering gaze on "Flip Card" reveals the answer; lingering on "Easy", "Medium", or "Hard" logs ratings directly into the Cloudflare D1 Leitner Spaced Repetition engine (Box 1 through 5).

### 4. Socratic Oral & AAC Tutor (`functions/api/tutor.js`)
- **High-Tolerance Voice Mode:** Configured with relaxed speech thresholds and prompt conditioning on Groq Whisper to prevent premature audio cutoffs for students who stutter or speak slowly.
- **Non-Verbal Quiz Arena:** Converts multiple-choice exam questions into 4 large, high-contrast pictogram tiles (A, B, C, D) for dwell- or switch-based answering.

---

## 🚀 Quickstart & Deployment

### Run Locally:
```bash
# Within the nexus-scholar folder:
npx wrangler pages dev frontend --d1 DB=nexus-scholar-db
```

### Deploy to Cloudflare Pages (100% Free):
```bash
# 1. Create serverless D1 database:
npx wrangler d1 create nexus-scholar-db

# 2. Apply database schema:
npx wrangler d1 execute nexus-scholar-db --file=./schema.sql

# 3. Deploy Pages project:
npx wrangler pages deploy frontend --project-name nexus-scholar
```

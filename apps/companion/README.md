# 🤝 Nexus Companion — Universal Daily Living Assistive Web Agent

> **Principal Assistive Technology & Systems Architecture**  
> An open-source, 100% zero-cost daily living companion designed for individuals of all ages with motor, visual, non-verbal, and cognitive disabilities.

---

## ⚡ Zero-Cost Architecture (100% Free Tiers ONLY, Zero Credit Cards)

| Layer | Component | Free Tier Provision | Cost |
| :--- | :--- | :--- | :--- |
| **Frontend PWA** | Cloudflare Pages | Unmetered global CDN delivery, WCAG 2.2 AAA | **$0.00** |
| **Edge Compute** | Cloudflare Pages Functions | 100,000 edge requests / day | **$0.00** |
| **Edge Database** | Cloudflare D1 (SQLite) | 5 GB serverless storage, 5M reads / day | **$0.00** |
| **Hands-Free Gaze** | WebGazer.js CDN | Client-side webcam pupil tracking & dwell engine | **$0.00** |
| **AAC Pictograms** | OpenAAC / Mulberry | Standardized high-contrast visual communication tiles | **$0.00** |
| **Vision Model** | Gemini Pro / Workers AI | Multimodal scene & medicine label inspection | **$0.00** |
| **Predictive Tiles** | Groq Llama-3.3-70B | Dynamic 4-tile generative conversation suggestions | **$0.00** |
| **Speech Engine** | Browser Web Speech API | Client-side instant speech synthesis & audio cues | **$0.00** |

---

## 📂 Project Structure

```text
nexus-companion/
├── frontend/
│   ├── index.html          # Accessible PWA (WCAG AAA High-Contrast, Gaze Targets)
│   ├── app.js              # Application controller & state machine
│   ├── gaze_input.js       # WebGazer.js integration, EMA smoothing, 1200ms dwell ring, single switch
│   ├── aac_board.js        # High-contrast Mulberry tiles, sentence strip, generative predictive tiles
│   ├── manifest.json       # Installable PWA manifest
│   └── sw.js               # Offline caching service worker
├── functions/
│   ├── _middleware.js      # Global CORS and Developer Key normalization
│   └── api/
│       ├── describe_scene.js # Vision AI analysis (Medicine, Obstacles, Reading, Household)
│       ├── alert.js        # Emergency SOS with location telemetry in D1
│       ├── aac.js          # Dynamic 4-tile generative prediction & phrase CRUD
│       └── routines.js     # Scheduled daily routine cue cards in D1
├── schema.sql              # Cloudflare D1 Database Schema
├── wrangler.toml           # Cloudflare Pages & D1 bindings configuration
└── README.md               # Architecture & quickstart guide
```

---

## 🎯 Core Assistive Modules

### 1. Universal Input & Eye-Gaze Calibration (`frontend/gaze_input.js`)
- **Pupil Tracking:** Seamless integration with `WebGazer.js` using standard built-in laptop or external webcams.
- **Exponential Moving Average (EMA):** Applied to raw gaze coordinates (`alpha = 0.35`) to eliminate eye jitter.
- **1200ms Dwell Action Engine:** When the gaze lingers over any tile or button for 1.2 seconds, a circular SVG ring animates around the target and triggers an accessible synthetic click.
- **Single-Switch Auto-Scanning:** Built-in sequential scanner for single-switch or keyboard spacebar users with 1.0s to 3.0s interval options.
- **9-Point Calibration:** Interactive calibration grid to refine webcam tracking accuracy.

### 2. Visual Scene & Medicine Describer (`functions/api/describe_scene.js`)
- Takes camera snapshots of surroundings, pill bottles, room layouts, or household items.
- Analyzes labels, expiration dates, dosages, and safety hazards using Google Gemini Vision, Groq Vision, or Cloudflare Workers AI.
- Automatically reads results aloud using the Web Speech API.

### 3. Conversational AAC Board (`frontend/aac_board.js`)
- Structured categories: **Basic Needs**, **Medical & Pain**, **Feelings**, and **Daily Routine**.
- Instant tap or gaze-to-speak synthesis.
- **Generative Predictive Tiles:** As phrases are spoken, the edge engine generates 4 contextually relevant response tiles for rapid 1-dwell replies.

### 4. Emergency SOS & Telemetry Dispatcher (`functions/api/alert.js`)
- Giant high-contrast SOS button with an auditory 3-second safety abort timer.
- Captures precision GPS coordinates, battery level, and logs alert incidents to Cloudflare D1.

---

## 🚀 Local Development & Deployment

### Run Locally:
```bash
# Within the nexus-companion folder:
npx wrangler pages dev frontend --d1 DB=nexus-companion-db
```

### Deploy to Cloudflare Pages (100% Free):
```bash
# 1. Create serverless D1 database:
npx wrangler d1 create nexus-companion-db

# 2. Apply database schema:
npx wrangler d1 execute nexus-companion-db --file=./schema.sql

# 3. Deploy Pages project:
npx wrangler pages deploy frontend --project-name nexus-companion
```

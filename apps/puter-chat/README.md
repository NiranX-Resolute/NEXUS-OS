# Nexus Puter AI Chat

An AI chat application powered by **Puter.js** (`https://js.puter.com/v2/`), integrated with the **Nexus AI** ecosystem as a primary multi-model hub and resilient high-availability backup.

## Key Features

- **Frontier Multi-Model Access**: Instant access to 500+ frontier AI models from OpenAI, Anthropic, Google, DeepSeek, Meta, Mistral, Alibaba, xAI, and more.
- **Custom Model Selection**: Use any model ID (e.g. `claude-3-7-sonnet`, `deepseek/deepseek-r1`, `gpt-4o`, `meta-llama/llama-3.3-70b-instruct`, or custom model aliases) without requiring personal API keys.
- **Real-Time Streaming**: Low-latency token-by-token streaming with markdown rendering, LaTeX math (KaTeX), and syntax-highlighted code blocks with one-click copy.
- **Puter Cloud Storage & Sync**: Multi-turn chat session history with cloud backup to Puter Key-Value Store (`puter.kv`) and local storage fallback.
- **Puter Authentication**: Integrated sign-in via Puter accounts (`puter.auth`).
- **Multimodal Inputs**: Attach images and documents for vision analysis.
- **Voice & Speech**: Web Speech recognition for voice input and speech synthesis playback.
- **Nexus AI Backup**: Integrated directly into Nexus Desktop (`Nexus-desktop-`) and Nexus Web (`frontend/`) to automatically take over if primary providers fail.

## Quick Start

Puter.js requires an HTTP origin:

```bash
# Run using the python server
python server.py

# Or with Node.js
npx serve .
```

Then visit `http://localhost:8088`.

---
*Powered by [Puter.js](https://developer.puter.com)*

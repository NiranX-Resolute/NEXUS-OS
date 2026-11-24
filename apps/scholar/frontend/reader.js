/**
 * Nexus Scholar: Cognitive & Neurodivergent Reading Engine
 * 
 * Features:
 * 1. Dyslexia Mode: Toggle OpenDyslexic typography, increased letter-spacing, and line-height.
 * 2. Bionic Reading Filter: Auto-bolds the initial fixation anchor (first 2-3 letters) of every word.
 * 3. Reading Ruler / Mask: Movable high-contrast horizontal focus bar following cursor/gaze for ADHD focus.
 * 4. Micro-Chunking Viewer: Displays 3-minute bite-sized concept cards with instant TTS.
 */

class CognitiveReaderEngine {
  constructor() {
    this.isDyslexiaMode = localStorage.getItem("nexus_dyslexia_mode") === "true";
    this.isBionicMode = localStorage.getItem("nexus_bionic_mode") === "true";
    this.isRulerActive = localStorage.getItem("nexus_ruler_active") === "true";
    this.rulerHeight = parseInt(localStorage.getItem("nexus_ruler_height") || "60", 10);

    this.initRulerDOM();
    this.applySettings();
    this.bindEvents();
  }

  initRulerDOM() {
    let ruler = document.getElementById("adhd-reading-ruler");
    if (!ruler) {
      ruler = document.createElement("div");
      ruler.id = "adhd-reading-ruler";
      ruler.style.cssText = `
        position: fixed;
        left: 0;
        top: 200px;
        width: 100vw;
        height: ${this.rulerHeight}px;
        background: rgba(255, 255, 0, 0.15);
        border-top: 3px solid #ffff00;
        border-bottom: 3px solid #ffff00;
        pointer-events: none;
        z-index: 9998;
        display: ${this.isRulerActive ? "block" : "none"};
        box-shadow: 0 0 30px rgba(255, 255, 0, 0.25);
        transition: top 0.06s ease-out;
      `;
      document.body.appendChild(ruler);
    }
    this.rulerEl = ruler;
  }

  bindEvents() {
    // Reading Ruler tracks cursor or gaze coordinates smoothly
    window.addEventListener("mousemove", (e) => {
      if (this.isRulerActive && this.rulerEl) {
        const topPos = e.clientY - (this.rulerHeight / 2);
        this.rulerEl.style.top = `${Math.max(60, topPos)}px`;
      }
    });

    // If Gaze Tracking is active, ruler can track smoothed gaze coordinates
    window.addEventListener("gazeMove", (e) => {
      if (this.isRulerActive && this.rulerEl && e.detail?.y) {
        const topPos = e.detail.y - (this.rulerHeight / 2);
        this.rulerEl.style.top = `${Math.max(60, topPos)}px`;
      }
    });
  }

  toggleDyslexiaMode() {
    this.isDyslexiaMode = !this.isDyslexiaMode;
    localStorage.setItem("nexus_dyslexia_mode", this.isDyslexiaMode);
    this.applySettings();
    return this.isDyslexiaMode;
  }

  toggleBionicMode() {
    this.isBionicMode = !this.isBionicMode;
    localStorage.setItem("nexus_bionic_mode", this.isBionicMode);
    this.refreshTextContent();
    return this.isBionicMode;
  }

  toggleReadingRuler() {
    this.isRulerActive = !this.isRulerActive;
    localStorage.setItem("nexus_ruler_active", this.isRulerActive);
    if (this.rulerEl) {
      this.rulerEl.style.display = this.isRulerActive ? "block" : "none";
    }
    return this.isRulerActive;
  }

  setRulerHeight(heightPx) {
    this.rulerHeight = heightPx;
    localStorage.setItem("nexus_ruler_height", heightPx);
    if (this.rulerEl) {
      this.rulerEl.style.height = `${heightPx}px`;
    }
  }

  applySettings() {
    const textContainer = document.getElementById("study-reading-pane");
    if (!textContainer) return;

    if (this.isDyslexiaMode) {
      textContainer.classList.add("dyslexia-font");
    } else {
      textContainer.classList.remove("dyslexia-font");
    }
  }

  /**
   * Transforms raw text into Bionic Reading format
   * Bolds the fixation anchor: first half of each word.
   */
  toBionicHtml(text) {
    if (!text) return "";
    return text.split(/\s+/).map(word => {
      if (word.length <= 1) return `<b>${word}</b>`;
      if (word.length <= 3) return `<b>${word.slice(0, 1)}</b>${word.slice(1)}`;
      const anchorLen = Math.ceil(word.length * 0.45);
      const boldPart = word.slice(0, anchorLen);
      const rest = word.slice(anchorLen);
      return `<b>${boldPart}</b>${rest}`;
    }).join(" ");
  }

  renderArticle(rawText, title = "Course Notes") {
    const container = document.getElementById("study-reading-pane");
    if (!container) return;

    const formattedContent = this.isBionicMode ? this.toBionicHtml(rawText) : rawText;

    container.innerHTML = `
      <article class="accessible-article">
        <h2 class="article-title">${title}</h2>
        <div class="article-body">${formattedContent}</div>
      </article>
    `;

    this.applySettings();
  }

  refreshTextContent() {
    const raw = window.currentDocumentRawText || "";
    const title = window.currentDocumentTitle || "Study Notes";
    this.renderArticle(raw, title);
  }
}

// Global instance
window.cognitiveReader = new CognitiveReaderEngine();

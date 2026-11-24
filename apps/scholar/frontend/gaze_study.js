/**
 * Nexus Scholar: Hands-Free Gaze Study Workspace & Flashcard Engine
 * 
 * Features:
 * 1. WebGazer.js pupil tracking with EMA smoothing for study interfaces.
 * 2. Gaze-Operated Flashcards:
 *    - Dwell over "Flip Card" to reveal answers.
 *    - Dwell over "Easy / Medium / Hard" to log Leitner Box ratings into D1.
 * 3. Non-Verbal Quiz Dwell Arena: Dwell over Option A, B, C, D to answer questions.
 * 4. Single-Switch Scanning Mode (Space / Enter) for physical switches.
 */

class GazeStudyWorkspace {
  constructor() {
    this.mode = localStorage.getItem("scholar_input_mode") || "gaze";
    this.dwellTimeMs = parseInt(localStorage.getItem("scholar_dwell_time") || "1200", 10);
    this.switchScanSpeedMs = parseInt(localStorage.getItem("scholar_switch_speed") || "1500", 10);
    this.isTracking = false;

    // Smoothed Gaze Coordinates
    this.smoothedX = window.innerWidth / 2;
    this.smoothedY = window.innerHeight / 2;
    this.smoothingAlpha = 0.35;

    // Dwell State
    this.currentDwellTarget = null;
    this.dwellStartTime = 0;
    this.hasTriggeredDwell = false;

    // Switch Scanning State
    this.switchTargets = [];
    this.currentSwitchIndex = -1;
    this.switchScanInterval = null;

    // Flashcard Deck State
    this.deck = [];
    this.currentCardIndex = 0;
    this.isCardFlipped = false;

    this.initAudio();
    this.initGazeCursor();
    this.bindEvents();
    this.loadDeck();
  }

  initAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioCtx = new AudioCtx();
    } catch (e) {}
  }

  playPop(freq = 550, duration = 0.07) {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === "suspended") this.audioCtx.resume();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {}
  }

  initGazeCursor() {
    let cursor = document.getElementById("scholar-gaze-cursor");
    if (!cursor) {
      cursor = document.createElement("div");
      cursor.id = "scholar-gaze-cursor";
      cursor.innerHTML = `
        <svg class="dwell-svg" width="64" height="64" viewBox="0 0 64 64">
          <circle class="dwell-bg" cx="32" cy="32" r="26" />
          <circle class="dwell-progress" id="scholar-dwell-circle" cx="32" cy="32" r="26" stroke-dasharray="163.36" stroke-dashoffset="163.36" />
        </svg>
        <div class="gaze-dot"></div>
      `;
      document.body.appendChild(cursor);
    }
    this.gazeCursor = cursor;
    this.dwellCircle = document.getElementById("scholar-dwell-circle");

    if (this.mode !== "gaze") {
      this.gazeCursor.style.display = "none";
    }
  }

  bindEvents() {
    window.addEventListener("keydown", (e) => {
      if (this.mode === "switch" && (e.code === "Space" || e.code === "Enter")) {
        e.preventDefault();
        this.activateCurrentSwitchTarget();
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.isTracking) {
        this.updateGazePosition(e.clientX, e.clientY);
      }
    });
  }

  // ============================================================================
  // WebGazer.js Integration
  // ============================================================================
  async startWebGazer() {
    if (typeof webgazer === "undefined") {
      await this.loadWebGazerScript();
    }

    try {
      const statusPill = document.getElementById("scholar-gaze-status");
      if (statusPill) statusPill.textContent = "Calibrating Pupil Tracker...";

      await webgazer.setRegression("ridge")
        .setGazeListener((data) => {
          if (!data) return;
          this.updateGazePosition(data.x, data.y);
        })
        .saveDataAcrossSessions(true)
        .begin();

      webgazer.showVideoPreview(true)
        .showPredictionPoints(false)
        .applyKalmanFilter(true);

      const videoContainer = document.getElementById("webgazerVideoContainer");
      if (videoContainer) {
        videoContainer.style.position = "fixed";
        videoContainer.style.bottom = "20px";
        videoContainer.style.right = "20px";
        videoContainer.style.width = "160px";
        videoContainer.style.height = "120px";
        videoContainer.style.borderRadius = "12px";
        videoContainer.style.border = "3px solid #38bdf8";
        videoContainer.style.zIndex = "9999";
        videoContainer.style.overflow = "hidden";
      }

      this.isTracking = true;
      this.gazeCursor.style.display = "block";
      if (statusPill) {
        statusPill.textContent = `Eye-Gaze Active (${(this.dwellTimeMs / 1000).toFixed(1)}s Dwell)`;
        statusPill.classList.add("active");
      }
      this.playPop(780, 0.1);
    } catch (err) {
      console.warn("WebGazer error in Scholar:", err);
    }
  }

  stopWebGazer() {
    if (typeof webgazer !== "undefined" && this.isTracking) {
      try { webgazer.end(); } catch (e) {}
    }
    this.isTracking = false;
    const statusPill = document.getElementById("scholar-gaze-status");
    if (statusPill) {
      statusPill.textContent = "Eye Tracking Paused";
      statusPill.classList.remove("active");
    }
  }

  loadWebGazerScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://webgazer.cs.brown.edu/webgazer.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load WebGazer CDN."));
      document.head.appendChild(script);
    });
  }

  updateGazePosition(x, y) {
    this.smoothedX += (x - this.smoothedX) * this.smoothingAlpha;
    this.smoothedY += (y - this.smoothedY) * this.smoothingAlpha;

    const clampedX = Math.max(10, Math.min(window.innerWidth - 10, this.smoothedX));
    const clampedY = Math.max(10, Math.min(window.innerHeight - 10, this.smoothedY));

    if (this.gazeCursor && this.mode === "gaze") {
      this.gazeCursor.style.transform = `translate3d(${clampedX - 32}px, ${clampedY - 32}px, 0)`;
    }

    // Fire custom event for ADHD Reading Ruler tracking
    window.dispatchEvent(new CustomEvent("gazeMove", { detail: { x: clampedX, y: clampedY } }));

    if (this.mode === "gaze") {
      this.processDwellHitTest(clampedX, clampedY);
    }
  }

  processDwellHitTest(x, y) {
    this.gazeCursor.style.pointerEvents = "none";
    const element = document.elementFromPoint(x, y);
    const target = element ? element.closest(".gaze-target, button, .interactive-card") : null;

    if (target) {
      if (this.currentDwellTarget === target) {
        if (!this.hasTriggeredDwell) {
          const elapsed = performance.now() - this.dwellStartTime;
          const progress = Math.min(1, elapsed / this.dwellTimeMs);
          this.updateDwellRing(progress);

          if (progress >= 1) {
            this.triggerDwellAction(target);
          }
        }
      } else {
        this.resetDwellState();
        this.currentDwellTarget = target;
        this.dwellStartTime = performance.now();
        this.hasTriggeredDwell = false;
        target.classList.add("gaze-hover");
        this.playPop(440, 0.04);
      }
    } else {
      this.resetDwellState();
    }
  }

  updateDwellRing(progress) {
    if (!this.dwellCircle) return;
    const offset = 163.36 * (1 - progress);
    this.dwellCircle.style.strokeDashoffset = offset;
  }

  resetDwellState() {
    if (this.currentDwellTarget) {
      this.currentDwellTarget.classList.remove("gaze-hover");
      this.currentDwellTarget = null;
    }
    this.dwellStartTime = 0;
    this.hasTriggeredDwell = false;
    this.updateDwellRing(0);
  }

  triggerDwellAction(target) {
    this.hasTriggeredDwell = true;
    this.playPop(800, 0.08);

    target.classList.add("gaze-activated");
    setTimeout(() => target.classList.remove("gaze-activated"), 350);

    target.click();

    setTimeout(() => {
      this.resetDwellState();
    }, 400);
  }

  // ============================================================================
  // Switch Scanning Mode
  // ============================================================================
  refreshSwitchTargets() {
    const elements = Array.from(document.querySelectorAll(".gaze-target, button, .interactive-card"));
    this.switchTargets = elements.filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
  }

  startSwitchScanning() {
    this.stopSwitchScanning();
    this.refreshSwitchTargets();
    if (this.switchTargets.length === 0) return;

    this.currentSwitchIndex = 0;
    this.highlightSwitchTarget(this.switchTargets[0]);

    this.switchScanInterval = setInterval(() => {
      this.advanceSwitchScanning();
    }, this.switchScanSpeedMs);
  }

  advanceSwitchScanning() {
    this.refreshSwitchTargets();
    if (this.switchTargets.length === 0) return;

    if (this.switchTargets[this.currentSwitchIndex]) {
      this.switchTargets[this.currentSwitchIndex].classList.remove("switch-highlight");
    }

    this.currentSwitchIndex = (this.currentSwitchIndex + 1) % this.switchTargets.length;
    this.highlightSwitchTarget(this.switchTargets[this.currentSwitchIndex]);
  }

  highlightSwitchTarget(target) {
    if (!target) return;
    target.classList.add("switch-highlight");
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    this.playPop(480, 0.04);
  }

  activateCurrentSwitchTarget() {
    if (this.currentSwitchIndex >= 0 && this.switchTargets[this.currentSwitchIndex]) {
      const activeEl = this.switchTargets[this.currentSwitchIndex];
      this.playPop(880, 0.09);
      activeEl.click();
    }
  }

  stopSwitchScanning() {
    if (this.switchScanInterval) {
      clearInterval(this.switchScanInterval);
      this.switchScanInterval = null;
    }
    document.querySelectorAll(".switch-highlight").forEach(el => el.classList.remove("switch-highlight"));
  }

  // ============================================================================
  // Gaze Flashcard Workspace (Leitner 5-Box Spaced Repetition)
  // ============================================================================
  async loadDeck() {
    try {
      const res = await fetch("/api/flashcards");
      const data = await res.json();
      this.deck = data.cards || [];
      this.currentCardIndex = 0;
      this.isCardFlipped = false;
      this.renderFlashcard();
    } catch (e) {
      console.warn("Flashcards load error:", e);
    }
  }

  renderFlashcard() {
    const cardEl = document.getElementById("study-flashcard");
    const countEl = document.getElementById("flashcard-counter");
    const boxEl = document.getElementById("flashcard-leitner-box");
    if (!cardEl) return;

    if (this.deck.length === 0) {
      cardEl.innerHTML = `
        <div class="fc-prompt" style="font-size: 24px;">🎉 All cards reviewed! Great study session.</div>
      `;
      return;
    }

    const card = this.deck[this.currentCardIndex];
    if (countEl) countEl.textContent = `Card ${this.currentCardIndex + 1} of ${this.deck.length}`;
    if (boxEl) boxEl.textContent = `Leitner Box ${card.box_level || 1} / 5`;

    cardEl.innerHTML = `
      <div class="fc-badge">${this.isCardFlipped ? "💡 ANSWER" : "❓ QUESTION"}</div>
      <div class="fc-content">${this.isCardFlipped ? card.answer : card.question}</div>
      <div class="fc-hint">${this.isCardFlipped ? "Dwell below to rate difficulty:" : "Dwell on 'Flip Card' to reveal answer"}</div>
    `;

    // Speak content aloud
    const textToSpeak = this.isCardFlipped ? "Answer: " + card.answer : "Question: " + card.question;
    window.speechSynthesis?.cancel();
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(textToSpeak));
  }

  flipCard() {
    this.isCardFlipped = !this.isCardFlipped;
    this.renderFlashcard();
  }

  async rateCard(rating) {
    if (this.deck.length === 0) return;
    const card = this.deck[this.currentCardIndex];

    try {
      await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_id: card.id, rating }),
      });
    } catch (e) {}

    // Advance to next card
    this.currentCardIndex = (this.currentCardIndex + 1) % this.deck.length;
    this.isCardFlipped = false;
    this.renderFlashcard();
  }
}

// Global instance
window.gazeStudy = new GazeStudyWorkspace();

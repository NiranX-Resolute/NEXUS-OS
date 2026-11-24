/**
 * Nexus Companion: Universal Input & Gaze Calibration Engine
 * 
 * Features:
 * 1. WebGazer.js CDN integration for hands-free webcam pupil tracking.
 * 2. Exponential Moving Average (EMA) coordinate smoothing to eliminate jitter.
 * 3. 1200ms Dwell Action Engine: Animated SVG circular progress ring, audio click feedback.
 * 4. Single-Switch Scanning Mode: Spacebar / Enter / External switch sequential scanning (1s - 3s).
 * 5. Interactive 9-Point Calibration System.
 */

class UniversalInputManager {
  constructor() {
    this.mode = localStorage.getItem("nexus_input_mode") || "gaze"; // 'gaze' | 'switch' | 'touch'
    this.dwellTimeMs = parseInt(localStorage.getItem("nexus_dwell_time") || "1200", 10);
    this.switchScanSpeedMs = parseInt(localStorage.getItem("nexus_switch_speed") || "1500", 10);
    this.isWebgazerReady = false;
    this.isTracking = false;
    this.isCalibrating = false;

    // Smoothed Gaze Coordinates
    this.rawX = window.innerWidth / 2;
    this.rawY = window.innerHeight / 2;
    this.smoothedX = this.rawX;
    this.smoothedY = this.rawY;
    this.smoothingAlpha = 0.35; // Lower = smoother, Higher = more responsive

    // Dwell State
    this.currentDwellTarget = null;
    this.dwellStartTime = 0;
    this.dwellAnimFrame = null;
    this.hasTriggeredDwell = false;

    // Switch Scanning State
    this.switchTargets = [];
    this.currentSwitchIndex = -1;
    this.switchScanInterval = null;

    // Audio Context for accessible feedback
    this.audioCtx = null;

    this.initDOM();
    this.initAudio();
    this.bindEvents();
  }

  initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    } catch (e) {
      console.warn("AudioContext init error:", e);
    }
  }

  playBeep(freq = 600, duration = 0.08, type = "sine") {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  playSuccessChime() {
    this.playBeep(520, 0.06, "sine");
    setTimeout(() => this.playBeep(784, 0.1, "sine"), 60);
  }

  initDOM() {
    // 1. Create Gaze Cursor and Animated Dwell Ring Element
    let gazeCursor = document.getElementById("nexus-gaze-cursor");
    if (!gazeCursor) {
      gazeCursor = document.createElement("div");
      gazeCursor.id = "nexus-gaze-cursor";
      gazeCursor.innerHTML = `
        <svg class="dwell-svg" width="64" height="64" viewBox="0 0 64 64">
          <circle class="dwell-bg" cx="32" cy="32" r="26" />
          <circle class="dwell-progress" id="nexus-dwell-circle" cx="32" cy="32" r="26" stroke-dasharray="163.36" stroke-dashoffset="163.36" />
        </svg>
        <div class="gaze-dot"></div>
      `;
      document.body.appendChild(gazeCursor);
    }
    this.gazeCursor = gazeCursor;
    this.dwellCircle = document.getElementById("nexus-dwell-circle");

    // Hide gaze cursor if not in gaze mode
    if (this.mode !== "gaze") {
      this.gazeCursor.style.display = "none";
    }
  }

  bindEvents() {
    // Single Switch Keyboard Listeners: Spacebar or Enter
    window.addEventListener("keydown", (e) => {
      if (this.mode === "switch") {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          this.activateCurrentSwitchTarget();
        }
      }
    });

    // Touch/Mouse Gaze Emulation for testing or hybrid mode
    window.addEventListener("mousemove", (e) => {
      if (!this.isTracking) {
        this.updateGazePosition(e.clientX, e.clientY);
      }
    });

    // Window resize coordinate bounds check
    window.addEventListener("resize", () => {
      this.refreshSwitchTargets();
    });
  }

  // ============================================================================
  // WebGazer.js Integration & Calibration
  // ============================================================================
  async startWebGazer() {
    if (typeof webgazer === "undefined") {
      console.warn("WebGazer CDN not yet loaded. Loading dynamically...");
      await this.loadWebGazerScript();
    }

    try {
      const statusEl = document.getElementById("gaze-status-pill");
      if (statusEl) statusEl.textContent = "Calibrating Camera...";

      await webgazer.setRegression("ridge")
        .setGazeListener((data, elapsedTime) => {
          if (data == null) return;
          this.rawX = data.x;
          this.rawY = data.y;
          this.updateGazePosition(this.rawX, this.rawY);
        })
        .saveDataAcrossSessions(true)
        .begin();

      // Configure WebGazer video preview
      webgazer.showVideoPreview(true)
        .showPredictionPoints(false)
        .applyKalmanFilter(true);

      // Reposition video preview to floating corner
      const videoContainer = document.getElementById("webgazerVideoContainer");
      if (videoContainer) {
        videoContainer.style.position = "fixed";
        videoContainer.style.bottom = "20px";
        videoContainer.style.right = "20px";
        videoContainer.style.width = "160px";
        videoContainer.style.height = "120px";
        videoContainer.style.borderRadius = "12px";
        videoContainer.style.border = "3px solid var(--accent-color, #ffff00)";
        videoContainer.style.zIndex = "9999";
        videoContainer.style.overflow = "hidden";
        videoContainer.style.boxShadow = "0 8px 30px rgba(0,0,0,0.6)";
      }

      this.isTracking = true;
      this.isWebgazerReady = true;
      this.gazeCursor.style.display = "block";

      if (statusEl) {
        statusEl.textContent = "Gaze Active (Dwell: " + (this.dwellTimeMs / 1000).toFixed(1) + "s)";
        statusEl.classList.add("active");
      }
      this.playSuccessChime();
    } catch (err) {
      console.error("WebGazer initialization error:", err);
      const statusEl = document.getElementById("gaze-status-pill");
      if (statusEl) statusEl.textContent = "Webcam Unavailable (Mouse Emulation)";
    }
  }

  stopWebGazer() {
    if (typeof webgazer !== "undefined" && this.isTracking) {
      try {
        webgazer.end();
      } catch (e) {}
    }
    this.isTracking = false;
    const statusEl = document.getElementById("gaze-status-pill");
    if (statusEl) {
      statusEl.textContent = "Eye Tracking Paused";
      statusEl.classList.remove("active");
    }
  }

  loadWebGazerScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://webgazer.cs.brown.edu/webgazer.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load WebGazer.js CDN."));
      document.head.appendChild(script);
    });
  }

  // ============================================================================
  // Gaze Pointer Smoothing & Dwell Engine
  // ============================================================================
  updateGazePosition(x, y) {
    // Apply Exponential Moving Average (EMA)
    this.smoothedX += (x - this.smoothedX) * this.smoothingAlpha;
    this.smoothedY += (y - this.smoothedY) * this.smoothingAlpha;

    // Constrain within viewport
    const clampedX = Math.max(10, Math.min(window.innerWidth - 10, this.smoothedX));
    const clampedY = Math.max(10, Math.min(window.innerHeight - 10, this.smoothedY));

    // Update cursor DOM coordinates
    if (this.gazeCursor && this.mode === "gaze") {
      this.gazeCursor.style.transform = `translate3d(${clampedX - 32}px, ${clampedY - 32}px, 0)`;
    }

    // Process Dwell Hit Testing if not in calibration
    if (!this.isCalibrating && this.mode === "gaze") {
      this.processDwellHitTest(clampedX, clampedY);
    }
  }

  processDwellHitTest(x, y) {
    // Hide cursor temporarily to elementFromPoint
    this.gazeCursor.style.pointerEvents = "none";
    const elementUnderGaze = document.elementFromPoint(x, y);

    // Look for closest interactive dwell target
    const target = elementUnderGaze ? elementUnderGaze.closest(".gaze-target, button, .interactive-card, input[type='checkbox']") : null;

    if (target) {
      if (this.currentDwellTarget === target) {
        // Continue dwelling on current target
        if (!this.hasTriggeredDwell) {
          const elapsed = performance.now() - this.dwellStartTime;
          const progress = Math.min(1, elapsed / this.dwellTimeMs);
          this.updateDwellRing(progress);

          if (progress >= 1) {
            this.triggerDwellAction(target);
          }
        }
      } else {
        // Switched to a new target
        this.resetDwellState();
        this.currentDwellTarget = target;
        this.dwellStartTime = performance.now();
        this.hasTriggeredDwell = false;
        target.classList.add("gaze-hover");
        this.playBeep(440, 0.04, "triangle");
      }
    } else {
      // Moved off interactive targets
      this.resetDwellState();
    }
  }

  updateDwellRing(progress) {
    if (!this.dwellCircle) return;
    const circumference = 2 * Math.PI * 26; // ~163.36
    const offset = circumference * (1 - progress);
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
    this.playSuccessChime();

    // Visual ripple effect
    target.classList.add("gaze-activated");
    setTimeout(() => target.classList.remove("gaze-activated"), 400);

    // Dispatch synthetic click event
    target.click();

    // Reset progress ring with brief cooldown
    setTimeout(() => {
      this.resetDwellState();
    }, 400);
  }

  // ============================================================================
  // Single-Switch Scanning Mode
  // ============================================================================
  setMode(newMode) {
    this.mode = newMode;
    localStorage.setItem("nexus_input_mode", newMode);

    if (newMode === "gaze") {
      this.stopSwitchScanning();
      this.gazeCursor.style.display = "block";
      this.startWebGazer();
    } else if (newMode === "switch") {
      this.stopWebGazer();
      this.gazeCursor.style.display = "none";
      this.startSwitchScanning();
    } else {
      // Touch / Mouse standard mode
      this.stopWebGazer();
      this.stopSwitchScanning();
      this.gazeCursor.style.display = "none";
    }

    const modePill = document.getElementById("input-mode-pill");
    if (modePill) {
      modePill.textContent = newMode.toUpperCase() + " MODE";
    }
  }

  refreshSwitchTargets() {
    // Collect all visible interactive elements
    const elements = Array.from(document.querySelectorAll(".gaze-target, button, .interactive-card"));
    this.switchTargets = elements.filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
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

    // Clear previous highlight
    if (this.switchTargets[this.currentSwitchIndex]) {
      this.switchTargets[this.currentSwitchIndex].classList.remove("switch-highlight");
    }

    this.currentSwitchIndex = (this.currentSwitchIndex + 1) % this.switchTargets.length;
    const nextTarget = this.switchTargets[this.currentSwitchIndex];
    this.highlightSwitchTarget(nextTarget);
  }

  highlightSwitchTarget(target) {
    if (!target) return;
    target.classList.add("switch-highlight");
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    this.playBeep(480, 0.05, "sine");
  }

  activateCurrentSwitchTarget() {
    if (this.currentSwitchIndex >= 0 && this.switchTargets[this.currentSwitchIndex]) {
      const activeEl = this.switchTargets[this.currentSwitchIndex];
      this.playSuccessChime();
      activeEl.classList.add("switch-activated");
      setTimeout(() => activeEl.classList.remove("switch-activated"), 300);
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
  // 9-Point Gaze Calibration Modal
  // ============================================================================
  openCalibration() {
    this.isCalibrating = true;
    const modal = document.getElementById("calibration-modal");
    if (!modal) return;
    modal.style.display = "flex";

    const dots = document.querySelectorAll(".calib-dot");
    let completedDots = 0;

    dots.forEach((dot) => {
      dot.style.opacity = "1";
      dot.dataset.clicks = "0";
      dot.className = "calib-dot";

      dot.onclick = () => {
        let clicks = parseInt(dot.dataset.clicks || "0", 10) + 1;
        dot.dataset.clicks = clicks;
        this.playBeep(500 + clicks * 80, 0.08);

        if (clicks >= 4) {
          dot.classList.add("calibrated");
          completedDots++;
          if (completedDots >= dots.length) {
            setTimeout(() => {
              this.playSuccessChime();
              modal.style.display = "none";
              this.isCalibrating = false;
              alert("WebGazer calibration complete! Pupil tracking is now active.");
            }, 500);
          }
        }
      };
    });
  }

  closeCalibration() {
    const modal = document.getElementById("calibration-modal");
    if (modal) modal.style.display = "none";
    this.isCalibrating = false;
  }
}

// Global instance exposed for app integration
window.universalInput = new UniversalInputManager();

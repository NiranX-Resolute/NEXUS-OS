/**
 * Nexus Companion: Conversational AAC Board & Generative Predictive Tiles
 * 
 * Implements:
 * 1. High-contrast pictogram symbol board (Basic Needs, Medical, Feelings, Daily Routine).
 * 2. Instant Gaze/Tap-to-Speak speech synthesis via Web Speech API.
 * 3. Dynamic Generative 4-Tile Predictive strip (AI-powered quick replies for non-verbal users).
 * 4. Sentence strip builder and custom phrase creation.
 */

class AACBoardManager {
  constructor() {
    this.currentCategory = "needs";
    this.sentenceStrip = [];
    this.speechSynth = window.speechSynthesis;
    this.selectedVoice = null;
    this.speechRate = parseFloat(localStorage.getItem("nexus_speech_rate") || "1.0");
    this.speechPitch = parseFloat(localStorage.getItem("nexus_speech_pitch") || "1.0");

    // Standard High-Contrast Mulberry / OpenAAC Inspired Symbol Sets
    this.symbolLibrary = {
      needs: [
        { id: "n_eat", label: "Eat", text: "I want to eat food.", icon: "🍎", color: "#ffd700" },
        { id: "n_drink", label: "Drink", text: "I need a drink of water.", icon: "💧", color: "#64b5f6" },
        { id: "n_restroom", label: "Restroom", text: "I need to use the restroom.", icon: "🚻", color: "#81c784" },
        { id: "n_sleep", label: "Sleep", text: "I am tired and want to sleep.", icon: "🛌", color: "#ba68c8" },
        { id: "n_pain", label: "Pain", text: "I am in pain.", icon: "🩹", color: "#e57373" },
        { id: "n_cold", label: "Cold", text: "I feel cold.", icon: "❄️", color: "#4fc3f7" },
        { id: "n_hot", label: "Hot", text: "I feel too hot.", icon: "🔥", color: "#ff8a65" },
        { id: "n_help", label: "Help", text: "Please help me.", icon: "🆘", color: "#ff5252" },
        { id: "n_yes", label: "Yes", text: "Yes.", icon: "✅", color: "#66bb6a" },
        { id: "n_no", label: "No", text: "No, thank you.", icon: "❌", color: "#ef5350" },
        { id: "n_more", label: "More", text: "More, please.", icon: "➕", color: "#ffb74d" },
        { id: "n_stop", label: "Stop", text: "Please stop.", icon: "🛑", color: "#d32f2f" }
      ],
      medical: [
        { id: "m_med", label: "Medicine", text: "I need my medication.", icon: "💊", color: "#4dd0e1" },
        { id: "m_doc", label: "Doctor", text: "Please call the doctor or nurse.", icon: "🩺", color: "#4db6ac" },
        { id: "m_nausea", label: "Nausea", text: "I feel sick to my stomach.", icon: "🤢", color: "#aed581" },
        { id: "m_breathe", label: "Breathe", text: "I am having difficulty breathing.", icon: "🫁", color: "#ff7043" },
        { id: "m_dizzy", label: "Dizzy", text: "I am feeling lightheaded and dizzy.", icon: "💫", color: "#ba68c8" },
        { id: "m_vitals", label: "Check Vitals", text: "Please check my blood pressure and pulse.", icon: "💓", color: "#f06292" },
        { id: "m_adjust", label: "Adjust Bed", text: "Please reposition my bed or wheelchair.", icon: "🛏️", color: "#90a4ae" },
        { id: "m_glasses", label: "Glasses", text: "I need my glasses or vision aid.", icon: "👓", color: "#7986cb" }
      ],
      feelings: [
        { id: "f_happy", label: "Happy", text: "I am happy and doing well.", icon: "😊", color: "#fff176" },
        { id: "f_sad", label: "Sad", text: "I am feeling sad.", icon: "😢", color: "#64b5f6" },
        { id: "f_anxious", label: "Anxious", text: "I am feeling nervous or anxious.", icon: "😰", color: "#ffb74d" },
        { id: "f_tired", label: "Tired", text: "I feel exhausted.", icon: "🥱", color: "#b0bec5" },
        { id: "f_calm", label: "Calm", text: "I feel calm and relaxed.", icon: "😌", color: "#81c784" },
        { id: "f_confused", label: "Confused", text: "I don't understand, I am confused.", icon: "😕", color: "#ba68c8" },
        { id: "f_lonely", label: "Company", text: "I would like someone to stay with me.", icon: "🤝", color: "#4dd0e1" },
        { id: "f_love", label: "Thank You", text: "Thank you very much. I appreciate your help.", icon: "❤️", color: "#f48fb1" }
      ],
      routine: [
        { id: "r_brush", label: "Brush Teeth", text: "I want to brush my teeth.", icon: "🪥", color: "#80deea" },
        { id: "r_wash", label: "Wash Hands", text: "I want to wash my hands.", icon: "🧼", color: "#81d4fa" },
        { id: "r_dress", label: "Get Dressed", text: "I need help getting dressed.", icon: "👕", color: "#a5d6a7" },
        { id: "r_walk", label: "Walk / Move", text: "I want to go for a short walk or stretch.", icon: "🚶", color: "#ffe082" },
        { id: "r_outside", label: "Go Outside", text: "Can we go outside for fresh air?", icon: "🌳", color: "#81c784" },
        { id: "r_music", label: "Music", text: "Please play some music for me.", icon: "🎵", color: "#ce93d8" },
        { id: "r_quiet", label: "Quiet", text: "It is too loud. I need quiet.", icon: "🤫", color: "#90a4ae" },
        { id: "r_phone", label: "Call Family", text: "I want to speak with my family.", icon: "📱", color: "#ffab91" }
      ],
      custom: []
    };

    this.predictiveTiles = [
      { label: "Yes, Please", speak_text: "Yes, please.", icon: "✅" },
      { label: "No, Thank You", speak_text: "No, thank you.", icon: "❌" },
      { label: "Need A Moment", speak_text: "Please give me a moment.", icon: "⏳" },
      { label: "I Am Okay", speak_text: "I am feeling okay right now.", icon: "👍" }
    ];

    this.initVoices();
    this.loadCustomPhrases();
    this.renderCategoryTabs();
    this.renderGrid();
    this.renderPredictiveStrip();
    this.renderSentenceStrip();
  }

  initVoices() {
    if (!this.speechSynth) return;
    const populate = () => {
      const voices = this.speechSynth.getVoices();
      const savedName = localStorage.getItem("nexus_speech_voice");
      if (savedName) {
        this.selectedVoice = voices.find(v => v.name === savedName) || voices[0];
      } else {
        // Prefer natural English voices
        this.selectedVoice = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google"))) || voices[0];
      }
    };
    populate();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = populate;
    }
  }

  speak(text) {
    if (!this.speechSynth || !text) return;
    this.speechSynth.cancel(); // Cancel any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.selectedVoice) utterance.voice = this.selectedVoice;
    utterance.rate = this.speechRate;
    utterance.pitch = this.speechPitch;

    // Visual speaking indicator
    const stripEl = document.getElementById("aac-sentence-strip");
    if (stripEl) {
      stripEl.classList.add("speaking-active");
      utterance.onend = () => stripEl.classList.remove("speaking-active");
    }

    this.speechSynth.speak(utterance);
  }

  loadCustomPhrases() {
    const saved = localStorage.getItem("nexus_custom_aac");
    if (saved) {
      try {
        this.symbolLibrary.custom = JSON.parse(saved);
      } catch (e) {
        console.warn("Error parsing custom aac:", e);
      }
    }
  }

  saveCustomPhrase(label, text, icon = "💬") {
    const item = {
      id: `c_${Date.now()}`,
      label,
      text,
      icon,
      color: "#ffd54f"
    };
    this.symbolLibrary.custom.push(item);
    localStorage.setItem("nexus_custom_aac", JSON.stringify(this.symbolLibrary.custom));
    if (this.currentCategory === "custom") {
      this.renderGrid();
    }
  }

  renderCategoryTabs() {
    const container = document.getElementById("aac-category-nav");
    if (!container) return;

    const categories = [
      { key: "needs", label: "Basic Needs", icon: "🍎" },
      { key: "medical", label: "Medical & Pain", icon: "💊" },
      { key: "feelings", label: "Feelings", icon: "😊" },
      { key: "routine", label: "Daily Routine", icon: "⏰" },
      { key: "custom", label: "Custom Tiles", icon: "⭐" },
    ];

    container.innerHTML = categories.map(cat => `
      <button class="gaze-target aac-cat-btn ${cat.key === this.currentCategory ? "active" : ""}" 
              data-cat="${cat.key}" aria-label="Category: ${cat.label}">
        <span class="cat-icon">${cat.icon}</span>
        <span class="cat-label">${cat.label}</span>
      </button>
    `).join("");

    container.querySelectorAll(".aac-cat-btn").forEach(btn => {
      btn.onclick = () => {
        this.currentCategory = btn.dataset.cat;
        this.renderCategoryTabs();
        this.renderGrid();
      };
    });
  }

  renderGrid() {
    const grid = document.getElementById("aac-tiles-grid");
    if (!grid) return;

    const items = this.symbolLibrary[this.currentCategory] || [];

    grid.innerHTML = items.map(item => `
      <button class="gaze-target aac-tile" data-id="${item.id}" data-text="${item.text}" data-label="${item.label}" data-icon="${item.icon}" style="--tile-color: ${item.color}">
        <div class="aac-tile-icon">${item.icon}</div>
        <div class="aac-tile-label">${item.label}</div>
      </button>
    `).join("");

    // Bind tile dwell & click actions
    grid.querySelectorAll(".aac-tile").forEach(tile => {
      tile.onclick = () => {
        const text = tile.dataset.text;
        const label = tile.dataset.label;
        const icon = tile.dataset.icon;

        // 1. Speak tile immediately
        this.speak(text);

        // 2. Add to sentence strip
        this.sentenceStrip.push({ label, text, icon });
        this.renderSentenceStrip();

        // 3. Trigger Generative AI prediction for next 4 tiles
        this.fetchPredictiveTiles(text);
      };
    });

    // Refresh Switch scanning targets whenever grid updates
    if (window.universalInput) {
      window.universalInput.refreshSwitchTargets();
    }
  }

  renderSentenceStrip() {
    const container = document.getElementById("aac-sentence-content");
    if (!container) return;

    if (this.sentenceStrip.length === 0) {
      container.innerHTML = `<span class="strip-placeholder">Select or gaze at tiles to build your phrase...</span>`;
      return;
    }

    container.innerHTML = this.sentenceStrip.map((item, idx) => `
      <span class="strip-item">
        <span class="strip-item-icon">${item.icon}</span>
        <span class="strip-item-label">${item.label}</span>
      </span>
    `).join("");
  }

  speakSentenceStrip() {
    if (this.sentenceStrip.length === 0) return;
    const fullText = this.sentenceStrip.map(i => i.text).join(" ");
    this.speak(fullText);
  }

  backspaceSentenceStrip() {
    if (this.sentenceStrip.length > 0) {
      this.sentenceStrip.pop();
      this.renderSentenceStrip();
    }
  }

  clearSentenceStrip() {
    this.sentenceStrip = [];
    this.renderSentenceStrip();
  }

  renderPredictiveStrip() {
    const container = document.getElementById("aac-predictive-tiles");
    if (!container) return;

    container.innerHTML = this.predictiveTiles.map((tile, i) => `
      <button class="gaze-target aac-predict-btn" data-text="${tile.speak_text}" aria-label="Predictive tile ${tile.label}">
        <span class="predict-icon">${tile.icon || "💡"}</span>
        <span class="predict-label">${tile.label}</span>
      </button>
    `).join("");

    container.querySelectorAll(".aac-predict-btn").forEach(btn => {
      btn.onclick = () => {
        const text = btn.dataset.text;
        this.speak(text);
        this.fetchPredictiveTiles(text);
      };
    });
  }

  async fetchPredictiveTiles(contextText) {
    try {
      const apiKey = localStorage.getItem("nexus_custom_key") || "";
      const currentText = this.sentenceStrip.map(i => i.label).join(" ");

      const res = await fetch("/api/aac", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Custom-Key": apiKey,
        },
        body: JSON.stringify({
          action: "predict",
          context: contextText,
          current_sentence: currentText,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.tiles && Array.isArray(data.tiles)) {
          this.predictiveTiles = data.tiles;
          this.renderPredictiveStrip();
        }
      }
    } catch (e) {
      console.warn("Dynamic AAC prediction request error:", e);
    }
  }
}

// Global instance
window.aacBoard = new AACBoardManager();

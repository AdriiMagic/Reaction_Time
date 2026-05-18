/**
 * Reaction Pro - Core Game Engine
 * 
 * Includes:
 * 1. Web Audio API Synth Engine (No external sound dependencies)
 * 2. High-precision performance.now() timer engine
 * 3. LocalStorage persistence for settings & statistics
 * 4. Custom Canvas Confetti particles for High Score achievements
 * 5. Keyboard support (Spacebar) & mobile touch interactions
 */

// ==========================================================================
// 1. SOUND GENERATION SYSTEM (Web Audio API Synthesizer)
// ==========================================================================
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  /**
   * Initializes the AudioContext upon user interaction.
   * Browsers restrict audio from auto-playing without user consent.
   */
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume context if browser suspended it
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Plays a dynamically synthesized raw audio frequency tone.
   */
  playTone(freq, type, duration, volumeStart = 0.1, pitchSlideEnd = null) {
    if (this.muted) return;

    try {
      this.init();

      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      // Perform a pitch slide if defined (e.g. rising/falling retro arcade SFX)
      if (pitchSlideEnd !== null) {
        osc.frequency.exponentialRampToValueAtTime(pitchSlideEnd, this.ctx.currentTime + duration);
      }

      gainNode.gain.setValueAtTime(volumeStart, this.ctx.currentTime);
      // Exponentially decay volume to zero to prevent annoying speaker clicks
      gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio Context Playback Failed. Awaiting more active user gesture.", e);
    }
  }

  playCountdownTick() {
    // A short medium-pitch retro pulse
    this.playTone(600, 'sine', 0.08, 0.12);
  }

  playGoBeep() {
    // A high-pitched, crisp beep indicating green light
    this.playTone(1000, 'sine', 0.25, 0.15, 1200);
  }

  playSuccessChime() {
    if (this.muted) return;
    this.init();

    // Pleasant arpeggiated C-Major chords
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 'sine', 0.45, 0.08);
      }, idx * 80);
    });
  }

  playFalseStartBuzzer() {
    // A low warning square-wave buzz
    this.playTone(120, 'square', 0.35, 0.06, 80);
  }

  playToggleSound() {
    // Quick pleasant UI click
    this.playTone(400, 'sine', 0.05, 0.05, 600);
  }
}

const soundEngine = new SoundEngine();


// ==========================================================================
// 2. CONFETTI GENERATION SYSTEM (HTML5 Canvas Particle Physics)
// ==========================================================================
class ConfettiEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    this.animationFrame = null;
    this.active = false;

    // Handle resizing dynamically
    window.addEventListener('resize', () => {
      if (this.active) this.resizeCanvas();
    });
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  start() {
    this.active = true;
    this.resizeCanvas();
    this.particles = [];

    // Spawn 100 confetti pieces with randomized positions and velocities
    for (let i = 0; i < 100; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height - this.canvas.height, // spawn offscreen
        r: Math.random() * 6 + 4,
        d: Math.random() * this.canvas.height,
        color: this.colors[Math.floor(Math.random() * this.colors.length)],
        tilt: Math.random() * 10 - 5,
        tiltAngleIncremental: Math.random() * 0.07 + 0.02,
        tiltAngle: 0,
        vy: Math.random() * 3 + 4, // vertical speed
        vx: Math.random() * 2 - 1  // horizontal drift
      });
    }

    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.loop();
  }

  stop() {
    this.active = false;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  loop() {
    if (!this.active) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let remaining = false;

    this.particles.forEach((p) => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += p.vy;
      p.x += p.vx + Math.sin(p.tiltAngle) * 0.5; // slight wave float
      p.tilt = Math.sin(p.tiltAngle - p.r / 2) * 8;

      if (p.y <= this.canvas.height) {
        remaining = true;
      }

      // Draw particle as a rotating ribbon shape
      this.ctx.beginPath();
      this.ctx.lineWidth = p.r;
      this.ctx.strokeStyle = p.color;
      this.ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      this.ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      this.ctx.stroke();
    });

    if (remaining) {
      this.animationFrame = requestAnimationFrame(() => this.loop());
    } else {
      this.stop();
    }
  }
}


// ==========================================================================
// 3. CORE GAME GAMEPLAY STATE ENGINE
// ==========================================================================
const GameState = {
  IDLE: 'idle',
  COUNTDOWN: 'countdown',
  WAITING: 'waiting',
  REACTION: 'react',
  RESULT: 'result',
  FALSE_START: 'early'
};

class GameEngine {
  constructor() {
    this.currentState = GameState.IDLE;

    // Core timing vars
    this.countdownTimer = null;
    this.greenLightTimeout = null;
    this.startTime = 0; // high-precision performance.now()
    this.reactionTime = 0;

    // Stats tracking (persisted via LocalStorage)
    this.bestScore = Infinity;
    this.attemptsHistory = [];
    this.maxHistoryLength = 5;

    // Confetti
    this.confetti = new ConfettiEngine('confetti-canvas');

    // DOM selectors cache
    this.cacheDOMElements();

    // Set settings and event registers
    this.loadSettings();
    this.registerEventListeners();
    this.renderStats();
  }

  cacheDOMElements() {
    this.reactionZone = document.getElementById('reaction-zone');

    // Game screens
    this.screens = {
      [GameState.IDLE]: document.getElementById('screen-welcome'),
      [GameState.COUNTDOWN]: document.getElementById('screen-countdown'),
      [GameState.WAITING]: document.getElementById('screen-waiting'),
      [GameState.REACTION]: document.getElementById('screen-react'),
      [GameState.RESULT]: document.getElementById('screen-result'),
      [GameState.FALSE_START]: document.getElementById('screen-early')
    };

    // Buttons
    this.startBtn = document.getElementById('start-btn');
    this.retryBtn = document.getElementById('retry-btn');
    this.restartBtn = document.getElementById('restart-btn');
    this.soundBtn = document.getElementById('sound-btn');
    this.themeBtn = document.getElementById('theme-btn');
    this.resetStatsBtn = document.getElementById('reset-stats-btn');

    // Content containers
    this.countdownNum = document.getElementById('countdown-number');
    this.bestScoreVal = document.getElementById('best-score');
    this.avgScoreVal = document.getElementById('avg-score');
    this.totalAttemptsVal = document.getElementById('total-attempts');
    this.historyList = document.getElementById('history-list');
    this.resultTimeDisplay = document.getElementById('result-time');
    this.resultRating = document.getElementById('result-rating');
    this.resultFeedback = document.getElementById('result-feedback');
    this.resultCrownBadge = document.getElementById('result-crown');
  }

  registerEventListeners() {
    // Action clicks on main game zone
    this.reactionZone.addEventListener('mousedown', (e) => {
      // Don't fire twice if clicking standard buttons inside the screen cards
      if (e.target.tagName.toLowerCase() === 'button') return;
      this.handleZoneAction();
    });

    // Mobile touch optimizations (faster than click delay)
    this.reactionZone.addEventListener('touchstart', (e) => {
      if (e.target.tagName.toLowerCase() === 'button') return;
      e.preventDefault(); // prevent double firing standard click
      this.handleZoneAction();
    }, { passive: false });

    // Keyboard support: Space bar presses
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        // If focusing button, let standard click run, otherwise trigger zone
        if (document.activeElement.tagName.toLowerCase() !== 'button') {
          e.preventDefault();
          this.handleZoneAction();
        }
      }
    });

    // Control button direct handlers
    this.startBtn.addEventListener('click', () => this.startGameFlow());
    this.retryBtn.addEventListener('click', () => this.startGameFlow());
    this.restartBtn.addEventListener('click', () => this.startGameFlow());

    // Toggle items
    this.soundBtn.addEventListener('click', () => this.toggleSound());
    this.themeBtn.addEventListener('click', () => this.toggleTheme());
    this.resetStatsBtn.addEventListener('click', () => this.resetStatistics());
  }

  // Load High Scores & User configuration preferences
  loadSettings() {
    // 1. High Score
    const savedBest = localStorage.getItem('rp_best_score');
    if (savedBest) {
      this.bestScore = parseInt(savedBest, 10);
      this.bestScoreVal.textContent = `${this.bestScore} ms`;
    } else {
      this.bestScore = Infinity;
      this.bestScoreVal.textContent = '-- ms';
    }

    // 2. Full History
    const savedHistory = localStorage.getItem('rp_history');
    if (savedHistory) {
      this.attemptsHistory = JSON.parse(savedHistory);
    }

    // 3. Audio preference
    const soundMuted = localStorage.getItem('rp_muted') === 'true';
    soundEngine.muted = soundMuted;
    this.updateSoundIcon();

    // 4. Dark Theme preference
    const theme = localStorage.getItem('rp_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    this.updateThemeIcon(theme);
  }

  // ==========================================================================
  // STATE MACHINE & SYSTEM STATE CHANGES
  // ==========================================================================
  changeState(newState) {
    // Clean old state classes from zone
    Object.values(GameState).forEach(state => {
      this.reactionZone.classList.remove(state);
    });

    this.currentState = newState;
    this.reactionZone.classList.add(newState);

    // Swap screens
    Object.entries(this.screens).forEach(([state, element]) => {
      if (state === newState) {
        element.classList.add('active');
      } else {
        element.classList.remove('active');
      }
    });

    // Focus the interactive container for Keyboard support accessibility
    this.reactionZone.focus();
  }

  // Handles either clicks or Spacebar hits depending on active states
  handleZoneAction() {
    soundEngine.init(); // ensure Web Audio Context stays alive on active clicks

    switch (this.currentState) {
      case GameState.IDLE:
        this.startGameFlow();
        break;
      case GameState.WAITING:
        this.handleFalseStart();
        break;
      case GameState.REACTION:
        this.handleSuccessfulReaction();
        break;
      case GameState.RESULT:
      case GameState.FALSE_START:
        this.startGameFlow();
        break;
      default:
        break;
    }
  }

  // ==========================================================================
  // GAME LIFECYCLE FLOW ACTIONS
  // ==========================================================================

  startGameFlow() {
    this.confetti.stop();
    this.clearAllTimers();
    this.changeState(GameState.COUNTDOWN);

    let countdownVal = 3;
    this.countdownNum.textContent = countdownVal;
    this.countdownNum.style.transform = 'scale(1)';
    soundEngine.playCountdownTick();

    this.countdownTimer = setInterval(() => {
      countdownVal--;
      if (countdownVal > 0) {
        this.countdownNum.textContent = countdownVal;
        soundEngine.playCountdownTick();
      } else {
        clearInterval(this.countdownTimer);
        this.enterWaitingState();
      }
    }, 1000);
  }

  enterWaitingState() {
    this.changeState(GameState.WAITING);

    // Random waiting delay between 2 and 6 seconds (2000ms - 6000ms)
    const randomDelay = Math.floor(Math.random() * 4001) + 2000;

    this.greenLightTimeout = setTimeout(() => {
      this.triggerGreenScreen();
    }, randomDelay);
  }

  triggerGreenScreen() {
    this.changeState(GameState.REACTION);
    soundEngine.playGoBeep();
    this.startTime = performance.now(); // High precision micro-time
  }

  handleFalseStart() {
    this.clearAllTimers();
    this.changeState(GameState.FALSE_START);
    soundEngine.playFalseStartBuzzer();
  }

  handleSuccessfulReaction() {
    const clickTime = performance.now();
    this.reactionTime = Math.round(clickTime - this.startTime);
    soundEngine.playSuccessChime();

    // Determine performance tier & visual responses
    const tier = this.getPerformanceTier(this.reactionTime);
    this.resultRating.textContent = tier.label;
    this.resultRating.className = `performance-badge ${tier.class}`;
    this.resultFeedback.textContent = tier.feedback;

    // Set time text
    this.resultTimeDisplay.textContent = `${this.reactionTime} ms`;

    // Record highscore check
    let isNewRecord = false;
    if (this.reactionTime < this.bestScore) {
      isNewRecord = true;
      this.bestScore = this.reactionTime;
      localStorage.setItem('rp_best_score', this.bestScore);
      this.bestScoreVal.textContent = `${this.bestScore} ms`;
    }

    if (isNewRecord) {
      this.resultCrownBadge.classList.remove('hidden');
      this.confetti.start(); // Fire local canvas fireworks particle chaser
    } else {
      this.resultCrownBadge.classList.add('hidden');
    }

    // Save attempt parameters and calculate stats
    this.saveAttempt(this.reactionTime, tier.label, tier.class);
    this.changeState(GameState.RESULT);
  }

  // Help calculate delay tier metrics
  getPerformanceTier(ms) {
    if (ms < 200) {
      return {
        label: 'Excellent',
        class: 'excellent',
        feedback: 'Incredible! You possess godlike reaction speeds.'
      };
    } else if (ms >= 200 && ms < 300) {
      return {
        label: 'Great',
        class: 'great',
        feedback: 'Fantastic job! You are well above average human speeds.'
      };
    } else if (ms >= 300 && ms < 450) {
      return {
        label: 'Average',
        class: 'average',
        feedback: 'Very solid. You fall right in line with the standard curve.'
      };
    } else {
      return {
        label: 'Slow',
        class: 'slow',
        feedback: 'A bit sluggish today! Minimize distractions and try again.'
      };
    }
  }

  clearAllTimers() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.greenLightTimeout) clearTimeout(this.greenLightTimeout);
  }

  // ==========================================================================
  // STATISTICS & HISTORY LOGGING
  // ==========================================================================
  saveAttempt(score, ratingLabel, ratingClass) {
    const attempt = {
      id: Date.now(),
      score: score,
      ratingLabel: ratingLabel,
      ratingClass: ratingClass,
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Prepend to array
    this.attemptsHistory.unshift(attempt);

    // Keep history trimmed to recent attempts limit
    if (this.attemptsHistory.length > this.maxHistoryLength) {
      this.attemptsHistory.pop();
    }

    // Save details to localStorage
    localStorage.setItem('rp_history', JSON.stringify(this.attemptsHistory));

    this.renderStats();
  }

  renderStats() {
    // Render list
    this.historyList.innerHTML = '';

    if (this.attemptsHistory.length === 0) {
      this.historyList.innerHTML = `<li class="empty-history">No attempts yet. Start the test above to see your history!</li>`;
      this.avgScoreVal.textContent = '-- ms';
      this.totalAttemptsVal.textContent = '0';
      return;
    }

    // Compute rolling average
    const totalScore = this.attemptsHistory.reduce((sum, item) => sum + item.score, 0);
    const avg = Math.round(totalScore / this.attemptsHistory.length);
    this.avgScoreVal.textContent = `${avg} ms`;

    // Increment completed run total stats
    const totalCompleted = localStorage.getItem('rp_total_completed') || '0';
    const updatedCount = this.currentState === GameState.RESULT ? parseInt(totalCompleted, 10) + 1 : parseInt(totalCompleted, 10);

    if (this.currentState === GameState.RESULT) {
      localStorage.setItem('rp_total_completed', updatedCount);
    }

    this.totalAttemptsVal.textContent = updatedCount;

    // Draw nodes
    this.attemptsHistory.forEach((run, index) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
        <span class="run-label">Attempt #${this.attemptsHistory.length - index}</span>
        <span class="run-badge badge-${run.ratingClass}">${run.ratingLabel}</span>
        <span class="run-score">${run.score} ms</span>
      `;
      this.historyList.appendChild(li);
    });
  }

  resetStatistics() {
    if (confirm("Are you sure you want to completely clear your high score and reaction statistics history? This cannot be undone.")) {
      soundEngine.playToggleSound();

      localStorage.removeItem('rp_best_score');
      localStorage.removeItem('rp_history');
      localStorage.removeItem('rp_total_completed');

      this.bestScore = Infinity;
      this.attemptsHistory = [];

      this.bestScoreVal.textContent = '-- ms';
      this.avgScoreVal.textContent = '-- ms';
      this.totalAttemptsVal.textContent = '0';

      this.confetti.stop();
      this.renderStats();
    }
  }

  // ==========================================================================
  // CONFIGURATION INTERFACE TOGGLES (Sound & Light/Dark Theme)
  // ==========================================================================
  toggleSound() {
    soundEngine.muted = !soundEngine.muted;
    localStorage.setItem('rp_muted', soundEngine.muted);
    this.updateSoundIcon();

    if (!soundEngine.muted) {
      soundEngine.playToggleSound();
    }
  }

  updateSoundIcon() {
    const onIcon = this.soundBtn.querySelector('.sound-on-icon');
    const offIcon = this.soundBtn.querySelector('.sound-off-icon');

    if (soundEngine.muted) {
      onIcon.classList.add('hidden');
      offIcon.classList.remove('hidden');
      this.soundBtn.setAttribute('aria-label', 'Sound Muted');
    } else {
      onIcon.classList.remove('hidden');
      offIcon.classList.add('hidden');
      this.soundBtn.setAttribute('aria-label', 'Sound Active');
    }
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const targetTheme = currentTheme === 'light' ? 'dark' : 'light';

    document.documentElement.setAttribute('data-theme', targetTheme);
    localStorage.setItem('rp_theme', targetTheme);
    this.updateThemeIcon(targetTheme);
    soundEngine.playToggleSound();
  }

  updateThemeIcon(theme) {
    const darkIcon = this.themeBtn.querySelector('.dark-icon');
    const lightIcon = this.themeBtn.querySelector('.light-icon');

    if (theme === 'light') {
      darkIcon.classList.add('hidden');
      lightIcon.classList.remove('hidden');
      this.themeBtn.setAttribute('aria-label', 'Switch to Dark Mode');
    } else {
      darkIcon.classList.remove('hidden');
      lightIcon.classList.add('hidden');
      this.themeBtn.setAttribute('aria-label', 'Switch to Light Mode');
    }
  }
}

// Instantiate engine when DOM is fully prepared
document.addEventListener('DOMContentLoaded', () => {
  window.gameEngine = new GameEngine();
});

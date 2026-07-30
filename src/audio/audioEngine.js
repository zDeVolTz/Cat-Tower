/**
 * Self-contained WebAudio sound synthesizer & Background Music (BGM) Manager with volume controls.
 */

let audioCtx = null;
let muted = false;
let bgmAudio = null;
let musicEnabled = false;
let currentVolume = 0.45;

export const AudioEngine = {
  initMusic(url = "./audio/bgm.mp3") {
    if (!bgmAudio) {
      bgmAudio = new Audio(url);
      bgmAudio.loop = true;
      bgmAudio.volume = currentVolume;
    }
  },

  setVolume(volumeVal) {
    currentVolume = Math.max(0, Math.min(1, parseFloat(volumeVal)));
    if (bgmAudio) {
      bgmAudio.volume = currentVolume;
    }
  },

  getVolume() {
    return currentVolume;
  },

  playMusic() {
    this.ensureAudio();
    this.initMusic();
    if (bgmAudio && !muted) {
      bgmAudio.volume = currentVolume;
      bgmAudio.play().then(() => {
        musicEnabled = true;
      }).catch((e) => {
        console.warn("BGM autoplay blocked or failed:", e);
      });
    }
  },

  pauseMusic() {
    if (bgmAudio) {
      bgmAudio.pause();
      musicEnabled = false;
    }
  },

  toggleMusic() {
    this.initMusic();
    if (!bgmAudio) return false;
    if (bgmAudio.paused) {
      this.playMusic();
      return true;
    } else {
      this.pauseMusic();
      return false;
    }
  },

  isMusicPlaying() {
    return bgmAudio ? !bgmAudio.paused : false;
  },

  setMuted(isMuted) {
    muted = isMuted;
    if (bgmAudio) {
      bgmAudio.muted = isMuted;
      if (isMuted) {
        bgmAudio.pause();
      } else if (musicEnabled) {
        bgmAudio.play().catch(() => {});
      }
    }
  },

  isMuted() {
    return muted;
  },

  ensureAudio() {
    if (!audioCtx) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
      } catch (e) {
        console.warn("AudioContext not supported:", e);
      }
    } else if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  },

  beep(freq, duration, type = "sine") {
    if (muted || !audioCtx || currentVolume <= 0) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = 0.12 * currentVolume;
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  },

  playPerfectSound(combo) {
    const freq = 500 + Math.min(combo, 10) * 30;
    this.beep(freq, 0.09, "triangle");
  },

  playNormalDropSound() {
    this.beep(180, 0.1, "sawtooth");
  },

  playGoldenSound() {
    this.beep(700, 0.08, "triangle");
    setTimeout(() => this.beep(900, 0.1, "triangle"), 70);
  },

  playShieldSavedSound() {
    this.beep(220, 0.12, "sine");
    setTimeout(() => this.beep(440, 0.14, "sine"), 90);
  },

  playGiftSound() {
    this.beep(600, 0.08, "square");
    setTimeout(() => this.beep(800, 0.1, "square"), 70);
  },

  playMilestoneSound() {
    this.beep(523, 0.12, "triangle");
    setTimeout(() => this.beep(659, 0.14, "triangle"), 90);
    setTimeout(() => this.beep(784, 0.16, "triangle"), 180);
  },

  playUnlockSound() {
    this.beep(660, 0.1, "triangle");
    setTimeout(() => this.beep(880, 0.12, "triangle"), 80);
  },

  playGameOverSound() {
    this.beep(300, 0.15, "sawtooth");
    setTimeout(() => this.beep(180, 0.25, "sawtooth"), 100);
  }
};

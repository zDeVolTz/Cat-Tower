/**
 * UI & HUD event handlers, Level Checkpoints selector, and Reset Progress manager.
 */
import { LEVELS } from "../game/config.js";
import { state, resetGameState, resetProgress, getFloorCount, getBlockSwayX, getCriticalTilt, getLaneBounds } from "../game/gameState.js";
import { handleDrop } from "../game/physics.js";
import { AudioEngine } from "../audio/audioEngine.js";

let startPanel, overPanel, musicBtn, volumeSlider, scoreEl, floorLabelEl, levelBadgeEl, powerRowEl, finalScoreText, floorReachedText, bestScoreText, levelButtonsEls, resetProgressBtn;

function showConfirm(message, onYes) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);pointer-events:auto;";
  const box = document.createElement("div");
  box.className = "panel";
  box.innerHTML = `<p style="margin:0 0 16px;">${message}</p>
    <div class="start-btn-wrap">
      <button class="btn" id="confirmYes">Да</button>
      <button class="btn btn-secondary" id="confirmNo">Отмена</button>
    </div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const cleanup = () => overlay.remove();
  box.querySelector("#confirmYes").addEventListener("click", () => { cleanup(); onYes(); });
  box.querySelector("#confirmNo").addEventListener("click", cleanup);
}

export function initUI(canvasElement) {
  startPanel = document.getElementById("startPanel");
  overPanel = document.getElementById("overPanel");
  musicBtn = document.getElementById("musicBtn");
  volumeSlider = document.getElementById("volumeSlider");
  scoreEl = document.getElementById("score");
  floorLabelEl = document.getElementById("floorLabel");
  levelBadgeEl = document.getElementById("levelBadge");
  powerRowEl = document.getElementById("powerRow");
  finalScoreText = document.getElementById("finalScoreText");
  floorReachedText = document.getElementById("floorReachedText");
  bestScoreText = document.getElementById("bestScoreText");
  levelButtonsEls = document.querySelectorAll(".levelButtons, .levelButtonsOver");
  resetProgressBtn = document.getElementById("resetProgressBtn");

  renderLevelSelector();

  document.getElementById("startBtn").addEventListener("click", () => {
    AudioEngine.ensureAudio();
    AudioEngine.playMusic();
    if (musicBtn) musicBtn.textContent = AudioEngine.isMusicPlaying() ? "🎶" : "🎵";
    startPanel.classList.add("hidden");
    state.status = "playing";
    resetGameState();
    updateHUD();
  });

  document.getElementById("restartBtn").addEventListener("click", () => {
    AudioEngine.ensureAudio();
    if (!AudioEngine.isMusicPlaying()) {
      AudioEngine.playMusic();
    }
    if (musicBtn) musicBtn.textContent = AudioEngine.isMusicPlaying() ? "🎶" : "🎵";
    overPanel.classList.add("hidden");
    state.status = "playing";
    resetGameState();
    updateHUD();
  });

  resetProgressBtn.addEventListener("click", () => {
    showConfirm("Сбросить весь прогресс (рекорд и чекпоинты)?", () => {
      resetProgress();
      renderLevelSelector();
      updateHUD();
    });
  });

  // Configure default 10% volume
  AudioEngine.setVolume(0.10);

  function syncAudioUI() {
    const isMuted = AudioEngine.isMuted() || AudioEngine.getVolume() <= 0;
    if (musicBtn) {
      if (isMuted) {
        musicBtn.classList.add("is-muted");
        musicBtn.textContent = "🔇";
        musicBtn.setAttribute("title", "Звук выключен (нажмите для включения)");
      } else {
        musicBtn.classList.remove("is-muted");
        musicBtn.textContent = "🎵";
        musicBtn.setAttribute("title", "Фоновая музыка и звуки");
      }
    }
    if (volumeSlider) {
      if (isMuted) {
        volumeSlider.classList.add("is-muted");
      } else {
        volumeSlider.classList.remove("is-muted");
        volumeSlider.value = AudioEngine.getVolume();
      }
    }
  }

  if (musicBtn) {
    musicBtn.addEventListener("click", () => {
      AudioEngine.ensureAudio();
      const isCurrentlyMuted = AudioEngine.isMuted() || AudioEngine.getVolume() <= 0;
      if (isCurrentlyMuted) {
        AudioEngine.setMuted(false);
        if (AudioEngine.getVolume() <= 0) {
          AudioEngine.setVolume(0.10);
        }
        AudioEngine.playMusic();
      } else {
        AudioEngine.setMuted(true);
      }
      syncAudioUI();
    });
  }

  if (volumeSlider) {
    volumeSlider.value = "0.10";
    volumeSlider.addEventListener("input", (e) => {
      AudioEngine.ensureAudio();
      const val = parseFloat(e.target.value);
      if (val <= 0) {
        AudioEngine.setMuted(true);
      } else {
        if (AudioEngine.isMuted()) {
          AudioEngine.setMuted(false);
          AudioEngine.playMusic();
        }
        AudioEngine.setVolume(val);
      }
      syncAudioUI();
    });
  }

  syncAudioUI();

  canvasElement.addEventListener("pointerdown", () => {
    AudioEngine.ensureAudio();
    if (state.status === "playing") {
      handleDrop();
      updateHUD();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && state.status === "playing") {
      AudioEngine.ensureAudio();
      handleDrop();
      updateHUD();
    }
  });
}

export function renderLevelSelector() {
  levelButtonsEls = document.querySelectorAll(".levelButtons, .levelButtonsOver");
  levelButtonsEls.forEach((container) => {
    container.innerHTML = "";

    LEVELS.forEach((lvl) => {
      const isUnlocked = lvl.level <= state.maxUnlockedLevel;
      const isSelected = lvl.level === state.selectedStartLevel;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `lvl-btn ${isUnlocked ? "unlocked" : "locked"} ${isSelected ? "selected" : ""}`;
      btn.disabled = !isUnlocked;
      btn.innerHTML = isUnlocked
        ? `${lvl.icon} Ур.${lvl.level}`
        : `🔒 Ур.${lvl.level}`;
      btn.title = isUnlocked
        ? `${lvl.name} (Этаж ${lvl.startFloor}+)`
        : `Достигните ${lvl.startFloor} этажа, чтобы разблокировать`;

      if (isUnlocked) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          state.selectedStartLevel = lvl.level;
          renderLevelSelector();
        });
      }

      container.appendChild(btn);
    });
  });
}

export function updateHUD() {
  if (!scoreEl || !floorLabelEl) return;
  const currentFloor = (state.status === "over" && state.finalFloor !== undefined)
    ? state.finalFloor
    : getFloorCount();
  const lvlCfg = LEVELS[Math.min(state.currentLevel - 1, LEVELS.length - 1)];

  scoreEl.textContent = state.score;
  floorLabelEl.textContent = `Этаж ${currentFloor}`;
  if (levelBadgeEl && lvlCfg) {
    levelBadgeEl.textContent = `${lvlCfg.icon} ${lvlCfg.name}`;
  }

  let isNearEdge = false;
  let bLeft = 0;
  let bRight = state.W;
  let warningDist = Math.min(38, state.W * 0.10);

  if (state.W > 500) {
    const { laneLeft, laneRight, laneWidth } = getLaneBounds();
    bLeft = laneLeft;
    bRight = laneRight;
    warningDist = Math.min(60, laneWidth * 0.12);
  }

  for (let i = 0; i < state.blocks.length; i++) {
    const b = state.blocks[i];
    const screenY = state.H - 60 - (b.y - state.cameraY) - 46;
    if (screenY < -120 || screenY > state.H + 120) continue; // Skip off-screen blocks!

    const sway = getBlockSwayX ? getBlockSwayX(b.y) : 0;
    const leftEdge = b.x + sway;
    const rightEdge = leftEdge + b.width;
    if ((leftEdge - bLeft) < warningDist || (bRight - rightEdge) < warningDist) {
      isNearEdge = true;
      break;
    }
  }

  const chips = [];
  const criticalTilt = getCriticalTilt();
  const tiltRatio = state.blocks.length > 1 ? Math.abs(state.towerAngle) / criticalTilt : 0;

  if (tiltRatio > 0.28 || isNearEdge) {
    chips.push(`<span class="pchip warning-chip">⚠️ Опасность!</span>`);
  }

  if (powerRowEl) {
    powerRowEl.innerHTML = chips.join("");
  }

  if (state.status === "over") {
    const displayFloor = currentFloor;
    if (finalScoreText) finalScoreText.textContent = `Счёт: ${state.score}`;
    if (floorReachedText) floorReachedText.textContent = `Этаж: ${displayFloor}`;
    if (bestScoreText) bestScoreText.textContent = `Рекорд: ${state.best}`;
    renderLevelSelector();
    if (overPanel) overPanel.classList.remove("hidden");
  }
}

/**
 * Main Entry Point for Cat Tower Stack (YouTube Playables).
 */
import { Platform } from "./sdk/youtubeSdk.js";
import { AudioEngine } from "./audio/audioEngine.js";
import { state } from "./game/gameState.js";
import { update } from "./game/gameLoop.js";
import { initRenderer, render } from "./render/renderer.js";
import { initUI, updateHUD, renderLevelSelector } from "./ui/uiManager.js";

let lastT = 0;
let prevStateBeforePause = null;

function loop(t) {
  const dt = lastT ? t - lastT : 16;
  lastT = t;

  update(dt);
  render(t);

  requestAnimationFrame(loop);
}

function pauseGame() {
  if (state.status === "playing") {
    prevStateBeforePause = "playing";
    state.status = "paused";
  }
}

function resumeGame() {
  if (state.status === "paused" && prevStateBeforePause === "playing") {
    state.status = "playing";
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame(); else resumeGame();
});
window.addEventListener("blur", pauseGame);
window.addEventListener("focus", resumeGame);

async function boot() {
  // 1. Notify Playables SDK that splash/loading UI is ready to display
  Platform.firstFrameReady();

  // 2. Audio sync with Playables system audio settings
  AudioEngine.setMuted(!Platform.isAudioEnabled());

  // 3. Load saved high score & max unlocked level asynchronously
  const saved = await Platform.loadData();
  if (saved) {
    if (typeof saved.best === "number") {
      state.best = saved.best;
    }
    if (typeof saved.maxUnlockedLevel === "number") {
      state.maxUnlockedLevel = saved.maxUnlockedLevel;
      state.selectedStartLevel = saved.maxUnlockedLevel;
    }
  }

  // 4. Initialize Canvas Renderer & UI Bindings
  const canvas = document.getElementById("gameCanvas");
  initRenderer(canvas);
  initUI(canvas);
  renderLevelSelector();
  updateHUD();

  // 5. Start Game Loop
  requestAnimationFrame(loop);

  // 6. Notify Playables SDK that game is fully loaded and interactive
  Platform.gameReady();
}

boot();

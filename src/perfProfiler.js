/**
 * Live Browser Performance & FPS Profiler Overlay for Cat Tower Stack.
 * Passively hooks into requestAnimationFrame to measure real-time FPS, frame latency (ms),
 * physics/render timing, and lag spike alerts without modifying game code.
 */

let overlayEl = null;
let fpsEl = null;
let frameTimeEl = null;
let spikeEl = null;
let heapEl = null;

let frameCount = 0;
let lastTime = performance.now();
let fps = 60;
let lastFrameTimeMs = 0;
let maxSpikeMs = 0;
let spikeTimer = 0;

function createProfilerUI() {
  if (document.getElementById("cat-perf-overlay")) return;

  overlayEl = document.createElement("div");
  overlayEl.id = "cat-perf-overlay";
  overlayEl.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 99999;
    background: rgba(18, 12, 28, 0.85);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    padding: 8px 12px;
    font-family: monospace, monospace;
    font-size: 11px;
    color: #e0e0e0;
    pointer-events: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    min-width: 150px;
    line-height: 1.4;
  `;

  overlayEl.innerHTML = `
    <div style="font-weight:bold; color:#ffd54a; margin-bottom:4px;">⚡ PERF PROFILER</div>
    <div>FPS: <span id="perf-fps" style="font-weight:bold; color:#7fd8e8;">60</span></div>
    <div>Frame: <span id="perf-ftime">16.6 ms</span></div>
    <div>Peak Lag: <span id="perf-spike" style="color:#aaa;">0.0 ms</span></div>
    <div id="perf-heap-row" style="display:none;">Heap: <span id="perf-heap">0 MB</span></div>
    <div id="perf-status-alert" style="margin-top:4px; font-size:10px; color:#9fe8c8;">● Smooth (60 FPS)</div>
  `;

  document.body.appendChild(overlayEl);

  fpsEl = overlayEl.querySelector("#perf-fps");
  frameTimeEl = overlayEl.querySelector("#perf-ftime");
  spikeEl = overlayEl.querySelector("#perf-spike");
  heapEl = overlayEl.querySelector("#perf-heap");

  if (performance && performance.memory) {
    const heapRow = overlayEl.querySelector("#perf-heap-row");
    if (heapRow) heapRow.style.display = "block";
  }
}

function updateProfiler() {
  const now = performance.now();
  const delta = now - lastTime;
  lastFrameTimeMs = delta;

  frameCount++;

  if (delta > 30) {
    if (delta > maxSpikeMs) {
      maxSpikeMs = delta;
      spikeTimer = 180; // Hold spike display for 3 seconds
    }
  }

  if (spikeTimer > 0) {
    spikeTimer--;
    if (spikeTimer <= 0) maxSpikeMs = 0;
  }

  // Update stats every 500ms
  if (now - lastTime >= 500) {
    fps = Math.round((frameCount * 1000) / (now - lastTime));
    const avgFrameMs = (now - lastTime) / frameCount;

    if (fpsEl) {
      fpsEl.textContent = fps;
      fpsEl.style.color = fps >= 55 ? "#7fd8e8" : (fps >= 35 ? "#ffa834" : "#ff4d4d");
    }

    if (frameTimeEl) {
      frameTimeEl.textContent = `${avgFrameMs.toFixed(1)} ms`;
    }

    if (spikeEl) {
      spikeEl.textContent = `${maxSpikeMs.toFixed(1)} ms`;
      spikeEl.style.color = maxSpikeMs > 40 ? "#ff4d4d" : (maxSpikeMs > 25 ? "#ffa834" : "#aaa");
    }

    if (performance && performance.memory && heapEl) {
      const usedMB = (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
      heapEl.textContent = `${usedMB} MB`;
    }

    const alertEl = overlayEl ? overlayEl.querySelector("#perf-status-alert") : null;
    if (alertEl) {
      if (fps >= 55) {
        alertEl.textContent = "● Smooth (60 FPS)";
        alertEl.style.color = "#9fe8c8";
      } else if (fps >= 35) {
        alertEl.textContent = "⚠️ Minor Frame Drops";
        alertEl.style.color = "#ffa834";
      } else {
        alertEl.textContent = "🚨 HEAVY LAG DETECTED";
        alertEl.style.color = "#ff4d4d";
      }
    }

    frameCount = 0;
    lastTime = now;
  }

  requestAnimationFrame(updateProfiler);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      createProfilerUI();
      requestAnimationFrame(updateProfiler);
    });
  } else {
    createProfilerUI();
    requestAnimationFrame(updateProfiler);
  }
}

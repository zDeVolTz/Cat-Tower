/**
 * Cat Tower Stack — Performance Benchmark & Latency Test Suite
 * Measures FPS throughput, physics tick execution latency, render call overhead,
 * and memory allocation rates under simulated gameplay loads (10, 50, 100 blocks).
 */

import { BLOCK_H, PHYSICS_CONFIG } from "./src/game/config.js";
import { state, resetGameState } from "./src/game/gameState.js";
import { update } from "./src/game/gameLoop.js";
import { initRenderer, render } from "./src/render/renderer.js";

// Dummy canvas & 2D Context Mock for headless Node testing
function createMockCanvasContext() {
  const noop = () => {};
  const gradientMock = { addColorStop: noop };
  
  return {
    save: noop,
    restore: noop,
    scale: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    arcTo: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    quadraticCurveTo: noop,
    stroke: noop,
    fill: noop,
    clip: noop,
    translate: noop,
    rotate: noop,
    setLineDash: noop,
    fillText: noop,
    createLinearGradient: () => gradientMock,
    createRadialGradient: () => gradientMock,
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: ""
  };
}

const mockCanvas = {
  width: 400,
  height: 700,
  style: {},
  getContext: () => createMockCanvasContext()
};

// Ensure global environment for standalone Node execution
if (!global.window) {
  global.window = {
    innerWidth: 400,
    innerHeight: 700,
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

if (!global.document) {
  const dummyElem = { innerText: "", textContent: "", style: {}, classList: { add: () => {}, remove: () => {} } };
  global.document = {
    addEventListener: () => {},
    getElementById: () => dummyElem,
    querySelector: () => dummyElem,
    querySelectorAll: () => [],
    hidden: false
  };
}

if (!global.performance) {
  global.performance = { now: () => Date.now() };
}

let passed = 0;
let failed = 0;

function assert(condition, name, details = "") {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${name} ${details}`);
  }
}

console.log("\n======================================================================");
console.log("   SECTION: PERFORMANCE & MEMORY ALLOCATION BENCHMARKS");
console.log("======================================================================\n");

initRenderer(mockCanvas);

// ─── BENCHMARK 1: PHYSICS UPDATE TICK LATENCY (10, 50, 100 BLOCKS) ───
console.log("📊 Benchmark 1: Physics Tick & Sway Computation Throughput");

for (const blockCount of [10, 50, 100]) {
  resetGameState();
  state.status = "playing";
  
  // Fill tower with N blocks
  for (let i = 1; i < blockCount; i++) {
    state.blocks.push({
      x: state.columnLeft + (Math.sin(i) * 5),
      width: state.columnWidth,
      y: i * BLOCK_H,
      color: "#f4e4c1",
      typeId: i % 2 === 0 ? "normal" : "heavy",
      isGolden: i % 7 === 0,
      mass: 1.0,
      settled: true,
      squishX: 1, squishY: 1, squishVelX: 0, squishVelY: 0
    });
  }

  state.towerAngle = 0.04;
  state.towerAngularVelocity = 0.002;

  // Warmup
  for (let f = 0; f < 10; f++) update(16.6);

  if (global.gc) global.gc();
  const initialMemory = process.memoryUsage().heapUsed;
  const startT = performance.now();
  const iterations = 600; // Simulates 10 seconds of gameplay @ 60 FPS

  for (let f = 0; f < iterations; f++) {
    update(16.6);
  }

  const endT = performance.now();
  const finalMemory = process.memoryUsage().heapUsed;
  const totalMs = endT - startT;
  const avgMsPerFrame = totalMs / iterations;
  const simulatedFPS = Math.round(1000 / avgMsPerFrame);
  const heapDeltaMB = ((finalMemory - initialMemory) / (1024 * 1024)).toFixed(2);

  console.log(`   • ${blockCount} Blocks Tower: ${avgMsPerFrame.toFixed(3)} ms/frame (~${simulatedFPS} FPS eq), Memory Heap Delta: ${heapDeltaMB} MB / 10s`);
  assert(avgMsPerFrame < 5.0, `PERF001: Physics update for ${blockCount} blocks takes <5ms/frame (Actual: ${avgMsPerFrame.toFixed(3)}ms)`);
}

// ─── BENCHMARK 2: RENDERER DRAW CALL OVERHEAD ───
console.log("\n📊 Benchmark 2: Canvas 2D Renderer Execution Overhead");

for (const blockCount of [10, 50, 100]) {
  resetGameState();
  state.status = "playing";
  
  for (let i = 1; i < blockCount; i++) {
    state.blocks.push({
      x: state.columnLeft,
      width: state.columnWidth,
      y: i * BLOCK_H,
      color: "#ffb6c1",
      typeId: "normal",
      isGolden: i % 5 === 0,
      settled: true,
      squishX: 1, squishY: 1
    });
  }

  // Populate particles and debris
  for (let p = 0; p < 30; p++) {
    state.particles.push({ x: 200, y: 300, vx: 1, vy: -1, life: 500, maxLife: 500, size: 3, color: "#fff" });
  }

  const iterations = 600;
  const startT = performance.now();

  for (let f = 0; f < iterations; f++) {
    render();
  }

  const endT = performance.now();
  const totalMs = endT - startT;
  const avgMsPerFrame = totalMs / iterations;

  console.log(`   • Render ${blockCount} Blocks + 30 Particles: ${avgMsPerFrame.toFixed(3)} ms/frame`);
  assert(avgMsPerFrame < 8.0, `PERF002: Renderer for ${blockCount} blocks takes <8ms/frame (Actual: ${avgMsPerFrame.toFixed(3)}ms)`);
}

// ─── BENCHMARK 3: COLLAPSE ANIMATION STRESS TEST ───
console.log("\n📊 Benchmark 3: Tower Collapse Animation & Particle Explosion Stress Test");

resetGameState();
state.status = "collapsing";

for (let i = 0; i < 60; i++) {
  state.blocks.push({
    x: state.columnLeft,
    width: state.columnWidth,
    y: i * BLOCK_H,
    isFalling: true,
    vx: (Math.random() - 0.5) * 4,
    vy: -2 - Math.random() * 3,
    rot: 0,
    rotVel: 0.05
  });
}

for (let p = 0; p < 150; p++) {
  state.particles.push({ x: 200, y: 300, vx: (Math.random() - 0.5) * 5, vy: -3, life: 800, maxLife: 800, size: 4, color: "#ffd54a" });
}

const collapseStart = performance.now();
const collapseFrames = 300;

for (let f = 0; f < collapseFrames; f++) {
  update(16.6);
  render();
}

const collapseEnd = performance.now();
const avgCollapseMs = (collapseEnd - collapseStart) / collapseFrames;
console.log(`   • Stress Test (60 Collapsing Blocks + 150 Explosive Particles): ${avgCollapseMs.toFixed(3)} ms/frame`);
assert(avgCollapseMs < 10.0, `PERF003: Collapse stress test takes <10ms/frame (Actual: ${avgCollapseMs.toFixed(3)}ms)`);

console.log(`\n======================================================================`);
console.log(`   PERFORMANCE BENCHMARK RESULTS: ${passed} PASSED, ${failed} FAILED OUT OF ${passed + failed}`);
console.log(`======================================================================\n`);

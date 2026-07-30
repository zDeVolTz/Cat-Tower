import assert from "assert";
import { state, resetGameState } from "./src/game/gameState.js";
import { handleDrop } from "./src/game/physics.js";
import { update } from "./src/game/gameLoop.js";
import { BLOCK_H } from "./src/game/config.js";

// Mock environment
global.window = {
  innerWidth: 400,
  innerHeight: 800,
  devicePixelRatio: 1,
  addEventListener: () => {}
};
global.Platform = { sendScore: () => {}, saveData: () => {} };
global.AudioEngine = {
  playNormalDropSound: () => {},
  playPerfectSound: () => {},
  playGoldenSound: () => {}
};

function runSimulation() {
  console.log("=== Running Block Drop Simulation ===");

  // Scenario 1: Stable drop
  resetGameState();
  state.status = "playing";
  state.mover = { x: 150, y: BLOCK_H, width: 100, mass: 1, typeId: "normal" };
  handleDrop();
  assert(state.blocks.length === 2, "Stable drop adds block");
  assert(state.blocks[1].settled === true, "Stable block is settled");
  assert(state.blocks[1].isTeetering === false, "Stable block is not teetering");

  // Scenario 2: Teetering drop (overlap < 20%)
  // Base is at x=100..200 (width 100).
  // If we drop a block at x=185..285 (width 100). Overlap is 15px, which is 15%.
  resetGameState();
  state.status = "playing";
  state.mover = { x: 185, y: BLOCK_H, width: 100, mass: 1, typeId: "normal" };
  handleDrop();
  assert(state.blocks.length === 2, "Teetering drop adds block");
  let b = state.blocks[1];
  assert(b.isTeetering === true, "Block should be teetering");
  assert(b.settled === false, "Block should not be settled");

  console.log("Initial teetering block state:", { localTilt: b.localTilt, isFalling: b.isFalling });

  // Tick the game loop a few times
  for (let i = 0; i < 60; i++) {
    update(16.66); // 1 frame
  }

  console.log("After 1 second of teetering:", { localTilt: b.localTilt, isFalling: b.isFalling, status: state.status, cameraY: state.cameraY, targetCameraY: state.targetCameraY });

  // Tick until it falls
  for (let i = 0; i < 300; i++) {
    update(16.66);
    if (b.isFalling) break;
  }

  console.log("When block starts falling:", { localTilt: b.localTilt, isFalling: b.isFalling, status: state.status, targetCameraY: state.targetCameraY });

  // Scenario 3: Complete miss
  resetGameState();
  state.status = "playing";
  state.mover = { x: 300, y: BLOCK_H, width: 100, mass: 1, typeId: "normal" }; // Overlap is 0
  handleDrop();
  console.log("After complete miss:", { blocksLen: state.blocks.length, debrisLen: state.debris.length, status: state.status });

  console.log("SUCCESS!");
}

runSimulation();

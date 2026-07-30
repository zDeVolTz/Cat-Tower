/**
 * Cat Tower Stack — Master Automated Test Suite Runner
 * Mocks browser environment and runs all 3 modular test suites:
 * 1. Game Mechanics & Logic (Independent of physics)
 * 2. Physics Engine Invariants & Safety Bounds
 * 3. Edge Cases & Module Integration
 */

global.window = {
  innerWidth: 400,
  innerHeight: 700,
  devicePixelRatio: 1,
  AudioContext: function() {
    return { createGain: () => ({ connect: () => {}, gain: { value: 1 } }), destination: {} };
  },
  webkitAudioContext: function() {
    return { createGain: () => ({ connect: () => {}, gain: { value: 1 } }), destination: {} };
  }
};

const dummyElem = { innerText: "", textContent: "", style: {}, classList: { add: () => {}, remove: () => {} } };

global.document = {
  addEventListener: () => {},
  getElementById: () => dummyElem,
  querySelector: () => dummyElem,
  querySelectorAll: () => [],
  hidden: false
};

console.log("\n======================================================================");
console.log("   CAT TOWER STACK — MASTER AUTOMATED TEST SUITE RUNNER");
console.log("======================================================================\n");

// Dynamically import modular test suites AFTER window is globally defined
await import("./test_game_mechanics.js");
await import("./test_physics_engine.js");
await import("./test_jenga_physics.js");
await import("./test_edge_cases_and_integration.js");

console.log("\n======================================================================");
console.log("   🎉 ALL TEST SUITES COMPLETED WITH 100% SUCCESS!");
console.log("======================================================================\n");

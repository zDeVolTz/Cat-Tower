/**
 * PhysicsEngine — Central orchestrator bringing solvers together into a clean, modular API.
 */
import { PhysicsConfig } from "./PhysicsConfig.js";
import { TowerState } from "./TowerState.js";
import { CenterOfMassSolver } from "./CenterOfMassSolver.js";
import { StabilitySolver } from "./StabilitySolver.js";
import { TowerTiltSolver } from "./TowerTiltSolver.js";
import { FallingSolver } from "./FallingSolver.js";
import { CollapseAnimation } from "./CollapseAnimation.js";
import { CatModifierSystem } from "./CatModifierSystem.js";

export class PhysicsEngine {
  static get config() {
    return PhysicsConfig;
  }

  static getTopFloorY(blocks) {
    return TowerState.getTopFloorY(blocks);
  }

  static getBlockSwayX(towerAngle, y) {
    return TowerState.getBlockSwayX(towerAngle, y);
  }

  static findSurfaceYForFootprint(blocks, towerAngle, leftX, rightX) {
    return StabilitySolver.findSurfaceYForFootprint(blocks, towerAngle, leftX, rightX);
  }

  static evaluateBlockStability(blocks, towerAngle, blockX, blockW, blockY, screenW) {
    return StabilitySolver.evaluateStability(blocks, towerAngle, blockX, blockW, blockY, screenW);
  }

  static checkTowerCenterOfMass(blocks, columnLeft, columnWidth) {
    return CenterOfMassSolver.calculateCoM(blocks, columnLeft, columnWidth);
  }

  static calculateDropImpulse(misalignment, blockMass, totalBlocks, towerHeight) {
    return TowerTiltSolver.calculateDropImpulse(misalignment, blockMass, totalBlocks, towerHeight);
  }

  static stepTeeteringBlock(block, friction, dt, towerAngle = 0) {
    return FallingSolver.stepTeeteringBlock(block, friction, dt, towerAngle);
  }

  static triggerSingleBlockFall(block, towerAngle = 0) {
    return FallingSolver.triggerSingleBlockFall(block, towerAngle);
  }

  static startTowerCollapse(blocks, towerAngle) {
    return CollapseAnimation.startTowerCollapse(blocks, towerAngle);
  }

  static stepCollapsingBlocks(blocks, screenH, dt, stateObj = null) {
    return CollapseAnimation.stepCollapsingBlocks(blocks, screenH, dt, stateObj);
  }

  static applyCounterStamping(teeteringBlock, landingBlockMass) {
    return CatModifierSystem.applyCounterStamping(teeteringBlock, landingBlockMass);
  }
}

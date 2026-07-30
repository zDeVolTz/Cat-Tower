/**
 * StabilitySolver — Evaluates footprint overlap ratio, edge corner pivots, and landability.
 */
import { BLOCK_H } from "../config.js";
import { PhysicsConfig } from "./PhysicsConfig.js";
import { TowerState } from "./TowerState.js";

export class StabilitySolver {
  static findSurfaceYForFootprint(blocks, towerAngle, leftX, rightX) {
    let highestY = 0;
    if (!blocks) return 0;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const sway = TowerState.getBlockSwayX(towerAngle, b.y);
      const blockLeft = b.x + sway;
      const blockRight = blockLeft + b.width;

      if (leftX < blockRight - 0.5 && rightX > blockLeft + 0.5) {
        const surfaceY = b.y + BLOCK_H;
        if (surfaceY > highestY) highestY = surfaceY;
      }
    }

    return highestY;
  }

  static evaluateStability(blocks, towerAngle, blockX, blockW, blockY, screenW = 400) {
    const blockLeft = blockX;
    const blockRight = blockX + blockW;
    const blockCenterX = blockX + blockW / 2;

    let supportLeft = Infinity;
    let supportRight = -Infinity;
    let foundSupport = false;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (Math.abs((b.y + BLOCK_H) - blockY) < 2) {
        const sway = TowerState.getBlockSwayX(towerAngle, b.y);
        const bLeft = b.x + sway;
        const bRight = bLeft + b.width;

        if (blockLeft < bRight - 0.5 && blockRight > bLeft + 0.5) {
          supportLeft = Math.min(supportLeft, bLeft);
          supportRight = Math.max(supportRight, bRight);
          foundSupport = true;
        }
      }
    }

    if (!foundSupport && blockY <= 0) {
      return { stable: true, overlapRatio: 1.0, pivotX: blockCenterX, slideDirection: 0 };
    }

    if (!foundSupport) {
      return { stable: false, overlapRatio: 0, pivotX: blockCenterX, slideDirection: blockCenterX > screenW / 2 ? 1 : -1 };
    }

    const overlapLeft = Math.max(blockLeft, supportLeft);
    const overlapRight = Math.min(blockRight, supportRight);
    const overlap = Math.max(0, overlapRight - overlapLeft);
    const overlapRatio = overlap / blockW;

    const minOverlap = PhysicsConfig.STABILITY_OVERLAP_MIN;
    const isRightHang = (blockRight - supportRight) > (supportLeft - blockLeft);
    const slideDirection = isRightHang ? 1 : -1;
    const pivotX = isRightHang ? supportRight : supportLeft;

    return {
      stable: overlapRatio >= minOverlap,
      overlapRatio,
      pivotX,
      slideDirection
    };
  }
}

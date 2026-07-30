/**
 * Manages structural properties and helper getters for the tower stack.
 */
import { BLOCK_H } from "../config.js";

export class TowerState {
  static getTopFloorY(blocks) {
    if (!blocks || blocks.length === 0) return 0;
    let maxY = 0;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.y + BLOCK_H > maxY) maxY = b.y + BLOCK_H;
    }
    return maxY;
  }

  static getTopBlock(blocks) {
    if (!blocks || blocks.length === 0) return null;
    return blocks[blocks.length - 1];
  }

  static getBlockSwayX(towerAngle, y) {
    return Math.sin(towerAngle) * y;
  }
}

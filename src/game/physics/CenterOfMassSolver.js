/**
 * CenterOfMassSolver — Calculates cumulative weighted Center of Mass (CoM)
 * and determines if tower structure is critically unbalanced.
 */
import { PhysicsConfig } from "./PhysicsConfig.js";

export class CenterOfMassSolver {
  static calculateCoM(blocks, columnLeft, columnWidth) {
    if (!blocks || blocks.length <= 2) {
      return { comX: columnLeft + columnWidth / 2, comOffset: 0, isUnbalanced: false };
    }

    const baseCenter = columnLeft + columnWidth / 2;
    let totalWeightedMass = 0;
    let weightedX = 0;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const mass = (b.physics && b.physics.mass !== undefined) ? b.physics.mass : (b.mass !== undefined ? b.mass : 1.0);
      const heightLeverage = 1.0 + (b.y / 600) * 1.0;
      const effectiveMass = mass * heightLeverage;
      const centerX = b.x + b.width / 2;

      totalWeightedMass += effectiveMass;
      weightedX += centerX * effectiveMass;
    }

    if (totalWeightedMass <= 0) {
      return { comX: baseCenter, comOffset: 0, isUnbalanced: false };
    }

    const comX = weightedX / totalWeightedMass;
    const comOffset = Math.abs(comX - baseCenter) / columnWidth;
    const maxOffset = PhysicsConfig.COM_CRITICAL_OFFSET;

    return {
      comX,
      comOffset,
      isUnbalanced: comOffset > maxOffset
    };
  }
}

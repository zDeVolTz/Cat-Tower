/**
 * CatModifierSystem — Extensible cat attribute contract system.
 * Allows adding new cat types with unique physical parameters without modifying core engine code.
 */
import { BLOCK_TYPES } from "../config.js";

export class CatModifierSystem {
  static getCatAttributes(typeId) {
    const type = BLOCK_TYPES[typeId] || BLOCK_TYPES.normal;
    return {
      id: type.id,
      label: type.label,
      mass: type.mass || type.weight || 1.0,
      friction: type.friction || 1.0,
      elasticity: type.elasticity || 0.2,
      overturnResistance: type.overturnResistance || 1.0,
      speedMult: type.speedMult || 1.0,
      scoreMult: type.scoreMult || 1.0,
      toleranceDelta: type.toleranceDelta || 0
    };
  }

  static applyCounterStamping(teeteringBlock, landingBlockMass, stampForce = 0.06) {
    if (!teeteringBlock || !teeteringBlock.isTeetering) return false;

    const catAttr = this.getCatAttributes(teeteringBlock.typeId);
    const resistance = catAttr.overturnResistance;
    const massRatio = landingBlockMass / ((teeteringBlock.physics && teeteringBlock.physics.mass !== undefined) ? teeteringBlock.physics.mass : (teeteringBlock.mass !== undefined ? teeteringBlock.mass : 1.0));
    const stampImpulse = (stampForce / resistance) * Math.max(0.8, massRatio);

    teeteringBlock.tiltVel -= teeteringBlock.tiltDir * stampImpulse;
    teeteringBlock.localTilt -= teeteringBlock.tiltDir * (stampImpulse * 1.5);

    const isFlattened = (teeteringBlock.tiltDir > 0 && teeteringBlock.localTilt <= 0) ||
                        (teeteringBlock.tiltDir < 0 && teeteringBlock.localTilt >= 0);

    if (isFlattened) {
      teeteringBlock.isTeetering = false;
      teeteringBlock.localTilt = 0;
      teeteringBlock.tiltVel = 0;
      teeteringBlock.settled = true;
      return true;
    }

    return false;
  }
}

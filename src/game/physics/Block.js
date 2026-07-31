/**
 * Represents a single block in the tower stack with physical properties.
 */
import { BLOCK_TYPES } from "../config.js";
import { PhysicsConfig } from "./PhysicsConfig.js";

export class Block {
  constructor({
    x,
    width,
    y,
    typeId = "normal",
    isGolden = false,
    color = "#fff",
    mass = 1.0,
    settled = true
  }) {
    this.x = x;
    this.width = width;
    this.y = y;
    this.typeId = typeId;
    this.isGolden = isGolden;
    this.color = color;
    this.settled = settled;

    const type = BLOCK_TYPES[typeId] || BLOCK_TYPES.normal;
    this.physics = {
      mass: mass,
      friction: type.friction !== undefined ? type.friction : 1.0,
      restitution: type.restitution !== undefined ? type.restitution : 0.0,
      stability: 1.0
    };

    // Teetering & Edge Pivot Physics Properties
    this.isTeetering = false;
    this.localTilt = 0;
    this.tiltVel = 0;
    this.tiltDir = 0;
    this.tiltPivotX = 0;

    // Falling animation properties
    this.isFalling = false;
    this.vx = 0;
    this.vy = 0;
    this.rot = 0;
    this.rotVel = 0;

    // Visual Squish Physics Properties
    this.squishX = 1.0;
    this.squishY = 1.0;
    this.squishVelX = 0;
    this.squishVelY = 0;
  }

  static createFromMover(mover, landingY, columnWidth) {
    const type = BLOCK_TYPES[mover.typeId] || BLOCK_TYPES.normal;
    const baseMass = type.mass || type.weight || 1.0;
    const colW = columnWidth || 140;
    const fraction = Math.max(0.1, mover.width / colW);
    let mass = baseMass * Math.pow(fraction, PhysicsConfig.WEIGHT_LENGTH_EXPONENT);
    if (mover.isGolden) mass *= 1.5;

    return new Block({
      x: mover.x,
      width: mover.width,
      y: landingY,
      typeId: mover.typeId,
      isGolden: mover.isGolden,
      color: mover.color,
      mass,
      settled: true
    });
  }
}

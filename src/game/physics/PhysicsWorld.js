/**
 * PhysicsWorld
 * 
 * Базовый класс для будущей компонентной физической системы.
 * На текущем этапе существует параллельно со старой физикой,
 * не влияя на игровой процесс.
 */
import { BLOCK_H, BLOCK_TYPES, PHYSICS_CONFIG } from "../config.js";
import { PhysicsEngine } from "./PhysicsEngine.js";
import { getBlockSwayX, getCriticalTilt, getLaneBounds, spawnFloatingText, uiScale } from "../gameState.js";
import { handleGameOver } from "../physics.js";

export class PhysicsWorld {
  constructor() {
    this.bodies = [];
  }

  /**
   * Добавляет физическое тело в мир.
   * @param {Object} body 
   */
  addBody(body) {
    if (!this.bodies.includes(body)) {
      this.bodies.push(body);
    }
  }

  /**
   * Удаляет физическое тело из мира.
   * @param {Object} body 
   */
  removeBody(body) {
    const index = this.bodies.indexOf(body);
    if (index > -1) {
      this.bodies.splice(index, 1);
    }
  }

  /**
   * Возвращает массив всех зарегистрированных тел.
   * @returns {Array}
   */
  getBodies() {
    return this.bodies;
  }

  /**
   * Выполняет обновление физического мира (Physics Tick).
   * @param {number} dt - Дельта времени
   * @param {Object} state - Глобальное состояние игры
   * @param {boolean} isGameOver - Флаг окончания игры
   */
  step(dt, state, isGameOver = false) {
    if (!state.blocks || state.blocks.length <= 1) return;
    const P = PHYSICS_CONFIG;

    // --- Compute Viewport-Based Center of Mass ---
    // Only blocks visible on the screen (plus margin) affect the current balance & physics
    const minY = state.cameraY - 40;
    const maxY = state.cameraY + state.H + 40;

    const visibleBlocks = [];
    for (let i = 0; i < state.blocks.length; i++) {
      const b = state.blocks[i];
      if (b.y >= minY && b.y <= maxY && !b.isFalling) {
        visibleBlocks.push({ block: b, originalIdx: i });
      }
    }

    // Fallback if camera hasn't updated: use top blocks
    if (visibleBlocks.length < 2) {
      const startIdx = Math.max(0, state.blocks.length - 10);
      for (let i = startIdx; i < state.blocks.length; i++) {
        if (!state.blocks[i].isFalling) {
          visibleBlocks.push({ block: state.blocks[i], originalIdx: i });
        }
      }
    }

    let totalMass = 0;
    let totalWeightedMass = 0;
    let weightedX = 0;
    let weightedY = 0;
    const pivotX = state.columnLeft + state.columnWidth / 2;
    const count = visibleBlocks.length;

    for (let v = 0; v < count; v++) {
      const { block: b, originalIdx: i } = visibleBlocks[v];
      const type = BLOCK_TYPES[b.typeId] || BLOCK_TYPES.normal;
      let mass = type.weight;
      if (i === 0) mass = 10; // Ground base block is heavy
      else if (b.isGolden) mass *= 1.5;

      // Viewport Leverage: higher visible blocks have up to 3x leverage on balance
      const leverage = 1 + (v / Math.max(1, count - 1)) * 2.0;
      const staticX = b.x + b.width / 2;

      totalMass += mass;
      totalWeightedMass += mass * leverage;
      weightedX += staticX * mass * leverage;
      weightedY += (b.y + BLOCK_H / 2) * mass;
    }

    // If all blocks are falling, just return
    if (totalMass === 0) return;

    const comX = (weightedX / totalWeightedMass) - pivotX; // Horizontal offset from pivot
    const comY = weightedY / totalMass;             // Average height

    // Level difficulty: use the blended value computed in spawnMover (see getLevelBlend)
    // so sway sensitivity ramps across a boundary instead of jumping instantly.
    const swaySens = state.swaySens;

    // 1. Gravity torque: off-center mass wants to topple the tower
    const gravityTorque = P.GRAVITY_FACTOR * totalMass * comX * swaySens;

    // 2. Restoring spring: foundation fights the tilt
    //    Logarithmic scaling: grows gently with mass so tall towers aren't frozen
    const stiffnessScale = 1 + Math.log(1 + totalMass * 0.5);
    const springTorque = -P.BASE_STIFFNESS * stiffnessScale * state.towerAngle;

    // 3. Damping: friction resists angular velocity
    const dampingScale = 1 + Math.log(1 + totalMass * 0.3);
    const dampingTorque = -P.BASE_DAMPING * dampingScale * state.towerAngularVelocity;

    // 4. Wind: gentle persistent push
    const windTorque = state.wind * comY * 0.00008 * swaySens;

    // --- Moment of Inertia (simplified rod approximation) ---
    const lastBlock = state.blocks[state.blocks.length - 1];
    const towerHeight = Math.max(BLOCK_H, lastBlock ? lastBlock.y : BLOCK_H);
    const I = totalMass * towerHeight * 0.01 + 1;

    // --- Integration (Semi-implicit Euler) ---
    const alpha = (gravityTorque + springTorque + dampingTorque + windTorque) / I;

    // Update velocity first (semi-implicit), then position
    state.towerAngularVelocity += alpha * dt;

    // Clamp angular velocity to prevent explosions
    state.towerAngularVelocity = Math.max(-P.MAX_ANGULAR_VELOCITY, Math.min(P.MAX_ANGULAR_VELOCITY, state.towerAngularVelocity));

    state.towerAngle += state.towerAngularVelocity * dt;

    // --- Teetering Bricks Integration inside Fixed Timestep (Jenga Physics) ---
    if (!isGameOver) {
      for (let i = state.blocks.length - 1; i >= 0; i--) {
        const b = state.blocks[i];
        if (b && b.isTeetering) {
          const type = BLOCK_TYPES[b.typeId] || BLOCK_TYPES.normal;
          const friction = (b.physics && b.physics.friction !== undefined) ? b.physics.friction : (type.friction || 1.0);
          const tippedOver = PhysicsEngine.stepTeeteringBlock(b, friction, dt, state.towerAngle);

          if (tippedOver) {
            // Cascade Collapse: All blocks stacked ABOVE the falling block must fall too!
            for (let j = i + 1; j < state.blocks.length; j++) {
              PhysicsEngine.triggerSingleBlockFall(state.blocks[j], state.towerAngle);
            }
            
            spawnFloatingText(state.W / 2, state.H * 0.4, "БЛОК УПАЛ! 💥", "#ff4d4d", 25 * uiScale());
            handleGameOver(false);
            break;
          }
        }
      }
    }

    // --- Collapse check (Strict Visual Bounds) ---
    if (!isGameOver) {
      let isVisuallyOffScreen = false;

      if (state.W <= 500) {
        // Mobile: exact boundary check (-10 to W + 10)
        for (let i = 0; i < state.blocks.length; i++) {
          const b = state.blocks[i];
          if (b.isFalling) continue;
          const sway = getBlockSwayX(b.y);
          const leftEdge = b.x + sway;
          const rightEdge = leftEdge + b.width;
          if (leftEdge < -10 || rightEdge > state.W + 10) {
            isVisuallyOffScreen = true;
            break;
          }
        }
      } else {
        // Desktop: collapse check against central arcade playfield lane boundaries
        const { laneLeft, laneRight } = getLaneBounds();

        for (let i = 0; i < state.blocks.length; i++) {
          const b = state.blocks[i];
          if (b.isFalling) continue;
          const sway = getBlockSwayX(b.y);
          const leftEdge = b.x + sway;
          const rightEdge = leftEdge + b.width;
          if (leftEdge < laneLeft - 10 || rightEdge > laneRight + 10) {
            isVisuallyOffScreen = true;
            break;
          }
        }
      }

      // Combine angle check (for short towers) with strict visual check (for tall towers)
      const criticalTilt = getCriticalTilt();
      if (Math.abs(state.towerAngle) > criticalTilt || isVisuallyOffScreen) {
        handleGameOver(true);
      }
    }
  }
}

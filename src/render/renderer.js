/**
 * Canvas Renderer with Harmonic Tower Sway curve rendering, dynamic weather parallax & HUD guide lines.
 */
import { BLOCK_H, THEMES, PHYSICS_CONFIG } from "../game/config.js";
import { state, getFloorCount, getBlockSwayX, getCriticalTilt } from "../game/gameState.js";
import { drawCatBlock } from "./drawCats.js";
import { drawDecorations } from "./drawDecor.js";

let mainCtx = null;
let activeCanvas = null;

export function initRenderer(canvasElement) {
  activeCanvas = canvasElement;
  mainCtx = canvasElement.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
}

function resizeCanvas() {
  if (!activeCanvas) return;
  state.W = window.innerWidth;
  state.H = window.innerHeight;

  // Cap DPR at 2 max on mobile screens to prevent GPU fill-rate lag on 3x-4x Retina displays
  state.DPR = Math.min(2, window.devicePixelRatio || 1);
  activeCanvas.width = Math.floor(state.W * state.DPR);
  activeCanvas.height = Math.floor(state.H * state.DPR);
  activeCanvas.style.width = state.W + "px";
  activeCanvas.style.height = state.H + "px";
}

export function render() {
  if (!mainCtx) return;
  const ctx = mainCtx;

  ctx.save();
  ctx.scale(state.DPR, state.DPR);
  ctx.clearRect(0, 0, state.W, state.H);

  // 1. Draw Background Parallax & Dynamic Weather
  const themeIdx = Math.min(Math.max(0, state.currentLevel - 1), THEMES.length - 1);
  const theme = THEMES[themeIdx] || THEMES[0];
  const timeSec = performance.now() / 1000;

  // Background Gradient
  const grad = ctx.createLinearGradient(0, 0, 0, state.H);
  grad.addColorStop(0, theme.from);
  grad.addColorStop(1, theme.to);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, state.W, state.H);

  drawDecorations(ctx, theme, themeIdx, timeSec, state.W, state.H, state.wind);

  // 2. Draw Visual Building Column Guide Lines
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);

  ctx.beginPath();
  ctx.moveTo(state.columnLeft, 0);
  ctx.lineTo(state.columnLeft, state.H);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(state.columnRight, 0);
  ctx.lineTo(state.columnRight, state.H);
  ctx.stroke();
  ctx.restore();

  // Screen Shake Translation
  ctx.save();
  if (state.shakeMag > 0.2) {
    const rx = (Math.random() - 0.5) * state.shakeMag;
    const ry = (Math.random() - 0.5) * state.shakeMag;
    ctx.translate(rx, ry);
  }

  // 3. Render Cat Blocks Stack — Rigid Body Sway (same formula as physics)
  for (let i = 0; i < state.blocks.length; i++) {
    const b = state.blocks[i];
    const screenY = state.H - 60 - (b.y - state.cameraY) - BLOCK_H;
    if (screenY < -120 || screenY > state.H + 120) continue;

    // Pure rigid body sway: sin(angle) * height — same as getBlockSwayX(b.y)
    const rigidSway = getBlockSwayX(b.y);

    ctx.save();
    const cx = b.x + rigidSway + b.width / 2;
    const cy = screenY + BLOCK_H / 2;
    ctx.translate(cx, cy);
    ctx.rotate(state.towerAngle);
    ctx.translate(-cx, -cy);

    drawCatBlock(ctx, b, b.x + rigidSway, screenY, state.towerAngle);
    ctx.restore();
  }

  // 4. Render Active Mover Block
  if (state.mover && state.status === "playing") {
    const moverY = state.H - 60 - (state.mover.y - state.cameraY) - BLOCK_H;
    drawCatBlock(ctx, state.mover, state.mover.x, moverY);
  }

  // 5. Render Falling Debris
  for (const d of state.debris) {
    const sy = state.H - 60 - (d.y - state.cameraY) - d.height;
    ctx.save();
    ctx.translate(d.x + d.width / 2, sy + d.height / 2);
    ctx.rotate(d.rot);
    ctx.fillStyle = d.color;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(-d.width / 2, -d.height / 2, d.width, d.height, 8);
    } else {
      ctx.rect(-d.width / 2, -d.height / 2, d.width, d.height);
    }
    ctx.fill();
    ctx.restore();
  }

  // 6. Render Particles
  for (const p of state.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 7. Render Floating Text Popups
  for (const f of state.floatingTexts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.font = `800 ${f.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = f.color;
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 8;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }

  // 8. Render Milestone Banner
  if (state.milestoneBanner) {
    const progress = state.milestoneBanner.life / state.milestoneBanner.maxLife;
    const alpha = Math.sin(progress * Math.PI);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(30, 20, 45, 0.85)";
    ctx.strokeStyle = "#ffd1e8";
    ctx.lineWidth = 2;

    const bw = Math.min(state.W * 0.85, 320);
    const bh = 54;
    const bx = state.W / 2 - bw / 2;
    const by = state.H * 0.22;

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 18);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();

    ctx.font = '800 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(state.milestoneBanner.text, state.W / 2, by + bh / 2);
    ctx.restore();
  }

  // 8.5 Tilt & Edge Danger Overlay — progressive red vignette as tower leans or gets near edges
  if (state.status === "playing" && state.blocks.length > 0) {
    const criticalTilt = getCriticalTilt();
    const tiltRatio = state.blocks.length > 1 ? Math.abs(state.towerAngle) / criticalTilt : 0;

    // Check proximity of any block in the tower to responsive playfield boundaries
    let maxEdgeDanger = 0;
    let bLeft = 0;
    let bRight = state.W;
    let warningDistance = Math.min(38, state.W * 0.10);

    if (state.W > 500) {
      const laneWidth = Math.min(state.W * 0.7, Math.max(480, state.H * 0.65));
      bLeft = state.W / 2 - laneWidth / 2;
      bRight = state.W / 2 + laneWidth / 2;
      warningDistance = Math.min(60, laneWidth * 0.12);
    }

    for (let i = 0; i < state.blocks.length; i++) {
      const b = state.blocks[i];
      const sway = getBlockSwayX(b.y);
      const leftEdge = b.x + sway;
      const rightEdge = leftEdge + b.width;

      const distLeft = leftEdge - bLeft;
      const distRight = bRight - rightEdge;
      const minDist = Math.min(distLeft, distRight);

      if (minDist < warningDistance) {
        const proximity = (warningDistance - minDist) / warningDistance;
        if (proximity > maxEdgeDanger) maxEdgeDanger = proximity;
      }
    }

    const dangerRatio = Math.max(tiltRatio, maxEdgeDanger);

    if (dangerRatio > 0.28) {
      const dangerAlpha = Math.min(0.5, (dangerRatio - 0.15) * 0.65);
      ctx.save();
      // Red vignette from edges
      const vGrad = ctx.createRadialGradient(
        state.W / 2, state.H / 2, state.H * 0.15,
        state.W / 2, state.H / 2, state.H * 0.75
      );
      vGrad.addColorStop(0, "rgba(255, 0, 0, 0)");
      vGrad.addColorStop(1, `rgba(255, 20, 20, ${dangerAlpha})`);
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, state.W, state.H);
      ctx.restore();
    }
  }

  ctx.restore(); // Screen shake restore

  // 9. Render Screen Flash Overlay
  if (state.screenFlash) {
    ctx.save();
    ctx.fillStyle = state.screenFlash.color;
    ctx.globalAlpha = state.screenFlash.alpha;
    ctx.fillRect(0, 0, state.W, state.H);
    ctx.restore();
  }

  ctx.restore(); // DPR scale restore
}

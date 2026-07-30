/**
 * Canvas Renderer with Harmonic Tower Sway curve rendering, dynamic weather parallax & HUD guide lines.
 */
import { BLOCK_H, GROUND_MARGIN, THEMES, PHYSICS_CONFIG, getLevelBlend } from "../game/config.js";
import { state, getFloorCount, getBlockSwayX, getCriticalTilt, getLaneBounds } from "../game/gameState.js";
import { drawCatBlock } from "./drawCats.js";
import { drawDecorations } from "./drawDecor.js";

let mainCtx = null;
let activeCanvas = null;

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(hexA, hexB, t) {
  if (t <= 0) return hexA;
  if (t >= 1) return hexB;
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

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
  const floorNow = getFloorCount();
  const blend = getLevelBlend(floorNow);
  const themeFrom = THEMES[Math.min(blend.from.level - 1, THEMES.length - 1)] || THEMES[0];
  const themeTo = THEMES[Math.min(blend.to.level - 1, THEMES.length - 1)] || themeFrom;
  const timeSec = performance.now() / 1000;

  // Background Gradient — crossfades smoothly across the last few floors of a level
  // instead of snapping the instant floor % 10 === 0 is crossed.
  const grad = ctx.createLinearGradient(0, 0, 0, state.H);
  grad.addColorStop(0, lerpColor(themeFrom.from, themeTo.from, blend.t));
  grad.addColorStop(1, lerpColor(themeFrom.to, themeTo.to, blend.t));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, state.W, state.H);

  // Background theme decorations stay consistent until floor level changes
  const activeTheme = themeFrom;
  const activeThemeIdx = Math.min(blend.from.level - 1, THEMES.length - 1);
  drawDecorations(ctx, activeTheme, activeThemeIdx, timeSec, state.W, state.H, state.wind);

  // 1.5 Draw Desktop Glassmorphism Arcade Cabinet (Visible bounds & glass walls for desktop)
  drawDesktopGlassArcadeCabinet(ctx);

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

  // 3. Render Cat Blocks Stack — Rigid Body Sway & Local Edge-Pivot Tilt
  for (let i = 0; i < state.blocks.length; i++) {
    const b = state.blocks[i];
    const screenY = state.H - GROUND_MARGIN - (b.y - state.cameraY) - BLOCK_H;
    if (screenY < -120 || screenY > state.H + 120) continue;

    const rigidSway = getBlockSwayX(b.y);
    const localTilt = b.localTilt || 0;

    ctx.save();
    const cx = b.x + rigidSway + b.width / 2;
    const cy = screenY + BLOCK_H / 2;
    ctx.translate(cx, cy);
    ctx.rotate(state.towerAngle);

    if (localTilt !== 0 && b.tiltPivotX !== undefined) {
      const px = (b.tiltPivotX - (b.x + b.width / 2));
      ctx.translate(px, BLOCK_H / 2);
      ctx.rotate(localTilt);
      ctx.translate(-px, -BLOCK_H / 2);
    }

    ctx.translate(-cx, -cy);

    drawCatBlock(ctx, b, b.x + rigidSway, screenY, state.towerAngle + localTilt);
    ctx.restore();
  }

  // 4. Render Active Mover Block
  if (state.mover && state.status === "playing") {
    const moverY = state.H - GROUND_MARGIN - (state.mover.y - state.cameraY) - BLOCK_H;
    drawCatBlock(ctx, state.mover, state.mover.x, moverY);
  }

  // 5. Render Falling Debris
  for (const d of state.debris) {
    const sy = state.H - GROUND_MARGIN - (d.y - state.cameraY) - d.height;
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
      const lane = getLaneBounds();
      bLeft = lane.laneLeft;
      bRight = lane.laneRight;
      warningDistance = Math.min(60, lane.laneWidth * 0.12);
    }

    for (let i = 0; i < state.blocks.length; i++) {
      const b = state.blocks[i];
      const screenY = state.H - GROUND_MARGIN - (b.y - state.cameraY) - BLOCK_H;
      if (screenY < -120 || screenY > state.H + 120) continue; // Skip off-screen blocks!

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

/**
 * Draws a glassmorphism arcade shaft with glowing neon glass walls on Desktop screens (>500px).
 * Clearly defines playfield boundaries for PC players so collisions feel natural and intuitive.
 */
function drawDesktopGlassArcadeCabinet(ctx) {
  if (state.W <= 500) return; // Mobile untouched

  const { laneWidth, laneLeft, laneRight } = getLaneBounds();
  const lanePad = 12;

  ctx.save();

  // 1. Darken outer desktop margins to focus attention on central arcade cabinet
  ctx.fillStyle = "rgba(10, 6, 18, 0.45)";
  ctx.fillRect(0, 0, laneLeft - lanePad, state.H);
  ctx.fillRect(laneRight + lanePad, 0, state.W - (laneRight + lanePad), state.H);

  // 2. Glass Shaft Fill (Glassmorphism look with soft inner vertical gradient)
  const glassGrad = ctx.createLinearGradient(laneLeft, 0, laneRight, 0);
  glassGrad.addColorStop(0, "rgba(255, 182, 217, 0.08)");
  glassGrad.addColorStop(0.12, "rgba(22, 14, 32, 0.35)");
  glassGrad.addColorStop(0.88, "rgba(22, 14, 32, 0.35)");
  glassGrad.addColorStop(1, "rgba(255, 182, 217, 0.08)");

  ctx.fillStyle = glassGrad;
  ctx.fillRect(laneLeft - lanePad, 0, laneWidth + lanePad * 2, state.H);

  // 3. Glowing Neon Glass Border Lines (Left & Right Boundaries)
  ctx.save();
  ctx.shadowColor = "#ffb6d9";
  ctx.shadowBlur = 14;
  ctx.strokeStyle = "rgba(255, 182, 217, 0.65)";
  ctx.lineWidth = 2.5;

  // Left Glass Boundary Line
  ctx.beginPath();
  ctx.moveTo(laneLeft - lanePad, 0);
  ctx.lineTo(laneLeft - lanePad, state.H);
  ctx.stroke();

  // Right Glass Boundary Line
  ctx.beginPath();
  ctx.moveTo(laneRight + lanePad, 0);
  ctx.lineTo(laneRight + lanePad, state.H);
  ctx.stroke();
  ctx.restore();

  // 4. Subtle Inner Dotted Guide Lines along boundaries
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(laneLeft, 0); ctx.lineTo(laneLeft, state.H);
  ctx.moveTo(laneRight, 0); ctx.lineTo(laneRight, state.H);
  ctx.stroke();

  // 5. Arcade Cabinet Header Title Badge ("🎮 СТЕКЛЯННАЯ АРКАДА")
  ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = "rgba(255, 209, 232, 0.60)";
  ctx.textAlign = "center";
  ctx.fillText("🎮 ИГРОВАЯ АРКАДНАЯ ЗОНА", state.W / 2, 22);

  ctx.restore();
}

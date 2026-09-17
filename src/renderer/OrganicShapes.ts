import type { ShipRole } from '../tactical/ShipDefinitions';

/**
 * Organic "single-celled organism" rendering for fleets.
 *
 * Fleets are drawn as soft, membrane-bound cells that still point along their
 * heading: a wobbling blob body, a directional pseudopod at the nose, waving
 * cilia on the membrane and drifting organelles around an inertial nucleus.
 * All motion is derived from a stable per-fleet seed plus the shared tactical
 * clock, so every cell swims with its own phase without extra game state.
 *
 * Local frame convention (matches the old ship silhouettes): the cell points
 * towards -Y; +Y is the rear where the bioluminescent trail emerges.
 */

export interface CellShape {
    /** Mean membrane radius in screen pixels. */
    radius: number;
    /** Forward elongation multiplier (1 = round cell, >1 = teardrop). */
    elongation: number;
    /** How many slow membrane bumps are used for the wobble. */
    bumps: number;
    /** Number of drifting organelles visible inside the cytoplasm. */
    organelles: number;
    /** Flagella/vesicle count in the rear trail glow. */
    tail: number;
    /** Draws a second inner membrane (flagship / defender look). */
    doubleMembrane: boolean;
}

export interface CellState {
    color: string;
    selected: boolean;
    hitFlash: number;
    shieldFlash: number;
    /** Shared fleet clock in seconds. */
    clock: number;
    /** Stable per-fleet seed so each cell wobbles with its own phase. */
    seed: number;
    /** 0..1 forward burn strength. */
    throttle: number;
    /** 0..1 normalized travel speed (drift trail even while coasting). */
    speed01: number;
    /** Retro-braking cilia fan at the nose. */
    braking: boolean;
    /** Combat ripples and membrane glow. */
    inCombat: boolean;
    /** High-detail layer (cilia, organelles) only when zoomed in. */
    detail: boolean;
    /** Angle to the sun in the cell's rotated local frame (radial highlight). */
    sunLocalAngle: number;
    /** Nucleus offset inside the local frame (inertial lag, clamped). */
    nucleusLocal: { x: number; y: number };
}

/** Lone "empty fleet" fallback cell (legacy render path). */
export const LONE_CELL: CellShape = {
    radius: 8.5, elongation: 1.25, bumps: 3, organelles: 2, tail: 1, doubleMembrane: false
};

/** Each role reads as a different micro-organism species. */
export const CELL_SHAPES: Record<ShipRole, CellShape> = {
    flagship: { radius: 13, elongation: 1.15, bumps: 3, organelles: 4, tail: 3, doubleMembrane: true },
    defender: { radius: 12.5, elongation: 1.0, bumps: 4, organelles: 3, tail: 2, doubleMembrane: true },
    striker: { radius: 10, elongation: 1.45, bumps: 3, organelles: 2, tail: 2, doubleMembrane: false },
    artillery: { radius: 9.5, elongation: 1.7, bumps: 2, organelles: 2, tail: 2, doubleMembrane: false },
    scout: { radius: 8, elongation: 1.3, bumps: 3, organelles: 2, tail: 1, doubleMembrane: false },
    support: { radius: 11, elongation: 1.05, bumps: 4, organelles: 4, tail: 3, doubleMembrane: false }
};

const SAMPLES = 16;

interface SamplePoint { x: number; y: number }

/**
 * Samples the membrane outline: radial wobble (three soft harmonics), a
 * breathing pulse, forward elongation and a slight thrust squeeze. The nose
 * (index 0) sits at -Y, the rear at SAMPLES / 2.
 */
function blobPoints(shape: CellShape, s: CellState): SamplePoint[] {
    const breathe = 1 + 0.03 * Math.sin(s.clock * 2.1 + s.seed);
    const elong = shape.elongation + 0.22 * s.throttle + (s.inCombat ? 0.06 : 0);
    const ripple = s.inCombat ? 1.9 : 1;
    const points: SamplePoint[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const a = (i / SAMPLES) * Math.PI * 2;
        const forward = Math.max(0, Math.cos(a + Math.PI / 2));
        const wobble =
            0.06 * ripple * Math.sin(shape.bumps * a + s.seed * 0.31 + s.clock * 1.4) +
            0.045 * ripple * Math.sin((shape.bumps + 2) * a - s.seed * 0.57 - s.clock * 1.9) +
            0.028 * Math.sin(3 * a + s.seed * 0.9 + s.clock * 2.6);
        const r = shape.radius * breathe * (1 + (elong - 1) * forward + wobble);
        points.push({
            x: Math.sin(a) * r * (1 - 0.07 * s.throttle),
            y: -Math.cos(a) * r
        });
    }
    return points;
}

/** Traces a closed, smooth path through the sample points (midpoint quads). */
function traceBlobPath(ctx: CanvasRenderingContext2D, points: SamplePoint[]) {
    const n = points.length;
    const mid = (a: SamplePoint, b: SamplePoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const start = mid(points[n - 1], points[0]);
    ctx.moveTo(start.x, start.y);
    for (let i = 0; i < n; i++) {
        const p = points[i];
        const m = mid(p, points[(i + 1) % n]);
        ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
    }
}

function closeBlobPath(ctx: CanvasRenderingContext2D, points: SamplePoint[]) {
    traceBlobPath(ctx, points);
    ctx.closePath();
}

export function drawOrganismCellBody(ctx: CanvasRenderingContext2D, shape: CellShape, s: CellState) {
    const points = blobPoints(shape, s);
    const R = shape.radius;

    // Clamp the nucleus inside the cytoplasm.
    let nx = s.nucleusLocal.x, ny = s.nucleusLocal.y;
    const nucleusMag = Math.hypot(nx, ny);
    const nucleusMax = R * 0.55;
    if (nucleusMag > nucleusMax) {
        nx = (nx / nucleusMag) * nucleusMax;
        ny = (ny / nucleusMag) * nucleusMax;
    }

    // --- Cytoplasm fill with a sun-facing highlight ------------------------
    const hx = Math.cos(s.sunLocalAngle) * R * 0.4;
    const hy = Math.sin(s.sunLocalAngle) * R * 0.4;
    const grad = ctx.createRadialGradient(hx, hy, R * 0.15, 0, 0, R * shape.elongation);
    grad.addColorStop(0, '#eaf6ff');
    grad.addColorStop(0.45, s.color);
    grad.addColorStop(1, '#04101e');

    closeBlobPath(ctx, points);
    ctx.fillStyle = grad;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = s.inCombat ? 16 : 7;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Combat: the interior flushes bright in a slow pulse.
    if (s.inCombat) {
        const pulse = Math.sin(s.clock * 5 + s.seed) * 0.5 + 0.5;
        ctx.globalAlpha = 0.1 + pulse * 0.18;
        ctx.fillStyle = s.color;
        closeBlobPath(ctx, points);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // --- Organelles drifting around the nucleus ----------------------------
    if (s.detail) {
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        for (let i = 0; i < shape.organelles; i++) {
            const base = s.seed * 0.173 + i * 2.4;
            const drift = 0.5 + 0.5 * Math.sin(s.clock * (0.6 + i * 0.23) + base);
            const ang = base + drift * 1.2;
            const dist = R * (0.28 + 0.2 * Math.sin(base * 1.7));
            const ox = nx * 0.5 + Math.cos(ang) * dist;
            const oy = ny * 0.5 + Math.sin(ang) * dist * 0.6;
            ctx.beginPath();
            ctx.arc(ox, oy, 1.5 + (i % 2), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // --- Nucleus with a flickering nucleolus -------------------------------
    const nucleusRadius = R * 0.34 * (1 + 0.06 * Math.sin(s.clock * 3 + s.seed));
    const nucleusGrad = ctx.createRadialGradient(nx, ny - nucleusRadius * 0.3, nucleusRadius * 0.1, nx, ny, nucleusRadius);
    nucleusGrad.addColorStop(0, 'rgba(255,255,255,0.92)');
    nucleusGrad.addColorStop(0.4, s.color);
    nucleusGrad.addColorStop(1, 'rgba(4,10,20,0.12)');
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 4;
    ctx.fillStyle = nucleusGrad;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(nx, ny, nucleusRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(nx + nucleusRadius * 0.25, ny - nucleusRadius * 0.25, nucleusRadius * 0.28, 0, Math.PI * 2);
    ctx.fill();
}

export function drawOrganismCellOutline(ctx: CanvasRenderingContext2D, shape: CellShape, s: CellState) {
    const points = blobPoints(shape, s);
    const nose = points[0];
    const R = shape.radius;

    // --- Directional pseudopod at the nose ---------------------------------
    // Keeps the fleet readable as "heading that way" while staying organic.
    const tipPulse = 0.5 + 0.5 * Math.sin(s.clock * 3.2 + s.seed * 0.11);
    const tipLen = R * (0.3 + 0.18 * tipPulse) + s.throttle * R * 0.5;
    const tipX = nose.x + Math.sin(s.clock * 2.4 + s.seed) * R * 0.08;
    const tipY = nose.y - tipLen;
    ctx.beginPath();
    ctx.moveTo(nose.x - R * 0.45, nose.y + R * 0.2);
    ctx.quadraticCurveTo(tipX - R * 0.12, nose.y - tipLen * 0.55, tipX, tipY);
    ctx.quadraticCurveTo(tipX + R * 0.12, nose.y - tipLen * 0.55, nose.x + R * 0.45, nose.y + R * 0.2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
    // Eye-spot just inside the nose: the old arrow's readability, alive.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(nose.x, nose.y + R * 0.18, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // --- Membrane stroke ----------------------------------------------------
    ctx.strokeStyle = s.selected ? '#ffffff' : s.color;
    ctx.lineWidth = s.selected ? 2.2 : 1.6;
    ctx.shadowColor = s.selected ? '#ffffff' : s.color;
    ctx.shadowBlur = s.selected ? 12 : 5;
    closeBlobPath(ctx, points);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner membrane for the big, round species.
    if (shape.doubleMembrane && s.detail) {
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 1;
        closeBlobPath(ctx, points.map(p => ({ x: p.x * 0.78, y: p.y * 0.78 })));
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Fine hull seams make the silhouettes read as ships at a glance while
    // preserving the living, soft-body identity of the current art direction.
    if (s.detail) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = '#c8f3ff';
        ctx.lineWidth = 0.7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -R * (shape.elongation * 0.72));
        ctx.lineTo(0, R * 0.72);
        ctx.stroke();
        for (const offset of [-0.45, 0.08, 0.55]) {
            const span = R * (0.35 + (1 - Math.abs(offset)) * 0.28);
            const y = offset * R;
            ctx.beginPath();
            ctx.moveTo(-span, y);
            ctx.lineTo(span, y);
            ctx.stroke();
        }
        if (shape.elongation > 1.2) {
            ctx.globalAlpha = 0.38;
            ctx.beginPath(); ctx.moveTo(-R * 0.55, -R * 0.18); ctx.lineTo(-R * 1.05, R * 0.18); ctx.lineTo(-R * 0.48, R * 0.1); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(R * 0.55, -R * 0.18); ctx.lineTo(R * 1.05, R * 0.18); ctx.lineTo(R * 0.48, R * 0.1); ctx.stroke();
        }
        ctx.restore();
    }
}

export function drawOrganismCellLimbs(ctx: CanvasRenderingContext2D, shape: CellShape, s: CellState) {
    const points = blobPoints(shape, s);
    const nose = points[0];
    const rear = points[SAMPLES / 2];
    const R = shape.radius;

    // --- Membrane cilia ------------------------------------------------------
    // Short hairs wave along the rim and sweep backwards under thrust.
    if (s.detail) {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        for (let i = 0; i < SAMPLES; i++) {
            const a = (i / SAMPLES) * Math.PI * 2;
            const forward = Math.max(0, Math.cos(a + Math.PI / 2));
            if (forward > 0.6) continue; // the pseudopod owns the nose
            const p = points[i];
            const len = Math.hypot(p.x, p.y) || 1;
            const ux = p.x / len, uy = p.y / len;
            const wave = Math.sin(s.clock * 5 + i * 1.7 + s.seed) * 1.4;
            const cx = p.x + ux * 2.6 - uy * wave;
            const cy = p.y + uy * 2.6 + ux * wave + s.throttle * 2.2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(cx, cy);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // --- Bioluminescent trail (replaces the engine plume) -------------------
    const glow = Math.max(s.throttle, s.speed01 * 0.35);
    if (glow > 0.03) {
        const flicker = Math.sin(s.clock * 9 + s.seed * 0.7);
        const plume = R * (0.6 + glow * 1.5) + flicker * (1.5 + glow * 2);
        const trailLength = R * (1.8 + glow * 3.4);
        const trail = ctx.createLinearGradient(0, rear.y, 0, rear.y + trailLength);
        trail.addColorStop(0, `${s.color}cc`);
        trail.addColorStop(0.32, `${s.color}66`);
        trail.addColorStop(1, `${s.color}00`);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.7 * glow;
        ctx.fillStyle = trail;
        ctx.beginPath();
        ctx.moveTo(-R * (0.22 + glow * 0.14), rear.y);
        ctx.quadraticCurveTo(-R * 0.12, rear.y + trailLength * 0.55, 0, rear.y + trailLength);
        ctx.quadraticCurveTo(R * 0.12, rear.y + trailLength * 0.55, R * (0.22 + glow * 0.14), rear.y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = s.color;
        for (let k = 0; k < shape.tail; k++) {
            const t = (k + 1) / shape.tail;
            const x = rear.x + Math.sin(t * 6 - s.clock * 8 + s.seed) * 2.6 * t;
            const y = rear.y + plume * t;
            ctx.globalAlpha = (1 - t) * 0.45 * glow;
            ctx.beginPath();
            ctx.arc(x, y, 2.4 * (1 - t) + 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // --- Braking: a fan of stopper cilia flickers at the nose ----------------
    if (s.braking) {
        ctx.strokeStyle = 'rgba(255,190,120,.85)';
        ctx.lineWidth = 1.4;
        const flick = Math.abs(Math.sin(s.clock * 12));
        for (let k = -2; k <= 2; k++) {
            ctx.beginPath();
            ctx.moveTo(k * 2.2, nose.y - 1);
            ctx.lineTo(k * 2.2 + k * 0.6, nose.y - 1 - (2 + 2 * flick));
            ctx.stroke();
        }
    }
}

export function drawOrganismCellOverlays(ctx: CanvasRenderingContext2D, shape: CellShape, s: CellState) {
    const points = blobPoints(shape, s);

    // --- Shield flash: an outward-offset membrane ring -----------------------
    if (s.shieldFlash > 0) {
        ctx.strokeStyle = `rgba(80, 210, 255, ${s.shieldFlash * 0.85})`;
        ctx.lineWidth = 2;
        closeBlobPath(ctx, points.map(p => {
            const len = Math.hypot(p.x, p.y) || 1;
            return { x: p.x + (p.x / len) * 4.5, y: p.y + (p.y / len) * 4.5 };
        }));
        ctx.stroke();
    }

    // --- Hit flash: the whole cell blanches white -----------------------------
    if (s.hitFlash > 0) {
        ctx.globalAlpha = Math.min(1, s.hitFlash);
        ctx.fillStyle = '#ffffff';
        closeBlobPath(ctx, points);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

/**
 * Convenience wrapper: draws one full organism cell (fill, organelles,
 * outline, limbs and overlays) inside the current transform.
 */
export function drawOrganismCell(ctx: CanvasRenderingContext2D, shape: CellShape, s: CellState) {
    drawOrganismCellBody(ctx, shape, s);
    drawOrganismCellOutline(ctx, shape, s);
    drawOrganismCellLimbs(ctx, shape, s);
    drawOrganismCellOverlays(ctx, shape, s);
}


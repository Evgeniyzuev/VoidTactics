import type { ShipRole } from '../tactical/ShipDefinitions';

export interface ShipyardIconOptions {
    sizeLevel: number;
    techLevel: number;
    role: ShipRole;
}

const TECH_COLORS = [
    '#8aa0ad', '#75d5e8', '#67a8ff', '#9f8cff', '#e885ff',
    '#ff8ab5', '#ffae67', '#ffd166', '#b5ef8a', '#62ffce'
];

const ROLE_SHAPES: Record<ShipRole, { width: number; taper: number; fins: number }> = {
    scout: { width: 0.42, taper: 0.9, fins: 1 },
    striker: { width: 0.55, taper: 1.15, fins: 2 },
    defender: { width: 0.78, taper: 0.72, fins: 3 },
    artillery: { width: 0.62, taper: 0.86, fins: 2 },
    support: { width: 0.7, taper: 0.62, fins: 2 },
    flagship: { width: 0.86, taper: 0.58, fins: 4 }
};

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value));
}

/** Draws a small, transparent-background shipyard silhouette without sprites. */
export function drawShipyardIcon(
    ctx: CanvasRenderingContext2D,
    options: ShipyardIconOptions,
    width = 88,
    height = 96
) {
    const sizeLevel = clamp(Math.floor(options.sizeLevel), 1, 10);
    const techLevel = clamp(Math.floor(options.techLevel), 1, 10);
    const roleShape = ROLE_SHAPES[options.role];
    const color = TECH_COLORS[techLevel - 1];
    const secondary = techLevel >= 7 ? '#dffcff' : techLevel >= 4 ? '#b3e7ff' : '#d5e7ed';
    const size01 = (sizeLevel - 1) / 9;
    const tech01 = (techLevel - 1) / 9;
    const centerX = width / 2;
    const centerY = height / 2;
    const bodyHeight = height * (0.48 + size01 * 0.45);
    const bodyWidth = width * (0.18 + roleShape.width * 0.27 + size01 * 0.08);

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 + tech01 * 0.14;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 9 + techLevel;
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyWidth * 0.68, bodyHeight * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Vertical hull, echoing the tall silhouettes in the reference sheet.
    const halfWidth = bodyWidth / 2;
    const taper = roleShape.taper;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#07141f';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.05 + tech01 * 0.55;
    ctx.beginPath();
    ctx.moveTo(0, -bodyHeight / 2);
    ctx.lineTo(halfWidth * 0.48, -bodyHeight * 0.26);
    ctx.lineTo(halfWidth, bodyHeight * 0.18);
    ctx.lineTo(halfWidth * taper, bodyHeight * 0.42);
    ctx.lineTo(halfWidth * 0.38, bodyHeight / 2);
    ctx.lineTo(0, bodyHeight * 0.37);
    ctx.lineTo(-halfWidth * 0.38, bodyHeight / 2);
    ctx.lineTo(-halfWidth * taper, bodyHeight * 0.42);
    ctx.lineTo(-halfWidth, bodyHeight * 0.18);
    ctx.lineTo(-halfWidth * 0.48, -bodyHeight * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Role-specific side structures keep the catalogue readable at a glance.
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = color;
    for (let i = 0; i < roleShape.fins; i++) {
        const y = -bodyHeight * 0.22 + i * bodyHeight * 0.15;
        const fin = halfWidth * (0.42 + size01 * 0.22);
        ctx.beginPath();
        ctx.moveTo(-halfWidth * 0.56, y);
        ctx.lineTo(-halfWidth - fin, y + bodyHeight * 0.05);
        ctx.lineTo(-halfWidth * 0.68, y + bodyHeight * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(halfWidth * 0.56, y);
        ctx.lineTo(halfWidth + fin, y + bodyHeight * 0.05);
        ctx.lineTo(halfWidth * 0.68, y + bodyHeight * 0.1);
        ctx.closePath();
        ctx.fill();
    }

    // Tech is shown through increasingly dense conduits and reactor nodes.
    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 0.7 + tech01 * 0.6;
    for (let i = 0; i < techLevel; i++) {
        const y = -bodyHeight * 0.27 + (i / Math.max(1, techLevel - 1)) * bodyHeight * 0.53;
        const span = halfWidth * (0.24 + (i % 3) * 0.1);
        ctx.beginPath();
        ctx.moveTo(-span, y);
        ctx.lineTo(span, y);
        ctx.stroke();
        if (i % 2 === techLevel % 2) {
            ctx.fillStyle = secondary;
            ctx.beginPath();
            ctx.arc(0, y, 1.1 + tech01, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#effcff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 4 + techLevel * 0.5;
    ctx.beginPath();
    ctx.arc(0, -bodyHeight * 0.23, 1.7 + tech01 * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Larger hulls receive a split keel and stronger exhaust signature.
    if (sizeLevel >= 4) {
        ctx.globalAlpha = 0.65;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-halfWidth * 0.2, bodyHeight * 0.28);
        ctx.lineTo(-halfWidth * 0.2, bodyHeight * 0.49);
        ctx.moveTo(halfWidth * 0.2, bodyHeight * 0.28);
        ctx.lineTo(halfWidth * 0.2, bodyHeight * 0.49);
        ctx.stroke();
    }
    ctx.restore();

    // Tiny frame markers make the icon look like a catalogue sprite cell.
    ctx.save();
    ctx.strokeStyle = `${color}55`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(4, height - 4); ctx.lineTo(width - 4, height - 4);
    ctx.stroke();
    ctx.restore();
}

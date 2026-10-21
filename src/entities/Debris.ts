import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';
import { LOOT_MARKER } from './LootMarker';

export class Debris extends Entity {
    public value: number; // Number of debris units
    public kind: 'combat' | 'salvage';

    constructor(x: number, y: number, value: number = 1, kind: 'combat' | 'salvage' = 'combat') {
        super(x, y);
        this.value = value;
        this.kind = kind;
        this.radius = LOOT_MARKER.radius;
    }

    update(_dt: number): void {
        // Debris is static, no update needed
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const screenPos = camera.worldToScreen(this.position);

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        const color = this.kind === 'salvage' ? '#6DE2B2' : '#82D9F5';
        const highlight = this.kind === 'salvage' ? '#E5FFF5' : '#E7FBFF';
        const pulse = 0.82 + Math.sin(this.position.x * 0.01 + this.position.y * 0.013) * 0.08;

        // One restrained marker reads better than a pile of particles and
        // stays recognizable when the camera is zoomed out.
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.25;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, LOOT_MARKER.ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.arc(0, 0, LOOT_MARKER.coreRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

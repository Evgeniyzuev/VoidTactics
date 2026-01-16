import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';

export class Debris extends Entity {
    public value: number; // Number of debris units

    constructor(x: number, y: number, value: number = 1) {
        super(x, y);
        this.value = value;
        this.radius = Math.max(4, Math.min(12, Math.sqrt(value) * 2)); // Size scales with value, clamped, made larger
    }

    update(_dt: number): void {
        // Debris is static, no update needed
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const screenPos = camera.worldToScreen(this.position);

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        // Draw as small gray circles/piles
        const numPiles = Math.min(5, Math.max(1, Math.floor(this.value / 10) + 1));
        for (let i = 0; i < numPiles; i++) {
            const offsetX = (i - (numPiles - 1) / 2) * 3;
            const offsetY = (i % 2 === 0 ? -2 : 2);
            const pileRadius = this.radius * (0.5 + Math.random() * 0.5);

            ctx.beginPath();
            ctx.arc(offsetX, offsetY, pileRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#CCCCCC'; // Light gray
            ctx.fill();

            // Small highlight
            ctx.beginPath();
            ctx.arc(offsetX - pileRadius * 0.3, offsetY - pileRadius * 0.3, pileRadius * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
        }

        ctx.restore();
    }
}

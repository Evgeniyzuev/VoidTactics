import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';

export class SupplyCrate extends Entity {
    public abilityId: string;

    constructor(x: number, y: number, abilityId: string) {
        super(x, y);
        this.abilityId = abilityId;
        this.radius = 10;
    }

    update(_dt: number): void {
        // Static pickup
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const screenPos = camera.worldToScreen(this.position);
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.006);

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        // Outer glow
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 120, ${0.15 + pulse * 0.2})`;
        ctx.fill();

        // Crate body
        ctx.beginPath();
        ctx.rect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
        ctx.fillStyle = `rgba(0, 180, 80, ${0.6 + pulse * 0.3})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 255, 160, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner highlight
        ctx.beginPath();
        ctx.rect(-this.radius * 0.5, -this.radius * 0.5, this.radius, this.radius);
        ctx.fillStyle = `rgba(120, 255, 190, ${0.2 + pulse * 0.2})`;
        ctx.fill();

        ctx.restore();
    }
}

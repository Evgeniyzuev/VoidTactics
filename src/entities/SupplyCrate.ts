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

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        // Draw like debris bubble, but green and pulsing
        const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.006);
        const pileRadius = this.radius * (0.8 + 0.2 * pulse);

        ctx.beginPath();
        ctx.arc(0, 0, pileRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 220, 120, ${0.6 + pulse * 0.2})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(-pileRadius * 0.3, -pileRadius * 0.3, pileRadius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(170, 255, 210, ${0.6 + pulse * 0.2})`;
        ctx.fill();

        ctx.restore();
    }
}

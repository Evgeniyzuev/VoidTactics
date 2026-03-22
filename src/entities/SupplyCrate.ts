import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';

export class SupplyCrate extends Entity {
    public abilityId: string;

    constructor(x: number, y: number, abilityId: string) {
        super(x, y);
        this.abilityId = abilityId;
        this.radius = 3;
    }

    update(_dt: number): void {
        // Static pickup
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const screenPos = camera.worldToScreen(this.position);

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        // Small debris-like bubble, green and static
        const pileRadius = this.radius;

        ctx.beginPath();
        ctx.arc(0, 0, pileRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#33CC77';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(-pileRadius * 0.3, -pileRadius * 0.3, pileRadius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = '#BFFFE0';
        ctx.fill();

        ctx.restore();
    }
}

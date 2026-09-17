import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';

export class AbilityCrate extends Entity {
    public abilityId: string;

    constructor(x: number, y: number, abilityId: string) {
        super(x, y);
        this.abilityId = abilityId;
        this.radius = 3;
    }

    update(_dt: number): void {}

    draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const screen = camera.worldToScreen(this.position);
        ctx.save();
        ctx.translate(screen.x, screen.y);
        ctx.strokeStyle = '#33cc77';
        ctx.fillStyle = '#d9fff0';
        ctx.lineWidth = 1.25;
        ctx.shadowColor = '#76ffc0';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(0, 0, 1.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

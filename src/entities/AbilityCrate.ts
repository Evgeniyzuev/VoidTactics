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
        ctx.fillStyle = '#33cc77';
        ctx.shadowColor = '#76ffc0';
        ctx.shadowBlur = 8;
        ctx.fillRect(-3, -3, 6, 6);
        ctx.fillStyle = '#d9fff0';
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
    }
}

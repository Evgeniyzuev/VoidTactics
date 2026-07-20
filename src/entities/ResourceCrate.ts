import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';

export class ResourceCrate extends Entity {
    public fuel: number;
    public supplies: number;

    constructor(
        x: number,
        y: number,
        fuel: number,
        supplies: number
    ) {
        super(x, y);
        this.fuel = fuel;
        this.supplies = supplies;
        this.radius = 4;
    }

    update(_dt: number): void {}

    draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const screen = camera.worldToScreen(this.position);
        ctx.save();
        ctx.translate(screen.x, screen.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#d5a94b';
        ctx.strokeStyle = '#fff0a5';
        ctx.lineWidth = 1;
        ctx.shadowColor = '#ffc64d';
        ctx.shadowBlur = 8;
        ctx.fillRect(-4, -4, 8, 8);
        ctx.strokeRect(-4, -4, 8, 8);
        ctx.restore();
    }
}

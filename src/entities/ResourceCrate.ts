import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';
import { LOOT_MARKER } from './LootMarker';

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
        this.radius = LOOT_MARKER.radius;
    }

    update(_dt: number): void {}

    draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const screen = camera.worldToScreen(this.position);
        const onlyFuel = this.fuel > 0 && this.supplies <= 0;
        const onlySupplies = this.supplies > 0 && this.fuel <= 0;
        const stroke = onlyFuel ? '#ffd34f' : onlySupplies ? '#63e6b1' : '#e3bf5d';
        const fill = onlyFuel ? '#fff3a1' : onlySupplies ? '#c9ffe8' : '#fff0a5';
        ctx.save();
        ctx.translate(screen.x, screen.y);
        ctx.strokeStyle = stroke;
        ctx.fillStyle = fill;
        ctx.lineWidth = 1.25;
        ctx.shadowColor = stroke;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, LOOT_MARKER.ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(0, 0, LOOT_MARKER.coreRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

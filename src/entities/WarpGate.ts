import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';

export class WarpGate extends Entity {
    public targetSystemId: number;
    public name: string;
    public color: string = '#00FFFF'; // Cyan/blue for warp gates

    constructor(x: number, y: number, targetSystemId: number, name: string = 'Warp Gate') {
        super(x, y);
        this.radius = 30; // Larger than planets for easy targeting
        this.targetSystemId = targetSystemId;
        this.name = name;
    }

    update(_dt: number) {
        // Warp gates don't move or orbit
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const screenPos = camera.worldToScreen(this.position);
        const r = this.radius * camera.zoom;

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        // Outer glow ring
        const gradient = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.5);
        gradient.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
        gradient.addColorStop(0.7, 'rgba(0, 255, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Inner portal ring
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        // Rotating inner rings for effect
        const time = Date.now() * 0.001;
        ctx.lineWidth = 2;

        // First rotating ring
        ctx.save();
        ctx.rotate(time);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, 0, Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();

        // Second rotating ring (opposite direction)
        ctx.save();
        ctx.rotate(-time * 1.5);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.5, Math.PI, Math.PI * 2.5);
        ctx.stroke();
        ctx.restore();

        // Central energy core
        const coreGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.3);
        coreGradient.addColorStop(0, '#FFFFFF');
        coreGradient.addColorStop(0.5, this.color);
        coreGradient.addColorStop(1, 'rgba(0, 255, 255, 0.2)');

        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';
import { Fleet } from './Fleet';

export class BubbleZone extends Entity {
    public radius: number;
    public duration: number;
    public deployTime: number;
    public timeElapsed: number = 0;
    public isDeployed: boolean = false;

    constructor(x: number, y: number, radius: number, duration: number = 8, deployTime: number = 0.2) {
        super(x, y);
        this.radius = radius;
        this.duration = duration;
        this.deployTime = deployTime;
    }

    update(dt: number) {
        this.timeElapsed += dt;

        if (!this.isDeployed && this.timeElapsed >= this.deployTime) {
            this.isDeployed = true;
        }

        if (this.isDeployed && this.timeElapsed >= this.deployTime + this.duration) {
            // Bubble expires
            return true; // Signal to remove
        }

        return false;
    }

    applyEffect(fleet: Fleet) {
        if (this.isDeployed && Vector2.distance(this.position, fleet.position) < this.radius) {
            fleet.isBubbled = true;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        if (!this.isDeployed) return; // Don't draw until deployed

        const screenPos = camera.worldToScreen(this.position);
        const screenRadius = this.radius * camera.zoom;

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        // Main bubble circle
        ctx.beginPath();
        ctx.arc(0, 0, screenRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(100, 200, 255, 0.1)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner pulsing effect
        const pulse = Math.sin(this.timeElapsed * 3) * 0.5 + 0.5;
        const innerRadius = screenRadius * (0.8 - pulse * 0.1);
        ctx.beginPath();
        ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(150, 220, 255, ${0.2 + pulse * 0.3})`;
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }
}

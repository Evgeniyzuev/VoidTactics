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

    constructor(x: number, y: number, radius: number, duration: number = 10, deployTime: number = 0.2) {
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
        const screenPos = camera.worldToScreen(this.position);
        const fullScreenRadius = this.radius * camera.zoom;

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        // Calculate current visual radius (expanding during deploy time)
        let currentRadius;
        if (this.timeElapsed < this.deployTime) {
            // Expanding phase
            const expandProgress = this.timeElapsed / this.deployTime;
            currentRadius = fullScreenRadius * expandProgress;
        } else {
            // Fully deployed
            currentRadius = fullScreenRadius;
        }

        if (currentRadius > 0) {
            // Outer expanding ring
            ctx.beginPath();
            ctx.arc(0, 0, currentRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
            ctx.setLineDash([]);
            ctx.lineWidth = 3;
            ctx.stroke();

            // Inner fill (only when fully deployed)
            if (this.isDeployed) {
                ctx.beginPath();
                ctx.arc(0, 0, currentRadius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(100, 200, 255, 0.1)';
                ctx.fill();

                // Pulsing inner effect
                const pulse = Math.sin(this.timeElapsed * 2) * 0.5 + 0.5;
                const innerRadius = currentRadius * (0.7 + pulse * 0.1);
                ctx.beginPath();
                ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(150, 220, 255, ${0.3 + pulse * 0.2})`;
                ctx.setLineDash([2, 4]);
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // Center point (visible during expansion)
        if (!this.isDeployed) {
            ctx.beginPath();
            ctx.arc(0, 0, 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(100, 200, 255, 0.8)';
            ctx.fill();
        }

        ctx.restore();
    }
}

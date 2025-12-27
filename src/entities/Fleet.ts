import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';

export class Fleet extends Entity {
    public velocity: Vector2 = new Vector2(0, 0);
    public target: Vector2 | null = null;
    public followTarget: Fleet | null = null; // Fleet to follow
    public followDistance: number = 100; // Distance to maintain when following

    private maxSpeed: number = 300;
    private acceleration: number = 200;
    private deceleration: number = 150;
    private stopThreshold: number = 5;

    private rotation: number = 0;
    public color: string;
    public isPlayer: boolean = false;

    constructor(x: number, y: number, color: string = '#55CCFF', isPlayer: boolean = false) {
        super(x, y);
        this.color = color;
        this.isPlayer = isPlayer;
    }

    setTarget(pos: Vector2) {
        this.target = pos;
        this.followTarget = null; // Clear follow mode when setting direct target
    }

    setFollowTarget(fleet: Fleet) {
        this.followTarget = fleet;
        this.target = null; // Will be set in update
    }

    stopFollowing() {
        this.followTarget = null;
        this.target = null;
    }

    update(dt: number) {
        // If following another fleet, update target to their position
        if (this.followTarget) {
            const toTarget = this.followTarget.position.sub(this.position);
            const dist = toTarget.mag();

            // Maintain follow distance
            if (dist > this.followDistance) {
                const dir = toTarget.normalize();
                this.target = this.followTarget.position.sub(dir.scale(this.followDistance));
            } else {
                this.target = null; // We're at the right distance
            }
        }

        if (this.target) {
            const toTarget = this.target.sub(this.position);
            const dist = toTarget.mag();

            if (dist < this.stopThreshold) {
                this.target = null;
                this.velocity = new Vector2(0, 0); // Snap stop
            } else {
                const dir = toTarget.normalize();

                const desired = dir.scale(this.maxSpeed);
                // Arrive logic
                const slowRadius = 200;
                if (dist < slowRadius) {
                    desired.x *= (dist / slowRadius);
                    desired.y *= (dist / slowRadius);
                }

                const steering = desired.sub(this.velocity);

                // Let's use direct acceleration for "Drift" feel
                const steerForce = steering.scale(2.0 * dt); // 2.0 is responsiveness
                this.velocity = this.velocity.add(steerForce);
            }
        } else {
            // Friction/Drag when no target
            this.velocity = this.velocity.scale(0.95); // simple drag
        }

        // Apply Velocity
        this.position = this.position.add(this.velocity.scale(dt));

        // Update Rotation (Smooth turn towards velocity)
        if (this.velocity.mag() > 1) {
            const desiredAngle = Math.atan2(this.velocity.y, this.velocity.x);
            // Simple approach: Set rotation directly for now. 
            // Better: Lerp rotation. But instant is fine for this style.
            this.rotation = desiredAngle;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const screenPos = camera.worldToScreen(this.position);

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        ctx.rotate(this.rotation + Math.PI / 2); // +90deg because drawing points up

        // Draw Ship (Perfect Warp Bubble)
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);

        // Fill with Gradient for "Bubble" effect
        const grad = ctx.createRadialGradient(-5, -5, 2, 0, 0, 15);
        grad.addColorStop(0, '#FFFFFF'); // Highlight
        grad.addColorStop(0.5, this.color);
        grad.addColorStop(1, '#000033'); // Darker edge
        ctx.fillStyle = grad;
        ctx.fill();

        // High contrast stroke
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Directional Indicator (Small arrow or engine inside bubble)
        ctx.beginPath();
        ctx.moveTo(0, -12); // Front
        ctx.lineTo(4, -4);
        ctx.lineTo(-4, -4);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();

        // Engine Glow/Trail (Behind)
        if (this.velocity.mag() > 10) {
            ctx.beginPath();
            ctx.moveTo(-6, 14);
            ctx.quadraticCurveTo(0, 22, 6, 14);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.restore();

        // Draw Target Marker (Bubble) - Only for Player
        if (this.isPlayer && this.target) {
            const tPos = camera.worldToScreen(this.target);
            ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.arc(tPos.x, tPos.y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Inner dot (softer)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.arc(tPos.x, tPos.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

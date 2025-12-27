import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';

export type Faction = 'civilian' | 'pirate' | 'orc' | 'military' | 'player';

export class Fleet extends Entity {
    public target: Vector2 | null = null;
    public followTarget: Entity | null = null; // Entity to follow
    public followDistance: number = 100; // Distance to maintain when following
    public followMode: 'approach' | 'contact' | null = null;

    public maxSpeed: number = 300;
    private stopThreshold: number = 5;

    private rotation: number = 0;
    public color: string;
    public isPlayer: boolean = false;
    public strength: number = 10;
    public sizeMultiplier: number = 1.0;
    public faction: Faction = 'civilian';
    public state: 'normal' | 'combat' | 'flee' = 'normal';
    public combatTimer: number = 0;
    public decisionTimer: number = 0;

    constructor(x: number, y: number, color: string = '#55CCFF', isPlayer: boolean = false) {
        super(x, y);
        this.color = color;
        this.isPlayer = isPlayer;
        if (isPlayer) this.faction = 'player';
        this.radius = 8;
    }

    setTarget(pos: Vector2) {
        this.target = pos;
        this.followTarget = null; // Clear follow mode when setting direct target
        this.followMode = null;
    }

    setFollowTarget(entity: Entity, mode: 'approach' | 'contact' = 'approach') {
        this.followTarget = entity;
        this.followMode = mode;
        this.target = null; // Will be set in update
    }

    stopFollowing() {
        this.followTarget = null;
        this.followMode = null;
        this.target = null;
    }

    update(dt: number) {
        if (this.decisionTimer > 0) this.decisionTimer -= dt;

        if (this.state === 'combat') {
            this.combatTimer -= dt;
            // If player has a target and is in combat, they might be trying to break it
            // We'll let Game.ts handle the logic, but here we still freeze movement
            this.velocity = this.velocity.scale(0.9);
            this.position = this.position.add(this.velocity.scale(dt));
            return;
        }

        // Smaller fleets are faster: 300 * (size^-0.2)
        // size 0.8 -> 313
        // size 1.0 -> 300
        // size 1.4 -> 280
        const currentMaxSpeed = this.maxSpeed * Math.pow(this.sizeMultiplier, -0.2);

        // If following another entity, update target to an intercept point
        if (this.followTarget) {
            const targetPos = this.followTarget.position;
            const targetVel = this.followTarget.velocity;
            const myPos = this.position;
            const maxSpeed = currentMaxSpeed;

            // Intercept Logic: Find time 't' to reach the target's future position
            // |Pt + Vt*t - Ps| = Vs*t
            const D = targetPos.sub(myPos);
            const a = targetVel.dot(targetVel) - maxSpeed * maxSpeed;
            const b = 2 * D.dot(targetVel);
            const c = D.dot(D);

            let t = -1;
            if (Math.abs(a) < 0.001) {
                // Special case: my speed matches target speed or target is static
                if (Math.abs(b) > 0.001) {
                    t = -c / b;
                }
            } else {
                const discriminant = b * b - 4 * a * c;
                if (discriminant >= 0) {
                    const t1 = (-b + Math.sqrt(discriminant)) / (2 * a);
                    const t2 = (-b - Math.sqrt(discriminant)) / (2 * a);

                    if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
                    else if (t1 > 0) t = t1;
                    else if (t2 > 0) t = t2;
                }
            }

            // Calculate effective follow distance
            const effectiveFollowDist = this.followDistance + this.followTarget.radius;

            // If we found a valid time, set target to the intercept point
            if (t > 0) {
                const interceptPoint = targetPos.add(targetVel.scale(t));

                if (this.followMode === 'approach') {
                    const toTarget = interceptPoint.sub(myPos);
                    const dist = toTarget.mag();
                    if (dist > effectiveFollowDist) {
                        const dir = toTarget.normalize();
                        this.target = interceptPoint.sub(dir.scale(effectiveFollowDist));
                    } else {
                        this.target = null;
                    }
                } else {
                    // Contact mode: directly to intercept point
                    this.target = interceptPoint;
                }
            } else {
                // Fallback to direct follow if intercept calc fails
                if (this.followMode === 'approach') {
                    const toTarget = targetPos.sub(myPos);
                    const dist = toTarget.mag();
                    if (dist > effectiveFollowDist) {
                        const dir = toTarget.normalize();
                        this.target = targetPos.sub(dir.scale(effectiveFollowDist));
                    } else {
                        this.target = null;
                    }
                } else {
                    this.target = targetPos;
                }
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

                const desired = dir.scale(currentMaxSpeed);
                // Arrive logic
                const slowRadius = 200;
                if (dist < slowRadius) {
                    desired.x *= (dist / slowRadius);
                    desired.y *= (dist / slowRadius);
                }

                const steering = desired.sub(this.velocity);

                // Acceleration depends on size (larger is slower to accelerate)
                // Reduced responsiveness by 30%: 2.0 -> 1.4
                const responsiveness = 1.4 / Math.sqrt(this.sizeMultiplier);
                const steerForce = steering.scale(responsiveness * dt);
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
        const baseRadius = 8;
        const shipRadius = baseRadius * this.sizeMultiplier;
        ctx.arc(0, 0, shipRadius, 0, Math.PI * 2);

        // Fill with Gradient for "Bubble" effect
        const grad = ctx.createRadialGradient(-baseRadius * 0.25 * this.sizeMultiplier, -baseRadius * 0.25 * this.sizeMultiplier, baseRadius * 0.12 * this.sizeMultiplier, 0, 0, shipRadius);
        grad.addColorStop(0, '#FFFFFF'); // Highlight
        grad.addColorStop(0.5, this.color);
        grad.addColorStop(1, '#000033'); // Darker edge
        ctx.fillStyle = grad;
        ctx.fill();

        // Combat Flashes
        if (this.state === 'combat' && Math.random() > 0.7) {
            ctx.fillStyle = 'white';
            ctx.fill();
        }

        // High contrast stroke with glow
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5 * this.sizeMultiplier;
        ctx.shadowBlur = (this.state === 'combat' ? 20 : 8) * this.sizeMultiplier;
        ctx.shadowColor = this.state === 'combat' ? '#FFFFFF' : this.color;
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset after stroke

        // Directional Indicator (Centered Arrow)
        ctx.beginPath();
        const arrowSize = 4 * this.sizeMultiplier;
        ctx.moveTo(0, -arrowSize * 1.25); // Front
        ctx.lineTo(arrowSize * 0.75, arrowSize * 0.75);
        ctx.lineTo(-arrowSize * 0.75, arrowSize * 0.75);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();

        // Engine Glow/Trail (Behind)
        if (this.velocity.mag() > 10 && this.state !== 'combat') {
            ctx.beginPath();
            ctx.moveTo(-arrowSize, arrowSize * 1.75);
            ctx.quadraticCurveTo(0, arrowSize * 3, arrowSize, arrowSize * 1.75);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 1.5 * this.sizeMultiplier;
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

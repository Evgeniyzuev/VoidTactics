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
    public lastAcceleration: Vector2 = new Vector2(0, 0);

    // Abilities State
    public abilities = {
        afterburner: { active: false, timer: 0, cooldown: 0, duration: 3, cdMax: 10 },
        cloak: { active: false, timer: 0, cooldown: 0, duration: 2, cdMax: 10 },
        bubble: { active: false, timer: 0, cooldown: 0, duration: 5, cdMax: 20 }
    };
    public isCloaked: boolean = false;
    public isBubbled: boolean = false; // Set by external bubbles
    public stunTimer: number = 0;

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

        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            this.velocity = this.velocity.scale(0.5); // Rapidly bleed velocity
            if (this.velocity.mag() < 1) this.velocity = new Vector2(0, 0);
            this.position = this.position.add(this.velocity.scale(dt));
            return;
        }

        // Tick abilities
        for (const key in this.abilities) {
            const a = (this.abilities as any)[key];
            if (a.cooldown > 0) a.cooldown -= dt;
            if (a.active) {
                a.timer -= dt;
                if (a.timer <= 0) {
                    a.active = false;
                    if (key === 'cloak') this.isCloaked = false;
                }
            }
        }

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
        let currentMaxSpeed = this.maxSpeed * Math.pow(this.sizeMultiplier, -0.2);

        // Ability modifiers
        if (this.abilities.afterburner.active) {
            currentMaxSpeed *= 1.5;
        }
        if (this.abilities.bubble.active) {
            currentMaxSpeed *= 0.5;
        }

        // External bubble effect
        if (this.isBubbled) {
            this.velocity = this.velocity.scale(0.8); // Drag
            currentMaxSpeed *= 0.2;
        }
        this.isBubbled = false; // Reset for next frame

        // If following another entity, update target to an intercept point
        if (this.followTarget) {
            const targetPos = this.followTarget.position;
            const targetVel = this.followTarget.velocity;
            const targetAcc = (this.followTarget instanceof Fleet) ? this.followTarget.lastAcceleration : new Vector2(0, 0);
            const myPos = this.position;
            const maxSpeed = currentMaxSpeed;

            // Iterative Intercept (Accounts for Acceleration)
            // We do a few passes to find a stable time 't'
            let t = 0;
            const iterations = 3;
            for (let i = 0; i < iterations; i++) {
                // Future position: P + V*t + 0.5*A*t^2
                const futurePos = targetPos
                    .add(targetVel.scale(t))
                    .add(targetAcc.scale(0.5 * t * t));

                const dist = futurePos.sub(myPos).mag();
                t = dist / maxSpeed;

                // Clamp lookahead to 10s to avoid crazy predictions
                if (t > 10) {
                    t = 10;
                    break;
                }
            }

            const interceptPoint = targetPos
                .add(targetVel.scale(t))
                .add(targetAcc.scale(0.5 * t * t));

            // Calculate effective follow distance
            const effectiveFollowDist = this.followDistance + this.followTarget.radius;

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
                // Contact mode: Directly to intercept point
                this.target = interceptPoint;
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
                // Much slower responsiveness: 0.6
                let responsiveness = 0.6 / Math.sqrt(this.sizeMultiplier);
                if (this.abilities.afterburner.active) responsiveness *= 1.5;

                const steerForce = steering.scale(responsiveness * dt);
                this.velocity = this.velocity.add(steerForce);
                this.lastAcceleration = steerForce.scale(1 / dt);
            }
        } else {
            // Friction/Drag when no target
            this.velocity = this.velocity.scale(0.95); // simple drag
            this.lastAcceleration = new Vector2(0, 0);
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

        if (this.isCloaked) {
            ctx.globalAlpha = 0.1;
        }

        ctx.rotate(this.rotation + Math.PI / 2); // +90deg because drawing points up

        // Draw Bubble effect
        if (this.abilities.bubble.active) {
            ctx.save();
            ctx.beginPath();
            const bubbleRadiusScreen = 8 * this.sizeMultiplier * 25 * camera.zoom;
            ctx.arc(0, 0, bubbleRadiusScreen, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(100, 200, 255, 0.15)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.restore();
        }

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

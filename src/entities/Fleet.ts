import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';

export type Faction = 'civilian' | 'pirate' | 'orc' | 'military' | 'player' | 'raider' | 'trader' | 'mercenary';

export class Fleet extends Entity {
    public target: Vector2 | null = null;
    public followTarget: Entity | null = null; // Entity to follow
    public followDistance: number = 100; // Distance to maintain when following
    public followMode: 'approach' | 'contact' | null = null;
    public manualSteerTarget: Vector2 | null = null; // Manual override for interception

    public maxSpeed: number = 500;
    private stopThreshold: number = 5;

    private rotation: number = 0;
    public color: string;
    public isPlayer: boolean = false;
    public strength: number = 10;
    public accumulatedDamage: number = 0;
    public sizeMultiplier: number = 1.0;
    public faction: Faction = 'civilian';
    public state: 'normal' | 'combat' | 'flee' | 'mining' = 'normal';
    public combatTimer: number = 0;
    public activeBattle: any = null; // Reference to ongoing Battle
    public decisionTimer: number = 0;
    public civilianStopTimer: number = 0;
    public lastAcceleration: Vector2 = new Vector2(0, 0);
    public currentTarget: Fleet | null = null; // Current attack target
    public hostileTo: Set<Fleet> = new Set(); // Persistent hostility to other fleets

    // Abilities State
    public abilities = {
        afterburner: { active: false, timer: 0, cooldown: 0, duration: 3, cdMax: 6 },
        cloak: { active: false, timer: 0, cooldown: 0, duration: 10, cdMax: 10 },
        bubble: { active: false, timer: 0, cooldown: 0, duration: 10, cdMax: 16 }
    };
    public isCloaked: boolean = false;
    public isBubbled: boolean = false; // Set by external bubbles
    public bubbleDistance: number = 0; // Distance to bubble center
    public stunTimer: number = 0;
    public money: number = 0; // Only for player

    // Mining properties
    public isMining: boolean = false;
    public miningTarget: any = null; // Reference to asteroid being mined

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
        // Sanitize position and velocity to prevent NaN errors
        if (!isFinite(this.position.x) || !isFinite(this.position.y)) this.position = new Vector2(0, 0);
        if (!isFinite(this.velocity.x) || !isFinite(this.velocity.y)) this.velocity = new Vector2(0, 0);

        if (this.decisionTimer > 0) this.decisionTimer -= dt;
        if (this.civilianStopTimer > 0) this.civilianStopTimer -= dt;

        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            this.velocity = this.velocity.scale(0.5); // Rapidly bleed velocity
            if (this.velocity.mag() < 1) this.velocity = new Vector2(0, 0);
            this.position = this.position.add(this.velocity.scale(dt));
            return;
        }

        // Civilian stop at planets
        if (this.faction === 'civilian' && this.civilianStopTimer > 0) {
            this.velocity = new Vector2(0, 0);
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
            // Safety fallback: if battle is missing or finished, reset state
            if (!this.activeBattle) {
                this.state = 'normal';
                return;
            }
            this.combatTimer -= dt;
            // Movement is restricted during combat
            this.velocity = this.velocity.scale(0.9);
            this.position = this.position.add(this.velocity.scale(dt));
            return;
        }

        let currentMaxSpeed = this.maxSpeed;

        // Ability modifiers
        if (this.abilities.afterburner.active) {
            currentMaxSpeed *= 1.5;
        }
        if (this.abilities.bubble.active) {
            currentMaxSpeed *= 0.5;
        }

        // External bubble effect
        if (this.isBubbled) {
            currentMaxSpeed *= 0.1;
            // Instantly slow down velocity if it's faster than new max speed
            const maxVel = currentMaxSpeed;
            if (this.velocity.mag() > maxVel) {
                this.velocity = this.velocity.normalize().scale(maxVel);
            }
        }

        // Trader speed penalty (Heavy Cargo)
        if (this.faction === 'trader') {
            currentMaxSpeed *= 0.3;
        }

        // Combat speed limit: if under attack, speed cannot exceed 90% of base max
        if (this.currentTarget) {
            const baseMaxSpeed = this.maxSpeed;
            const combatSpeedCap = baseMaxSpeed * 0.9;
            currentMaxSpeed = Math.min(currentMaxSpeed, combatSpeedCap);
            // Instantly slow down velocity if it's faster than combat speed cap
            if (this.velocity.mag() > combatSpeedCap) {
                this.velocity = this.velocity.normalize().scale(combatSpeedCap);
            }
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
            const iterations = 5;
            for (let i = 0; i < iterations; i++) {
                // Future position: P + V*t + 0.5*A*t^2
                // We clamp the acceleration time lookahead to 2s to avoid extreme overshooting
                const tAcc = Math.min(t, 2);
                const futurePos = targetPos
                    .add(targetVel.scale(t))
                    .add(targetAcc.scale(0.5 * tAcc * tAcc));

                const dist = futurePos.sub(myPos).mag();
                t = dist / maxSpeed;

                // Clamp lookahead to 10s to avoid crazy predictions
                if (t > 10) {
                    t = 10;
                    break;
                }
            }

            // Calculate final intercept point
            const tAccFinal = Math.min(t, 2);
            let interceptPoint = targetPos
                .add(targetVel.scale(t))
                .add(targetAcc.scale(0.5 * tAccFinal * tAccFinal));

            // Hybrid Pursuit/Intercept:
            // At long distances, steer more towards the actual current position 
            // to avoid flying "too parallel" and actually close the distance faster.
            const directDist = targetPos.sub(myPos).mag();
            const interceptWeight = Math.max(0, Math.min(1, 1 - (directDist - 500) / 2000));
            // 1.0 (full intercept) at 500 units, 0.0 (full pursuit) at 2500 units.

            const finalAimedPoint = targetPos.scale(1 - interceptWeight).add(interceptPoint.scale(interceptWeight));

            // Calculate effective follow distance
            const effectiveFollowDist = this.followDistance + this.followTarget.radius;

            if (this.manualSteerTarget) {
                // Manual nudge: prioritize player input over calculated intercept
                this.target = this.manualSteerTarget;
            } else if (this.followMode === 'approach') {
                const toTarget = finalAimedPoint.sub(myPos);
                const dist = toTarget.mag();
                if (dist > effectiveFollowDist) {
                    const dir = toTarget.normalize();
                    this.target = finalAimedPoint.sub(dir.scale(effectiveFollowDist));
                } else {
                    this.target = null;
                }
            } else {
                // Contact mode: Directly to aimed point
                this.target = finalAimedPoint;
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
                // Arrive logic (skip if manually steering for "thrust" feeling)
                const slowRadius = 200;
                if (dist < slowRadius && !this.manualSteerTarget) {
                    desired.x *= (dist / slowRadius);
                    desired.y *= (dist / slowRadius);
                }

                const steering = desired.sub(this.velocity);

                // Acceleration depends on size (larger is slower to accelerate)
                // Snappier responsiveness: 1.2 base
                let responsiveness = 1.2 / Math.sqrt(this.sizeMultiplier);
                if (this.abilities.afterburner.active) responsiveness *= 1.5;

                let steerForce = steering.scale(responsiveness * dt);
                if (!isFinite(steerForce.x) || !isFinite(steerForce.y)) steerForce = new Vector2(0, 0);
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

        // Final sanitization to prevent NaN errors
        if (!isFinite(this.position.x) || !isFinite(this.position.y)) this.position = new Vector2(0, 0);
        if (!isFinite(this.velocity.x) || !isFinite(this.velocity.y)) this.velocity = new Vector2(0, 0);

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

        // Draw Ship (Perfect Warp Bubble)
        ctx.beginPath();
        const baseRadius = 8;
        const shipRadius = baseRadius * this.sizeMultiplier;
        ctx.arc(0, 0, shipRadius, 0, Math.PI * 2);

        // Calculate highlight relative to the sun (0,0)
        const toSun = new Vector2(-this.position.x, -this.position.y);
        const angleToSun = Math.atan2(toSun.y, toSun.x);
        // Ship is already rotated by (this.rotation + Math.PI / 2)
        const currentRotation = this.rotation + Math.PI / 2;
        const relAngle = angleToSun - currentRotation;

        const hOffset = shipRadius * 0.4;
        const hX = Math.cos(relAngle) * hOffset;
        const hY = Math.sin(relAngle) * hOffset;

        // Fill with Gradient for "Bubble" effect
        const grad = ctx.createRadialGradient(hX, hY, shipRadius * 0.1, 0, 0, shipRadius);
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

        // Draw Attack Line - If attacking
        if (this.currentTarget && !this.currentTarget.isCloaked) {
            const targetScreenPos = camera.worldToScreen(this.currentTarget.position);
            const myScreenPos = camera.worldToScreen(this.position);

            // Pulsing attack line with particles
            const time = Date.now() * 0.005;
            const pulse = 0.5 + 0.5 * Math.sin(time);
            const alpha = 0.8 + 0.2 * Math.sin(time * 2);

            // Main attack line
            ctx.strokeStyle = `rgba(255, 50, 50, ${alpha})`;
            ctx.lineWidth = 3 + pulse * 2;
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';

            ctx.beginPath();
            ctx.moveTo(myScreenPos.x, myScreenPos.y);
            ctx.lineTo(targetScreenPos.x, targetScreenPos.y);
            ctx.stroke();

            // Energy particles along the line
            const dist = Math.sqrt((targetScreenPos.x - myScreenPos.x) ** 2 + (targetScreenPos.y - myScreenPos.y) ** 2);
            const numParticles = Math.floor(dist / 20);
            for (let i = 0; i < numParticles; i++) {
                const t = i / numParticles;
                const x = myScreenPos.x + (targetScreenPos.x - myScreenPos.x) * t + (Math.random() - 0.5) * 10;
                const y = myScreenPos.y + (targetScreenPos.y - myScreenPos.y) * t + (Math.random() - 0.5) * 10;
                const size = 1 + Math.random() * 2;
                ctx.fillStyle = `rgba(255, 150, 0, ${Math.random() * 0.5})`;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.shadowBlur = 0; // Reset shadow
        }

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

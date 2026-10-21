import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';
import type { Fleet } from './Fleet';

export const DECOY_BALANCE = {
    duration: 30,
    /** Fraction of the owner's threat the beacon appears to carry. */
    apparentPowerFraction: 0.35,
    attractionRadius: 2400,
    visits: 3,
    dazeSeconds: 6
} as const;

/**
 * Fake distress call. Opportunists (pirates, orcs, raiders) read it as weak
 * prey and military/mercenaries as someone to rescue, so a beacon dropped
 * between two groups starts a fight the player can stay out of.
 */
export class DecoyBeacon extends Entity {
    public readonly owner: Fleet;
    public timer: number;
    public visitsLeft: number = DECOY_BALANCE.visits;
    public attractionRadius: number;
    public apparentPower: number;
    private pulse = 0;

    constructor(x: number, y: number, owner: Fleet, durationMultiplier = 1, attractionMultiplier = 1) {
        super(x, y);
        this.owner = owner;
        this.radius = 12;
        this.timer = DECOY_BALANCE.duration * durationMultiplier;
        this.attractionRadius = DECOY_BALANCE.attractionRadius * attractionMultiplier;
        this.apparentPower = Math.max(1, owner.threatRating * DECOY_BALANCE.apparentPowerFraction);
    }

    get expired() {
        return this.timer <= 0 || this.visitsLeft <= 0;
    }

    update(dt: number) {
        this.timer -= dt;
        this.pulse += dt;
    }

    /** An NPC reached the beacon and found nothing; it is held up for a moment. */
    investigate(): number {
        this.visitsLeft--;
        return DECOY_BALANCE.dazeSeconds;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const screen = camera.worldToScreen(this.position);
        const wave = (this.pulse % 1.6) / 1.6;
        ctx.save();
        ctx.translate(screen.x, screen.y);
        ctx.beginPath();
        ctx.arc(0, 0, (8 + wave * 28) * Math.max(0.6, camera.zoom), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 190, 60, ${0.6 * (1 - wave)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(6, 5);
        ctx.lineTo(-6, 5);
        ctx.closePath();
        ctx.fillStyle = '#ffbe3c';
        ctx.fill();
        ctx.strokeStyle = '#fff6d8';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }
}

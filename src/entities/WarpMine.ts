import { Entity } from './Entity';
import { Vector2 } from '../utils/Vector2';
import { Camera } from '../renderer/Camera';
import { Fleet } from './Fleet';
import { BubbleZone } from './BubbleZone';

export class WarpMine extends Entity {
    public owner: Fleet;
    public radius: number = 100; // Activation radius (trigger)
    public safetyRadius: number = 100; // Radius where owner must leave to arm
    public isArmed: boolean = false;
    public timer: number = 30; // 30 seconds lifetime
    public isExploded: boolean = false;
    private flashTimer: number = 0;

    constructor(x: number, y: number, owner: Fleet) {
        super(x, y);
        this.owner = owner;
        this.radius = 100; // Trigger radius
        this.safetyRadius = 100; // Owner must leave this to arm
    }

    update(_dt: number) { }

    tick(dt: number, fleets: Fleet[], addBubble: (b: BubbleZone) => void) {
        this.timer -= dt;
        this.flashTimer += dt;

        if (this.timer <= 0) {
            this.explode(fleets, addBubble);
            return;
        }

        if (!this.isArmed) {
            const distToOwner = Vector2.distance(this.position, this.owner.position);
            if (distToOwner > this.safetyRadius) {
                this.isArmed = true;
            }
        } else {
            // Check for any fleet entering radius
            for (const fleet of fleets) {
                if (fleet.isCloaked) continue;
                const dist = Vector2.distance(this.position, fleet.position);
                if (dist < this.radius) {
                    this.explode(fleets, addBubble);
                    break;
                }
            }
        }
    }

    private explode(fleets: Fleet[], addBubble: (b: BubbleZone) => void) {
        if (this.isExploded) return;
        this.isExploded = true;

        // Create a short-lived bubble (1/5th of standard 10s = 2s)
        const bubble = new BubbleZone(this.position.x, this.position.y, 200);
        bubble.duration = 2.0;
        addBubble(bubble);

        // Deal damage: 3 units + 5% of fleet size (strength)
        for (const fleet of fleets) {
            const dist = Vector2.distance(this.position, fleet.position);
            if (dist < 200) { // Same as bubble radius
                const damage = 3 + (fleet.strength * 0.05);
                fleet.strength = Math.max(0, fleet.strength - damage);

                // If owner is player, they should get credit/money? 
                // User didn't specify, but usually mines don't grant money for "damage" in this engine 
                // unless handled by Attack class. For now just raw damage.
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const screenPos = camera.worldToScreen(this.position);
        const flash = Math.sin(this.flashTimer * (this.isArmed ? 15 : 5)) > 0;

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        // Outer Glow
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fillStyle = flash ? 'rgba(255, 0, 0, 0.4)' : 'rgba(100, 0, 0, 0.2)';
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fillStyle = flash ? '#FF0000' : '#550000';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (!this.isArmed) {
            // Show "Safety" ring
            ctx.beginPath();
            ctx.arc(0, 0, this.safetyRadius * camera.zoom, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.setLineDash([5, 5]);
            ctx.stroke();
        }

        ctx.restore();
    }
}

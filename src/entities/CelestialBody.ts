import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';

export interface RingBand {
    innerRadius: number;
    outerRadius: number;
    color: string;
}

export interface RingData {
    bands: RingBand[];
    angle: number; // Angle of the rings in radians
}

export class CelestialBody extends Entity {
    public color: string;
    public name: string;
    public isStar: boolean;
    public rings?: RingData;

    // Orbiting properties
    public orbitParent?: CelestialBody;
    public orbitRadius: number = 0;
    public orbitSpeed: number = 0;
    public orbitAngle: number = 0;

    // Liberation properties
    public isLiberated: boolean = false;
    public pulsing: boolean = false;
    public rewardCollected: boolean = false;

    constructor(
        x: number,
        y: number,
        radius: number,
        color: string,
        name: string,
        isStar: boolean = false
    ) {
        super(x, y);
        this.radius = radius;
        this.color = color;
        this.name = name;
        this.isStar = isStar;
    }

    update(dt: number) {
        if (this.orbitParent) {
            this.orbitAngle += this.orbitSpeed * dt;
            this.position.x = this.orbitParent.position.x + Math.cos(this.orbitAngle) * this.orbitRadius;
            this.position.y = this.orbitParent.position.y + Math.sin(this.orbitAngle) * this.orbitRadius;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const screenPos = camera.worldToScreen(this.position);
        const r = this.radius * camera.zoom;

        // 1. Draw Back part of Rings
        if (this.rings) {
            this.drawRings(ctx, camera, screenPos, true);
        }

        if (this.isStar) {
            // Glow effect
            const gradient = ctx.createRadialGradient(
                screenPos.x, screenPos.y, r * 0.2,
                screenPos.x, screenPos.y, r * 2
            );
            gradient.addColorStop(0, 'white');
            gradient.addColorStop(0.1, this.color);
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, r * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Star Solid Core
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, r * 0.8, 0, Math.PI * 2);
            ctx.fill();

        } else {
            // 1. Draw Planet Base Color
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, r, 0, Math.PI * 2);
            ctx.fill();

            // Contrast Stroke
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // 2. Calculate Angle to Sun (0,0)
            const toSun = new Vector2(-this.position.x, -this.position.y);
            const angleToSun = Math.atan2(toSun.y, toSun.x);

            // 3. Draw Shadow (Night Side) in Local Space
            ctx.save();
            ctx.translate(screenPos.x, screenPos.y);
            ctx.rotate(angleToSun);

            // Draw Shadow with curved terminator
            ctx.beginPath();
            ctx.arc(0, 0, r, Math.PI * 0.5, Math.PI * 1.5);
            ctx.ellipse(0, 0, r * 0.3, r, 0, Math.PI * 1.5, Math.PI * 0.5, true);

            const shadowGrad = ctx.createLinearGradient(-r, 0, r * 0.4, 0);
            shadowGrad.addColorStop(0, 'rgba(0,0,0,0.8)');
            shadowGrad.addColorStop(0.8, 'rgba(0,0,0,0.7)');
            shadowGrad.addColorStop(1, 'rgba(0,0,0,0.1)');

            ctx.fillStyle = shadowGrad;
            ctx.fill();

            ctx.restore();
        }

        // 5. Draw Front part of Rings
        if (this.rings) {
            this.drawRings(ctx, camera, screenPos, false);
        }

        // 6. Liberation pulsing effect
        if (this.pulsing && this.isLiberated) {
            const time = Date.now() * 0.005; // Slow pulse
            const pulseIntensity = 0.5 + 0.5 * Math.sin(time);
            const pulseRadius = r * (1.2 + 0.3 * pulseIntensity);

            // Pulsing glow
            const glowGrad = ctx.createRadialGradient(
                screenPos.x, screenPos.y, r * 0.8,
                screenPos.x, screenPos.y, pulseRadius
            );
            glowGrad.addColorStop(0, `rgba(0, 255, 0, ${0.3 * pulseIntensity})`);
            glowGrad.addColorStop(1, 'rgba(0, 255, 0, 0)');

            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, pulseRadius, 0, Math.PI * 2);
            ctx.fill();

            // Energy particles
            const particleCount = 6;
            for (let i = 0; i < particleCount; i++) {
                const angle = (i / particleCount) * Math.PI * 2 + time;
                const dist = r * (1.5 + 0.5 * Math.sin(time * 2 + i));
                const px = screenPos.x + Math.cos(angle) * dist;
                const py = screenPos.y + Math.sin(angle) * dist;
                const particleSize = 2 + Math.sin(time * 3 + i) * 1;

                ctx.fillStyle = `rgba(0, 255, 0, ${0.8 * pulseIntensity})`;
                ctx.beginPath();
                ctx.arc(px, py, particleSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    private drawRings(ctx: CanvasRenderingContext2D, camera: Camera, screenPos: Vector2, back: boolean) {
        if (!this.rings) return;

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(this.rings.angle);

        for (const band of this.rings.bands) {
            const innerR = band.innerRadius * camera.zoom;
            const outerR = band.outerRadius * camera.zoom;
            const midR = (innerR + outerR) / 2;
            const thickness = (outerR - innerR);

            ctx.lineWidth = thickness;
            ctx.strokeStyle = band.color;

            ctx.beginPath();
            if (back) {
                // Upper half (behind)
                ctx.ellipse(0, 0, midR, midR * 0.4, 0, Math.PI, 0, false);
            } else {
                // Lower half (front)
                ctx.ellipse(0, 0, midR, midR * 0.4, 0, 0, Math.PI, false);
            }
            ctx.stroke();
        }

        ctx.restore();
    }
}

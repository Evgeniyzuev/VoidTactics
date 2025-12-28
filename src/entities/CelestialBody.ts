import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';

export class CelestialBody extends Entity {
    public color: string;
    public name: string;
    public isStar: boolean;

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

    update(_dt: number) {
        // Static for now, or orbit logic later
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const screenPos = camera.worldToScreen(this.position);
        // Check if on screen (culling) - simplified
        // if (screenPos.x < -this.radius ...) return;

        if (this.isStar) {
            // Glow effect
            const gradient = ctx.createRadialGradient(
                screenPos.x, screenPos.y, this.radius * camera.zoom * 0.2,
                screenPos.x, screenPos.y, this.radius * camera.zoom * 2
            );
            gradient.addColorStop(0, 'white');
            gradient.addColorStop(0.1, this.color);
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, this.radius * camera.zoom * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Star Solid Core
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, this.radius * camera.zoom * 0.8, 0, Math.PI * 2);
            ctx.fill();

        } else {
            // 1. Draw Planet Base Color
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, this.radius * camera.zoom, 0, Math.PI * 2);
            ctx.fill();

            // Contrast Stroke
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // 2. Calculate Angle to Sun (0,0)
            // Since Sun is at 0,0, vector TO sun is (0-x, 0-y) = -position
            const toSun = new Vector2(-this.position.x, -this.position.y);
            const angleToSun = Math.atan2(toSun.y, toSun.x);

            // 3. Draw Shadow (Night Side) in Local Space
            // We rotate the context so "Right" is towards the sun, then draw shadow on the "Left"
            ctx.save();
            ctx.translate(screenPos.x, screenPos.y);
            ctx.rotate(angleToSun); // Rotate so X-axis points to sun

            const r = this.radius * camera.zoom;

            // Draw Shadow with curved terminator
            // We use an elliptical arc for the terminator to give a 3D spherical feel
            ctx.beginPath();
            // Outer semi-circle (dark side)
            ctx.arc(0, 0, r, Math.PI * 0.5, Math.PI * 1.5);
            // Curved terminator bulging into the dark side (making shadow cover < 50% for "from sun" look)
            // Or bulging into light side for crescent. 
            // The user wants "slightly from sun side", so shadow should be a bit smaller than 50%.
            ctx.ellipse(0, 0, r * 0.3, r, 0, Math.PI * 1.5, Math.PI * 0.5, true);

            // Use a gradient for the shadow to soften the transition
            const shadowGrad = ctx.createLinearGradient(-r, 0, r * 0.4, 0);
            shadowGrad.addColorStop(0, 'rgba(0,0,0,0.8)');
            shadowGrad.addColorStop(0.8, 'rgba(0,0,0,0.7)');
            shadowGrad.addColorStop(1, 'rgba(0,0,0,0.1)'); // Soft edge at terminator

            ctx.fillStyle = shadowGrad;
            ctx.fill();

            ctx.restore();
        }
    }
}

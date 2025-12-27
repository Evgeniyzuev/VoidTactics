import { Vector2 } from '../utils/Vector2';

export class InputManager {
    public mousePos: Vector2 = new Vector2(0, 0);
    public isMouseDown: boolean = false;

    private canvas: HTMLCanvasElement;
    private wheelDelta: number = 0;
    private lastPinchDistance: number = 0;
    private pinchDelta: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.initListeners();
    }

    private initListeners() {
        // Pointer Events (Unified Mouse/Touch)
        window.addEventListener('pointerdown', (e) => {
            this.isMouseDown = true;
            this.mousePos = new Vector2(e.clientX, e.clientY);
        });

        window.addEventListener('pointermove', (e) => {
            this.mousePos = new Vector2(e.clientX, e.clientY);
        });

        window.addEventListener('pointerup', () => {
            this.isMouseDown = false;
        });

        // Mouse Wheel for Zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.wheelDelta = -Math.sign(e.deltaY); // Positive = zoom in
        }, { passive: false });

        // Touch Events for Pinch Zoom
        let touches: TouchList | null = null;

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                touches = e.touches;
                const dist = this.getTouchDistance(touches);
                this.lastPinchDistance = dist;
            }
        });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && touches) {
                e.preventDefault();
                const dist = this.getTouchDistance(e.touches);
                const delta = dist - this.lastPinchDistance;
                this.pinchDelta = Math.sign(delta) * 0.5; // Sensitivity adjustment
                this.lastPinchDistance = dist;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', () => {
            touches = null;
            this.lastPinchDistance = 0;
        });
    }

    private getTouchDistance(touches: TouchList): number {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    public getWheelDelta(): number {
        const delta = this.wheelDelta;
        this.wheelDelta = 0; // Consume
        return delta;
    }

    public getPinchDelta(): number {
        const delta = this.pinchDelta;
        this.pinchDelta = 0; // Consume
        return delta;
    }
}

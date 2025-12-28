import { Vector2 } from '../utils/Vector2';

export class InputManager {
    public mousePos: Vector2 = new Vector2(0, 0);
    public isMouseDown: boolean = false;

    private canvas: HTMLCanvasElement;
    private wheelDelta: number = 0;
    private pinchDelta: number = 0;
    private lastClickTime: number = 0;
    private lastClickPos: Vector2 = new Vector2(0, 0);
    private doubleClickThreshold: number = 300; // milliseconds
    private doubleClickDistThreshold: number = 30; // pixels
    private isDoubleClickFlag: boolean = false;

    // Multi-touch tracking
    private activePointers: Map<number, Vector2> = new Map();
    private initialPinchDistance: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.initListeners();
    }

    private initListeners() {
        // Pointer Events (Unified Mouse/Touch)
        window.addEventListener('pointerdown', (e) => {
            this.activePointers.set(e.pointerId, new Vector2(e.clientX, e.clientY));

            if (this.activePointers.size === 1) {
                this.isMouseDown = true;
                this.mousePos = new Vector2(e.clientX, e.clientY);

                // Track click timing for double-click detection (only if 1 pointer)
                const now = Date.now();
                const timeSinceLastClick = now - this.lastClickTime;
                const distSinceLastClick = Vector2.distance(this.mousePos, this.lastClickPos);

                if (timeSinceLastClick > 0 && timeSinceLastClick < this.doubleClickThreshold && distSinceLastClick < this.doubleClickDistThreshold) {
                    this.isDoubleClickFlag = true;
                } else {
                    this.isDoubleClickFlag = false;
                }

                this.lastClickTime = now;
                this.lastClickPos = this.mousePos.clone();
            } else if (this.activePointers.size === 2) {
                // Potential Pinch Start
                this.isMouseDown = false;
                this.isDoubleClickFlag = false; // Cancel any pending DC
                this.initialPinchDistance = this.getPointersDistance();
            }
        });

        window.addEventListener('pointermove', (e) => {
            const pos = new Vector2(e.clientX, e.clientY);
            this.activePointers.set(e.pointerId, pos);

            if (this.activePointers.size === 1) {
                this.mousePos = pos;
            } else if (this.activePointers.size === 2) {
                const dist = this.getPointersDistance();
                if (this.initialPinchDistance > 10) { // Avoid division by zero/tiny
                    const ratio = dist / this.initialPinchDistance;
                    this.pinchDelta = (ratio - 1) * 5.0; // Scaled for Camera.adjustZoom
                    this.initialPinchDistance = dist;
                }
            }
        });

        const handlePointerUp = (e: PointerEvent) => {
            this.activePointers.delete(e.pointerId);
            if (this.activePointers.size === 0) {
                this.isMouseDown = false;
            } else if (this.activePointers.size < 2) {
                this.initialPinchDistance = 0;
            }
        };

        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);

        // Mouse Wheel for Zoom (remain for PC)
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.wheelDelta = -Math.sign(e.deltaY); // Positive = zoom in
        }, { passive: false });
    }

    private getPointersDistance(): number {
        if (this.activePointers.size < 2) return 0;
        const pts = Array.from(this.activePointers.values());
        return Vector2.distance(pts[0], pts[1]);
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

    public isDoubleClick(): boolean {
        const flag = this.isDoubleClickFlag;
        this.isDoubleClickFlag = false; // Consume the flag
        return flag;
    }
}

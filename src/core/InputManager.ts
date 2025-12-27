import { Vector2 } from '../utils/Vector2';

export class InputManager {
    public mousePos: Vector2 = new Vector2();
    public isMouseDown: boolean = false;
    // potentially track keys, etc.

    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.initListeners();
    }

    private initListeners() {
        window.addEventListener('pointermove', (e) => this.onPointerMove(e));
        window.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        window.addEventListener('pointerup', (e) => this.onPointerUp(e));
        // Context menu allowed for debugging
    }

    private onPointerMove(e: PointerEvent) {
        this.mousePos.x = e.clientX;
        this.mousePos.y = e.clientY;
    }

    private onPointerDown(e: PointerEvent) {
        this.isMouseDown = true;
        this.mousePos.x = e.clientX;
        this.mousePos.y = e.clientY;
    }

    private onPointerUp(_e: PointerEvent) {
        this.isMouseDown = false;
    }
}

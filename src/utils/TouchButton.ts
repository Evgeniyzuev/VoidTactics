type ButtonAction = (event: Event) => void;

const MAX_TOUCH_MOVEMENT = 12;
const SYNTHETIC_CLICK_DELAY = 700;

export function bindButtonAction(button: HTMLButtonElement, action: ButtonAction) {
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let suppressClickUntil = 0;

    button.addEventListener('pointerdown', event => {
        event.stopPropagation();
        if (event.pointerType === 'mouse') return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
    });

    button.addEventListener('pointerup', event => {
        event.stopPropagation();
        if (event.pointerType === 'mouse' || event.pointerId !== pointerId) return;

        const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
        pointerId = null;
        if (moved > MAX_TOUCH_MOVEMENT || button.disabled) {
            suppressClickUntil = performance.now() + SYNTHETIC_CLICK_DELAY;
            return;
        }

        event.preventDefault();
        suppressClickUntil = performance.now() + SYNTHETIC_CLICK_DELAY;
        action(event);
    });

    button.addEventListener('pointercancel', event => {
        if (event.pointerId === pointerId) pointerId = null;
    });

    button.addEventListener('click', event => {
        event.stopPropagation();
        if (button.disabled || performance.now() < suppressClickUntil) {
            event.preventDefault();
            return;
        }
        action(event);
    });
}

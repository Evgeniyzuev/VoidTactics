export class UIManager {
    private container: HTMLElement;
    private onPlayPause: () => void;
    private onSpeedChange: (speed: number) => void;

    private playBtn!: HTMLButtonElement;
    private speedBtns: HTMLButtonElement[] = [];

    constructor(
        containerId: string,
        callbacks: {
            onPlayPause: () => void,
            onSpeedChange: (speed: number) => void
        }
    ) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error('UI Layer not found');
        this.container = el;
        this.onPlayPause = callbacks.onPlayPause;
        this.onSpeedChange = callbacks.onSpeedChange;

        this.render();
    }

    private render() {
        const hud = document.createElement('div');
        hud.id = 'hud';

        // Play/Pause Button
        this.playBtn = document.createElement('button');
        this.playBtn.className = 'control-btn';
        this.playBtn.innerText = '⏸'; // Default to Pause (Running)
        this.playBtn.onclick = () => {
            this.onPlayPause();
        };

        const sep = document.createElement('div');
        sep.className = 'separator';

        // Speed Buttons
        const speeds = [0.25, 0.5, 1, 2, 4];
        const speedGroup = document.createElement('div');
        speedGroup.className = 'control-group';

        speeds.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'control-btn' + (s === 1 ? ' active' : '');
            btn.innerText = s + 'x';
            btn.onclick = () => {
                this.onSpeedChange(s);
                this.updateSpeedSelection(s);
            };
            this.speedBtns.push(btn);
            speedGroup.appendChild(btn);
        });

        hud.appendChild(this.playBtn);
        hud.appendChild(sep);
        hud.appendChild(speedGroup);
        this.container.appendChild(hud);
    }

    public updatePlayIcon(isPaused: boolean) {
        this.playBtn.innerText = isPaused ? '▶' : '⏸';
    }

    public updateSpeedSelection(speed: number) {
        this.speedBtns.forEach(btn => {
            const val = parseFloat(btn.innerText);
            if (val === speed) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }
}

export class UIManager {
    private container: HTMLElement;
    private onPlayPause: () => void;
    private onSpeedChange: (speed: number) => void;
    private onCameraToggle: (follow: boolean) => void;

    private playBtn!: HTMLButtonElement;
    private cameraFollowBtn!: HTMLButtonElement;
    private speedBtn!: HTMLButtonElement;
    private speedGroup!: HTMLElement;
    private speedBtns: HTMLButtonElement[] = [];
    private speedExpanded: boolean = false;
    private currentSpeed: number = 1;
    private cameraFollow: boolean = true;

    constructor(
        containerId: string,
        callbacks: {
            onPlayPause: () => void,
            onSpeedChange: (speed: number) => void,
            onCameraToggle: (follow: boolean) => void
        }
    ) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error('UI Layer not found');
        this.container = el;
        this.onPlayPause = callbacks.onPlayPause;
        this.onSpeedChange = callbacks.onSpeedChange;
        this.onCameraToggle = callbacks.onCameraToggle;

        this.render();
    }

    private render() {
        const hud = document.createElement('div');
        hud.id = 'hud';

        // Prevent clicks from propagating to game world
        hud.addEventListener('click', (e) => e.stopPropagation());
        hud.addEventListener('pointerdown', (e) => e.stopPropagation());

        // Play/Pause Button
        this.playBtn = document.createElement('button');
        this.playBtn.className = 'control-btn';
        this.playBtn.innerText = '⏸';
        this.playBtn.title = 'Play/Pause';
        this.playBtn.onclick = () => {
            this.onPlayPause();
        };

        const sep1 = document.createElement('div');
        sep1.className = 'separator';

        // Speed Toggle Button (collapsed state)
        this.speedBtn = document.createElement('button');
        this.speedBtn.className = 'control-btn';
        this.speedBtn.innerText = `${this.currentSpeed}x`;
        this.speedBtn.title = 'Game Speed';
        this.speedBtn.onclick = () => this.toggleSpeedExpansion();

        // Speed Options Group (hidden by default)
        this.speedGroup = document.createElement('div');
        this.speedGroup.className = 'control-group speed-options';
        this.speedGroup.style.display = 'none';

        const speeds = [0.25, 0.5, 1, 2, 4];
        speeds.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'control-btn' + (s === 1 ? ' active' : '');
            btn.innerText = s + 'x';
            btn.onclick = () => {
                this.currentSpeed = s;
                this.onSpeedChange(s);
                this.updateSpeedSelection(s);
                this.toggleSpeedExpansion(); // Collapse after selection
            };
            this.speedBtns.push(btn);
            this.speedGroup.appendChild(btn);
        });

        const sep2 = document.createElement('div');
        sep2.className = 'separator';

        // Camera Follow Button
        this.cameraFollowBtn = document.createElement('button');
        this.cameraFollowBtn.className = 'control-btn active';
        this.cameraFollowBtn.innerText = '📹';
        this.cameraFollowBtn.title = 'Camera Follow';
        this.cameraFollowBtn.onclick = () => this.toggleCameraFollow();

        hud.appendChild(this.playBtn);
        hud.appendChild(sep1);
        hud.appendChild(this.speedBtn);
        hud.appendChild(this.speedGroup);
        hud.appendChild(sep2);
        hud.appendChild(this.cameraFollowBtn);
        this.container.appendChild(hud);
    }

    private toggleCameraFollow() {
        this.cameraFollow = !this.cameraFollow;
        if (this.cameraFollow) {
            this.cameraFollowBtn.classList.add('active');
        } else {
            this.cameraFollowBtn.classList.remove('active');
        }
        this.onCameraToggle(this.cameraFollow);
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

    private toggleSpeedExpansion() {
        this.speedExpanded = !this.speedExpanded;
        if (this.speedExpanded) {
            this.speedBtn.style.display = 'none';
            this.speedGroup.style.display = 'flex';
        } else {
            this.speedBtn.style.display = 'block';
            this.speedBtn.innerText = `${this.currentSpeed}x`;
            this.speedGroup.style.display = 'none';
        }
    }
}

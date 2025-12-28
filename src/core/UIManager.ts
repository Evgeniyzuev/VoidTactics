export class UIManager {
    private container: HTMLElement;
    private onPlayPause: () => void;
    private onSpeedChange: (speed: number) => void;
    private onCameraToggle: (follow: boolean) => void;
    private onAbility: (ability: string) => void;

    private playBtn!: HTMLButtonElement;
    private cameraFollowBtn!: HTMLButtonElement;
    private speedBtn!: HTMLButtonElement;
    private currentSpeed: number = 1;
    private cameraFollow: boolean = true;

    private abilityButtons: Record<string, HTMLButtonElement> = {};
    private abilityCooldowns: Record<string, HTMLElement> = {};

    constructor(
        containerId: string,
        callbacks: {
            onPlayPause: () => void,
            onSpeedChange: (speed: number) => void,
            onCameraToggle: (follow: boolean) => void,
            onAbility: (ability: string) => void
        }
    ) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error('UI Layer not found');
        this.container = el;
        this.onPlayPause = callbacks.onPlayPause;
        this.onSpeedChange = callbacks.onSpeedChange;
        this.onCameraToggle = callbacks.onCameraToggle;
        this.onAbility = callbacks.onAbility;

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

        // Speed Control Group
        const speedContainer = document.createElement('div');
        speedContainer.className = 'speed-control-group';
        speedContainer.style.display = 'flex';
        speedContainer.style.alignItems = 'center';
        speedContainer.style.gap = '5px';

        const minusBtn = document.createElement('button');
        minusBtn.className = 'control-btn';
        minusBtn.innerText = '−';
        minusBtn.title = 'Decrease Speed (-10%)';
        minusBtn.onclick = () => {
            this.currentSpeed = Math.max(0.1, Math.round((this.currentSpeed - 0.1) * 10) / 10);
            this.onSpeedChange(this.currentSpeed);
            this.updateSpeedDisplay();
        };

        this.speedBtn = document.createElement('button');
        this.speedBtn.className = 'control-btn speed-value';
        this.speedBtn.innerText = `${this.currentSpeed.toFixed(1)}x`;
        this.speedBtn.style.minWidth = '50px';
        this.speedBtn.style.cursor = 'default';

        const plusBtn = document.createElement('button');
        plusBtn.className = 'control-btn';
        plusBtn.innerText = '+';
        plusBtn.title = 'Increase Speed (+10%)';
        plusBtn.onclick = () => {
            this.currentSpeed = Math.min(10, Math.round((this.currentSpeed + 0.1) * 10) / 10);
            this.onSpeedChange(this.currentSpeed);
            this.updateSpeedDisplay();
        };

        speedContainer.appendChild(minusBtn);
        speedContainer.appendChild(this.speedBtn);
        speedContainer.appendChild(plusBtn);

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
        hud.appendChild(speedContainer);
        hud.appendChild(sep2);
        hud.appendChild(this.cameraFollowBtn);
        this.container.appendChild(hud);

        // Ability Panel (Bottom Center)
        this.renderAbilityPanel();
    }

    private renderAbilityPanel() {
        const panel = document.createElement('div');
        panel.id = 'ability-panel';
        panel.style.position = 'absolute';
        panel.style.bottom = '20px';
        panel.style.left = '50%';
        panel.style.transform = 'translateX(-50%)';
        panel.style.zIndex = '50';
        panel.style.display = 'flex';
        panel.style.gap = '15px';
        panel.style.padding = '10px 20px';
        panel.style.background = 'rgba(0, 0, 0, 0.6)';
        panel.style.backdropFilter = 'blur(10px)';
        panel.style.borderRadius = '50px';
        panel.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        panel.style.pointerEvents = 'auto';

        const abilities = [
            { id: 'afterburner', icon: '🚀', color: '#FF4400', title: 'Afterburner (Boost Speed)' },
            { id: 'bubble', icon: '🫧', color: '#00AAFF', title: 'Bubble (Stop Nearby)' },
            { id: 'cloak', icon: '👻', color: '#AAAAAA', title: 'Cloak (Invisibility)' }
        ];

        abilities.forEach(ability => {
            const btn = document.createElement('button');
            btn.className = 'ability-btn';
            btn.style.width = '50px';
            btn.style.height = '50px';
            btn.style.borderRadius = '50%';
            btn.style.border = '2px solid rgba(255, 255, 255, 0.1)';
            btn.style.background = 'rgba(20, 20, 25, 0.8)';
            btn.style.color = 'white';
            btn.style.fontSize = '24px';
            btn.style.cursor = 'pointer';
            btn.style.position = 'relative';
            btn.style.overflow = 'hidden';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.transition = 'all 0.2s';
            btn.title = ability.title;

            btn.onmouseenter = () => {
                btn.style.border = `2px solid ${ability.color}`;
                btn.style.boxShadow = `0 0 15px ${ability.color}`;
            };
            btn.onmouseleave = () => {
                btn.style.border = '2px solid rgba(255, 255, 255, 0.1)';
                btn.style.boxShadow = 'none';
            };

            const overlay = document.createElement('div');
            overlay.style.position = 'absolute';
            overlay.style.bottom = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '0%';
            overlay.style.background = 'rgba(0,0,0,0.5)';
            overlay.style.transition = 'height 0.1s linear';

            const timerText = document.createElement('div');
            timerText.style.position = 'absolute';
            timerText.style.fontSize = '12px';
            timerText.style.fontWeight = 'bold';
            timerText.style.color = 'white';

            btn.onclick = (e) => {
                e.stopPropagation();
                this.onAbility(ability.id);
            };

            btn.appendChild(overlay);
            btn.appendChild(timerText);
            const iconSpan = document.createElement('span');
            iconSpan.innerText = ability.icon;
            iconSpan.style.zIndex = '1';
            btn.appendChild(iconSpan);

            this.abilityButtons[ability.id] = btn;
            this.abilityCooldowns[ability.id] = overlay;
            panel.appendChild(btn);
        });

        panel.addEventListener('click', (e) => e.stopPropagation());
        panel.addEventListener('pointerdown', (e) => e.stopPropagation());

        this.container.appendChild(panel);
    }

    public updateAbilities(fleet: any) {
        for (const key in fleet.abilities) {
            const a = fleet.abilities[key];
            const btn = this.abilityButtons[key];
            const overlay = this.abilityCooldowns[key];

            if (btn && overlay) {
                // Update cooldown overlay
                if (a.cooldown > 0) {
                    const perc = (a.cooldown / a.cdMax) * 100;
                    overlay.style.height = `${perc}%`;
                    btn.style.opacity = '0.5';
                    btn.style.cursor = 'not-allowed';
                } else {
                    overlay.style.height = '0%';
                    btn.style.opacity = '1.0';
                    btn.style.cursor = 'pointer';
                }

                // Visual active state
                if (a.active) {
                    btn.style.border = '2px solid #FFFFFF';
                    btn.style.boxShadow = '0 0 20px #FFFFFF';
                } else if (btn.style.border === '2px solid rgb(255, 255, 255)') {
                    btn.style.border = '2px solid rgba(255, 255, 255, 0.1)';
                    btn.style.boxShadow = 'none';
                }
            }
        }
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

    public setCameraFollowState(follow: boolean) {
        this.cameraFollow = follow;
        if (this.cameraFollow) {
            this.cameraFollowBtn.classList.add('active');
        } else {
            this.cameraFollowBtn.classList.remove('active');
        }
    }

    private updateSpeedDisplay() {
        this.speedBtn.innerText = `${this.currentSpeed.toFixed(1)}x`;
    }
}

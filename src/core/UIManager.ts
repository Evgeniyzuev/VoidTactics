export class UIManager {
    private container: HTMLElement;
    private onPlayPause: () => void;
    private onSpeedChange: (speed: number) => void;
    private onCameraToggle: (follow: boolean) => void;
    private onAbility: (ability: string) => void;

    private playBtn!: HTMLButtonElement;
    private cameraFollowBtn!: HTMLButtonElement;
    private speedBtn!: HTMLButtonElement;
    private speedGroup!: HTMLElement;
    private speedBtns: HTMLButtonElement[] = [];
    private speedExpanded: boolean = false;
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

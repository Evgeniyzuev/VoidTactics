import { formatNumber } from '../utils/NumberFormatter';

export class UIManager {
    private container: HTMLElement;
    private onPlayPause: () => void;
    private onSpeedChange: (speed: number) => void;
    private onCameraToggle: (follow: boolean) => void;
    private onAbility: (ability: string) => void;
    private onMenu: () => void;

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
            onAbility: (ability: string) => void,
            onMenu: () => void
        }
    ) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error('UI Layer not found');
        this.container = el;
        this.onPlayPause = callbacks.onPlayPause;
        this.onSpeedChange = callbacks.onSpeedChange;
        this.onCameraToggle = callbacks.onCameraToggle;
        this.onAbility = callbacks.onAbility;
        this.onMenu = callbacks.onMenu;

        this.render();
    }

    private render() {
        const hud = document.createElement('div');
        hud.id = 'hud';

        // Prevent clicks from propagating to game world
        hud.addEventListener('click', (e) => e.stopPropagation());
        hud.addEventListener('pointerdown', (e) => e.stopPropagation());

        // Menu Button
        const menuBtn = document.createElement('button');
        menuBtn.className = 'control-btn';
        menuBtn.innerText = '☰';
        menuBtn.title = 'Game Menu';
        menuBtn.style.marginLeft = '8px';
        menuBtn.onclick = () => this.onMenu();

        // Play/Pause Button
        this.playBtn = document.createElement('button');
        this.playBtn.className = 'control-btn';
        this.playBtn.innerText = '⏸';
        this.playBtn.title = 'Play/Pause';
        this.playBtn.onclick = () => {
            this.onPlayPause();
        };

        // Speed Control Group
        const speedContainer = document.createElement('div');
        speedContainer.className = 'speed-control-group';
        speedContainer.style.display = 'flex';
        speedContainer.style.alignItems = 'center';
        speedContainer.style.gap = '2px';

        const minusBtn = document.createElement('button');
        minusBtn.className = 'control-btn';
        minusBtn.innerText = '−';
        minusBtn.title = 'Decrease Speed (-10%)';
        minusBtn.style.padding = '4px 8px';
        minusBtn.style.minWidth = '30px';
        minusBtn.onclick = () => {
            this.currentSpeed = Math.max(0.1, Math.round((this.currentSpeed - 0.1) * 10) / 10);
            this.onSpeedChange(this.currentSpeed);
            this.updateSpeedDisplay();
        };

        this.speedBtn = document.createElement('button');
        this.speedBtn.className = 'control-btn speed-value';
        this.speedBtn.innerText = `${this.currentSpeed.toFixed(1)}x`;
        this.speedBtn.style.minWidth = '45px';
        this.speedBtn.style.padding = '4px 8px';
        this.speedBtn.style.cursor = 'pointer';

        let pressTimer: any;
        let isLongPress = false;

        this.speedBtn.onpointerdown = () => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                // Long click: increase
                if (this.currentSpeed < 1.0) {
                    this.currentSpeed = 1.0;
                } else if (this.currentSpeed < 2.0) {
                    this.currentSpeed = 2.0;
                }
                this.onSpeedChange(this.currentSpeed);
                this.updateSpeedDisplay();
            }, 500);
        };

        this.speedBtn.onpointerup = () => {
            clearTimeout(pressTimer);
            if (!isLongPress) {
                // Short click: decrease
                if (this.currentSpeed > 1.0) {
                    this.currentSpeed = 1.0;
                } else if (this.currentSpeed > 0.5) {
                    this.currentSpeed = 0.5;
                } else if (this.currentSpeed <= 0.5) {
                    // Optional: loop or stay at min? 
                    // User said "next value", let's keep it at 0.5 if already at min milestones
                }
                this.onSpeedChange(this.currentSpeed);
                this.updateSpeedDisplay();
            }
        };

        this.speedBtn.onpointerleave = () => clearTimeout(pressTimer);

        const plusBtn = document.createElement('button');
        plusBtn.className = 'control-btn';
        plusBtn.innerText = '+';
        plusBtn.title = 'Increase Speed (+10%)';
        plusBtn.style.padding = '4px 8px';
        plusBtn.style.minWidth = '30px';
        plusBtn.onclick = () => {
            this.currentSpeed = Math.min(4.0, Math.round((this.currentSpeed + 0.1) * 10) / 10);
            this.onSpeedChange(this.currentSpeed);
            this.updateSpeedDisplay();
        };

        speedContainer.appendChild(minusBtn);
        speedContainer.appendChild(this.speedBtn);
        speedContainer.appendChild(plusBtn);

        // Camera Follow Button
        this.cameraFollowBtn = document.createElement('button');
        this.cameraFollowBtn.className = 'control-btn active';
        this.cameraFollowBtn.innerText = '📹';
        this.cameraFollowBtn.title = 'Camera Follow';
        this.cameraFollowBtn.onclick = () => this.toggleCameraFollow();

        hud.appendChild(this.playBtn);
        hud.appendChild(speedContainer);
        hud.appendChild(this.cameraFollowBtn);
        hud.appendChild(menuBtn);
        this.container.appendChild(hud);

        // Initialize speed scaling (fix for page reload issue)
        this.onSpeedChange(this.currentSpeed);

        // Ability Panel (Bottom Center)
        this.renderAbilityPanel();
    }

    private renderAbilityPanel() {
        const panel = document.createElement('div');
        panel.id = 'ability-panel';
        panel.style.position = 'absolute';
        panel.style.bottom = '10px';
        panel.style.left = '50%';
        panel.style.transform = 'translateX(-50%)';
        panel.style.zIndex = '50';
        panel.style.display = 'flex';
        panel.style.gap = '8px';
        panel.style.alignItems = 'center';
        panel.style.padding = '6px 12px';
        panel.style.background = 'rgba(0, 0, 0, 0.6)';
        panel.style.backdropFilter = 'blur(10px)';
        panel.style.borderRadius = '30px';
        panel.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        panel.style.pointerEvents = 'auto';

        // Strength display
        const strengthDisplay = document.createElement('div');
        strengthDisplay.id = 'strength-display';
        strengthDisplay.style.color = '#FFFFFF';
        strengthDisplay.style.fontSize = '16px';
        strengthDisplay.style.fontWeight = 'bold';
        strengthDisplay.style.fontFamily = 'monospace';
        strengthDisplay.style.marginRight = '10px';
        strengthDisplay.textContent = '💪: 10';
        panel.appendChild(strengthDisplay);

        // Money display
        const moneyDisplay = document.createElement('div');
        moneyDisplay.id = 'money-display';
        moneyDisplay.style.color = '#FFD700';
        moneyDisplay.style.fontSize = '16px';
        moneyDisplay.style.fontWeight = 'bold';
        moneyDisplay.style.fontFamily = 'monospace';
        moneyDisplay.style.marginRight = '10px';
        moneyDisplay.textContent = '$: 0';
        panel.appendChild(moneyDisplay);

        const abilities = [
            { id: 'afterburner', icon: '🚀', color: '#FF4400', title: 'Afterburner (Boost Speed)' },
            { id: 'bubble', icon: '🫧', color: '#00AAFF', title: 'Bubble (Stop Nearby)' },
            { id: 'cloak', icon: '👻', color: '#AAAAAA', title: 'Cloak (Invisibility)' }
        ];

        abilities.forEach(ability => {
            const btn = document.createElement('button');
            btn.className = 'ability-btn';
            btn.style.width = '40px';
            btn.style.height = '40px';
            btn.style.borderRadius = '50%';
            btn.style.border = '2px solid rgba(255, 255, 255, 0.1)';
            btn.style.background = 'rgba(20, 20, 25, 0.8)';
            btn.style.color = 'white';
            btn.style.fontSize = '20px';
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
            overlay.style.background = 'rgba(100,200,255,0.8)';
            overlay.style.transition = 'height 0s';

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
                if (a.cooldown > 0) {
                    const perc = (1 - a.cooldown / a.cdMax) * 100;
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

    public updateMoney(money: number) {
        const moneyDisplay = document.getElementById('money-display');
        if (moneyDisplay) {
            moneyDisplay.textContent = `$: ${formatNumber(money)}`;
        }
    }

    public updateStrength(strength: number) {
        const strengthDisplay = document.getElementById('strength-display');
        if (strengthDisplay) {
            strengthDisplay.textContent = `💪: ${formatNumber(strength)}`;
        }
    }
}

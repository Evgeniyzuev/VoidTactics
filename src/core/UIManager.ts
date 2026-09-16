import { formatNumber } from '../utils/NumberFormatter';
import type { Fleet } from '../entities/Fleet';
import { COMBAT_BALANCE, TACTICAL_BALANCE, type FleetOrderType, type TargetPriority } from '../tactical/ShipDefinitions';
import { bindButtonAction } from '../utils/TouchButton';
import type { WorldEvent } from '../entities/WorldEvent';
import type { SensorContact } from '../tactical/SensorService';

export class UIManager {
    private container: HTMLElement;
    private onPlayPause: () => void;
    private onSpeedChange: (speed: number) => void;
    private onCameraToggle: (follow: boolean) => void;
    private onAbility: (ability: string) => void;
    private onMenu: () => void;
    private onOrder: (order: FleetOrderType) => void;
    private onDoctrine: (priority: TargetPriority) => void;
    private onFaq: () => void;
    private onSignalAction: (action: 'track' | 'inspect', event: WorldEvent) => void;
    private fleetPanel!: HTMLElement;
    private eventLog!: HTMLElement;
    private signalTracker!: HTMLElement;
    private signalTitle!: HTMLElement;
    private signalDetails!: HTMLElement;
    private trackedSignal: WorldEvent | null = null;
    private ignoredSignals = new Set<string>();
    private fleetPanelCollapsed: boolean = window.matchMedia('(max-width: 700px)').matches;
    private currentFleet: Fleet | null = null;

    private playBtn!: HTMLButtonElement;
    private cameraFollowBtn!: HTMLButtonElement;
    private speedBtn!: HTMLButtonElement;
    private currentSpeed: number = 1;
    private cameraFollow: boolean = true;

    private abilityButtons: Record<string, HTMLButtonElement> = {};
    private abilityCooldowns: Record<string, HTMLElement> = {};
    private abilityTimers: Record<string, HTMLElement> = {};
    private levelDisplay!: HTMLElement;
    private levelText!: HTMLElement;
    private levelFill!: HTMLElement;
    private abilityPoolDisplay!: HTMLElement;

    constructor(
        containerId: string,
        callbacks: {
            onPlayPause: () => void,
            onSpeedChange: (speed: number) => void,
            onCameraToggle: (follow: boolean) => void,
            onAbility: (ability: string) => void,
            onMenu: () => void,
            onOrder: (order: FleetOrderType) => void,
            onDoctrine: (priority: TargetPriority) => void,
            onFaq: () => void,
            onSignalAction: (action: 'track' | 'inspect', event: WorldEvent) => void
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
        this.onOrder = callbacks.onOrder;
        this.onDoctrine = callbacks.onDoctrine;
        this.onFaq = callbacks.onFaq;
        this.onSignalAction = callbacks.onSignalAction;

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
        bindButtonAction(menuBtn, () => this.onMenu());

        // Play/Pause Button
        this.playBtn = document.createElement('button');
        this.playBtn.className = 'control-btn';
        this.playBtn.innerText = '⏸';
        this.playBtn.title = 'Play/Pause';
        bindButtonAction(this.playBtn, () => {
            this.onPlayPause();
        });

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
        minusBtn.style.minWidth = '44px';
        bindButtonAction(minusBtn, () => {
            this.currentSpeed = Math.max(0.1, Math.round((this.currentSpeed - 0.1) * 10) / 10);
            this.onSpeedChange(this.currentSpeed);
            this.updateSpeedDisplay();
        });

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
        plusBtn.style.minWidth = '44px';
        bindButtonAction(plusBtn, () => {
            this.currentSpeed = Math.min(4.0, Math.round((this.currentSpeed + 0.1) * 10) / 10);
            this.onSpeedChange(this.currentSpeed);
            this.updateSpeedDisplay();
        });

        speedContainer.appendChild(minusBtn);
        speedContainer.appendChild(this.speedBtn);
        speedContainer.appendChild(plusBtn);

        // Camera Follow Button
        this.cameraFollowBtn = document.createElement('button');
        this.cameraFollowBtn.className = 'control-btn active';
        this.cameraFollowBtn.innerText = '📹';
        this.cameraFollowBtn.title = 'Camera Follow';
        bindButtonAction(this.cameraFollowBtn, () => this.toggleCameraFollow());

        const faqBtn = document.createElement('button');
        faqBtn.className = 'control-btn';
        faqBtn.innerText = '?';
        faqBtn.title = 'FAQ / Help';
        bindButtonAction(faqBtn, () => this.onFaq());

        hud.appendChild(this.playBtn);
        hud.appendChild(speedContainer);
        hud.appendChild(this.cameraFollowBtn);
        hud.appendChild(faqBtn);
        hud.appendChild(menuBtn);
        this.container.appendChild(hud);

        // Initialize speed scaling (fix for page reload issue)
        this.onSpeedChange(this.currentSpeed);

        // Ability Panel (Bottom Center)
        this.renderAbilityPanel();
        this.renderFleetPanel();
        this.renderSignalTracker();
        this.renderEventLog();
    }

    private renderSignalTracker() {
        const tracker = document.createElement('div');
        tracker.id = 'signal-tracker';
        const badge = document.createElement('b');
        badge.textContent = 'SIGNAL';
        this.signalTitle = document.createElement('span');
        this.signalDetails = document.createElement('small');
        const actions = document.createElement('div');
        actions.className = 'signal-actions';
        const addAction = (label: string, action: 'track' | 'inspect' | 'ignore') => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            bindButtonAction(button, () => {
                const event = this.trackedSignal;
                if (!event) return;
                if (action === 'ignore') {
                    this.ignoredSignals.add(event.id);
                    this.trackedSignal = null;
                    this.updateSignals([], this.currentFleet || undefined);
                    return;
                }
                this.onSignalAction(action, event);
            });
            actions.appendChild(button);
        };
        addAction('Track', 'track');
        addAction('Inspect', 'inspect');
        addAction('Ignore', 'ignore');
        tracker.append(badge, this.signalTitle, this.signalDetails, actions);
        this.container.appendChild(tracker);
        this.signalTracker = tracker;
    }

    public updateSignals(events: WorldEvent[], player?: Fleet, getContact?: (event: WorldEvent) => SensorContact | null) {
        if (!this.signalTracker) return;
        const tracked = events
            .filter(candidate => candidate.active && candidate.discovered && !this.ignoredSignals.has(candidate.id))
            .map(event => ({ event, contact: getContact?.(event) || null }))
            .filter(entry => !getContact || entry.contact !== null)
            .sort((a, b) => a.event.timeLeft - b.event.timeLeft)[0];
        if (!tracked) {
            this.signalTracker.classList.remove('visible');
            this.trackedSignal = null;
            return;
        }
        const { event, contact } = tracked;
        this.trackedSignal = event;
        this.signalTracker.classList.add('visible');
        const distance = player ? Math.round(Math.hypot(event.position.x - player.position.x, event.position.y - player.position.y)) : 0;
        const knownThreat = contact?.intel.threat || 0;
        const relativeRisk = player && knownThreat ? knownThreat / Math.max(1, player.threatRating) : 0;
        const risk = !player ? '' : relativeRisk < 0.65 ? 'LOW' : relativeRisk < 1.25 ? 'EVEN' : relativeRisk < 2 ? 'HIGH' : 'EXTREME';
        const quality = contact?.stale ? 'stale' : contact?.level || 'lost';
        this.signalTitle.textContent = contact?.level === 'identified' ? (contact.intel.signalTitle || event.title) : 'CLASSIFIED SIGNAL';
        this.signalDetails.textContent = `${distance ? `${formatNumber(distance)}u · ` : ''}${risk ? `${risk} · ` : ''}${quality ? `${quality.toUpperCase()} · ` : ''}${Math.ceil(event.timeLeft)}s`;
    }

    private renderEventLog() {
        const log = document.createElement('div');
        log.id = 'event-log';
        log.innerHTML = '<b>SYSTEM FEED</b>';
        this.container.appendChild(log);
        this.eventLog = log;
    }

    public addEvent(message: string) {
        if (!this.eventLog) return;
        const row = document.createElement('span');
        row.textContent = message;
        this.eventLog.appendChild(row);
        while (this.eventLog.querySelectorAll('span').length > 5) this.eventLog.querySelector('span')?.remove();
    }

    private renderFleetPanel() {
        const panel = document.createElement('aside');
        panel.id = 'fleet-panel';
        panel.classList.toggle('collapsed', this.fleetPanelCollapsed);
        panel.innerHTML = '<header><button class="fleet-panel-toggle" type="button" aria-expanded="' + (!this.fleetPanelCollapsed) + '"><span class="fleet-panel-icon" aria-hidden="true">🚀</span><span class="fleet-panel-title">TACTICAL FLEET</span><small class="fleet-summary">WEDGE</small><span class="fleet-panel-chevron" aria-hidden="true">' + (this.fleetPanelCollapsed ? '▸' : '▾') + '</span></button></header><div class="fleet-panel-body"><div class="doctrine-bar"></div><div class="ship-roster"></div><div class="order-bar"></div></div>';
        const toggle = panel.querySelector<HTMLButtonElement>('.fleet-panel-toggle')!;
        toggle.title = this.fleetPanelCollapsed ? 'Expand fleet panel' : 'Collapse fleet panel';
        bindButtonAction(toggle, () => {
            this.fleetPanelCollapsed = !this.fleetPanelCollapsed;
            panel.classList.toggle('collapsed', this.fleetPanelCollapsed);
            toggle.setAttribute('aria-expanded', String(!this.fleetPanelCollapsed));
            toggle.title = this.fleetPanelCollapsed ? 'Expand fleet panel' : 'Collapse fleet panel';
            const chevron = toggle.querySelector('.fleet-panel-chevron');
            if (chevron) chevron.textContent = this.fleetPanelCollapsed ? '▸' : '▾';
            if (this.currentFleet) this.updateFleetSummary(this.currentFleet);
        });
        const doctrineBar = panel.querySelector('.doctrine-bar')!;
        const priorities: { type: TargetPriority, label: string }[] = [
            { type: 'nearest', label: 'NEAR' }, { type: 'artillery', label: 'ARTY' },
            { type: 'support', label: 'SUP' }, { type: 'scout', label: 'EW' }, { type: 'damaged', label: 'WEAK' }
        ];
        for (const priority of priorities) {
            const button = document.createElement('button');
            button.textContent = priority.label;
            button.dataset.priority = priority.type;
            bindButtonAction(button, () => this.onDoctrine(priority.type));
            doctrineBar.appendChild(button);
        }
        const orders: { type: FleetOrderType, label: string }[] = [
            { type: 'attack', label: 'ATK' }, { type: 'escort', label: 'ESC' },
            { type: 'hold', label: 'HOLD' }, { type: 'protect', label: 'GUARD' },
            { type: 'suppress', label: 'EW' }, { type: 'repair', label: 'REPAIR' },
            { type: 'retreat', label: 'FALL BACK' }
        ];
        const bar = panel.querySelector('.order-bar')!;
        for (const order of orders) {
            const button = document.createElement('button');
            button.textContent = order.label;
            button.title = order.type;
            bindButtonAction(button, () => this.onOrder(order.type));
            bar.appendChild(button);
        }
        panel.addEventListener('pointerdown', event => event.stopPropagation());
        this.container.appendChild(panel);
        this.fleetPanel = panel;
    }

    public updateFleet(fleet: Fleet) {
        this.currentFleet = fleet;
        const roster = this.fleetPanel?.querySelector('.ship-roster');
        if (!roster) return;
        const active = fleet.ships.filter(ship => ship.state === 'active').length;
        const disabled = fleet.ships.filter(ship => ship.state === 'disabled').length;
        this.updateFleetSummary(fleet, active, disabled);
        this.fleetPanel.querySelectorAll<HTMLButtonElement>('.doctrine-bar button').forEach(button => button.classList.toggle('active', button.dataset.priority === fleet.doctrine.targetPriority));
        const existingRows = new Map(
            Array.from(roster.querySelectorAll<HTMLButtonElement>('.ship-row'))
                .map(row => [row.dataset.shipId || '', row])
        );
        for (const ship of fleet.ships) {
            let row = existingRows.get(ship.id);
            if (!row) {
                row = document.createElement('button');
                row.dataset.shipId = ship.id;
                bindButtonAction(row, () => { fleet.selectedShipId = ship.id; });
            }
            row.className = `ship-row role-${ship.role}${ship.id === fleet.selectedShipId ? ' selected' : ''}${ship.state === 'active' ? '' : ' destroyed'}`;
            const hp = Math.max(0, Math.round(ship.integrity * 100));
            const shield = Math.max(0, Math.ceil(ship.shield));
            const armor = Math.max(0, Math.ceil(ship.armor));
            const hull = Math.max(0, Math.ceil(ship.hull));
            const effect = ship.overchargeTimer > 0 ? ` · OVR +${Math.round((TACTICAL_BALANCE.overchargeDamageMultiplier - 1) * 100)}% ${ship.overchargeTimer.toFixed(1)}s`
                : ship.emergencyRepairTimer > 0 ? ` · REPAIR ${ship.emergencyRepairTimer.toFixed(1)}s` : '';
            row.innerHTML = `<i></i><span><b>${ship.displayName}</b><small>${ship.role} · ${ship.state} · ${ship.order.type}${effect}</small><small class="defense-stats">S ${shield}/${Math.ceil(ship.maxShield)} · A ${armor}/${Math.ceil(ship.maxArmor)} · H ${hull}/${Math.ceil(ship.maxHull)} · E ${Math.round(ship.energy)}/${Math.round(ship.maxEnergy)} · AM ${Math.floor(ship.ammunition)}</small></span><em>${hp}%</em>`;
            roster.appendChild(row);
            existingRows.delete(ship.id);
        }
        existingRows.forEach(row => row.remove());
    }

    private updateFleetSummary(fleet: Fleet, active = fleet.ships.filter(ship => ship.state === 'active').length, disabled = fleet.ships.filter(ship => ship.state === 'disabled').length) {
        const summary = this.fleetPanel.querySelector('.fleet-summary');
        if (!summary) return;
        const dps = fleet.ships.filter(ship => ship.alive && ship.order.type !== 'repair').reduce((sum, ship) => sum + ship.weaponDps * fleet.readinessEfficiency * fleet.energyEfficiency * COMBAT_BALANCE.damageScale * (ship.overchargeTimer > 0 ? TACTICAL_BALANCE.overchargeDamageMultiplier : 1), 0);
        const energy = Math.ceil(fleet.totalEnergy);
        const maxEnergy = Math.ceil(fleet.maxEnergy);
        const selected = fleet.ships.find(ship => ship.id === fleet.selectedShipId);
        const selectedStatus = selected ? ` · SEL ${selected.displayName}${selected.overchargeTimer > 0 ? ` OVR ${selected.overchargeTimer.toFixed(1)}s` : ''}` : '';
        const resourceDisplay = document.getElementById('strength-display');
        if (resourceDisplay && fleet.isPlayer) {
            resourceDisplay.textContent = `T ${formatNumber(fleet.threatRating)} · F ${Math.floor(fleet.fuel)}/${Math.ceil(fleet.maxFuel)} (~${formatNumber(Math.round(fleet.estimatedFuelRange))}u) · S ${Math.floor(fleet.supplies)}/${fleet.maxSupplies} · E ${energy}/${maxEnergy} · R ${Math.round(fleet.operationalReadiness)}%`;
        }
        if (this.fleetPanelCollapsed) {
            summary.textContent = `T ${Math.round(fleet.threatRating)} · DPS ${dps.toFixed(0)} · ${active}/${fleet.ships.length} SHIPS`;
            return;
        }
        const defenses = fleet.ships.reduce((sum, ship) => sum + ship.effectiveHealth, 0);
        const maxDefenses = fleet.ships.reduce((sum, ship) => sum + ship.maxEffectiveHealth, 0);
        summary.textContent = `T ${Math.round(fleet.threatRating)}/${Math.round(fleet.baseThreatRating)} · DEF ${Math.ceil(defenses)}/${Math.ceil(maxDefenses)} · DPS ${dps.toFixed(0)} · ${active}A/${disabled}D · C ${fleet.commandUsed}/${fleet.commandCapacity} · R ${Math.round(fleet.operationalReadiness)}% · FUEL ${Math.floor(fleet.fuel)}/${Math.ceil(fleet.maxFuel)} · SUP ${Math.floor(fleet.supplies)}/${fleet.maxSupplies} · E ${energy}/${maxEnergy}${selectedStatus}${fleet.isPlayer ? ` · Lv ${fleet.level} · SP ${fleet.skillPoints}` : ''}`;
    }

    private renderAbilityPanel() {
        const isCompact = window.innerWidth <= 600;
        const panel = document.createElement('div');
        panel.id = 'ability-panel';
        panel.style.position = 'absolute';
        panel.style.bottom = '10px';
        panel.style.left = '50%';
        panel.style.transform = 'translateX(-50%)';
        panel.style.zIndex = '50';
        panel.style.display = 'flex';
        panel.style.gap = isCompact ? '4px' : '8px';
        panel.style.alignItems = 'center';
        panel.style.flexWrap = isCompact ? 'nowrap' : 'wrap';
        panel.style.padding = isCompact ? '4px 8px' : '6px 12px';
        panel.style.background = 'rgba(0, 0, 0, 0.6)';
        panel.style.backdropFilter = 'blur(10px)';
        panel.style.borderRadius = isCompact ? '18px' : '30px';
        panel.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        panel.style.pointerEvents = 'auto';
        if (isCompact) {
            panel.style.maxWidth = '96%';
            panel.style.overflowX = 'auto';
            (panel.style as any).webkitOverflowScrolling = 'touch';
        }

        // Strength display
        const strengthDisplay = document.createElement('div');
        strengthDisplay.id = 'strength-display';
        strengthDisplay.style.color = '#FFFFFF';
        strengthDisplay.style.fontSize = isCompact ? '11px' : '14px';
        strengthDisplay.style.fontWeight = 'bold';
        strengthDisplay.style.fontFamily = 'monospace';
        strengthDisplay.style.whiteSpace = 'nowrap';
        strengthDisplay.textContent = '10/10';
        panel.appendChild(strengthDisplay);

        // Money display
        const moneyDisplay = document.createElement('div');
        moneyDisplay.id = 'money-display';
        moneyDisplay.style.color = '#FFD700';
        moneyDisplay.style.fontSize = isCompact ? '11px' : '14px';
        moneyDisplay.style.fontWeight = 'bold';
        moneyDisplay.style.fontFamily = 'monospace';
        moneyDisplay.style.whiteSpace = 'nowrap';
        moneyDisplay.textContent = '$0';
        panel.appendChild(moneyDisplay);

        const levelDisplay = document.createElement('div');
        levelDisplay.id = 'level-display';
        levelDisplay.className = 'experience-display';
        levelDisplay.title = 'Player experience';
        this.levelDisplay = levelDisplay;

        this.levelText = document.createElement('span');
        this.levelText.className = 'experience-text';
        this.levelText.textContent = 'Lv 1 · XP 0/1000';

        const levelTrack = document.createElement('div');
        levelTrack.className = 'experience-track';
        this.levelFill = document.createElement('div');
        this.levelFill.className = 'experience-fill';
        levelTrack.appendChild(this.levelFill);
        levelDisplay.appendChild(this.levelText);
        levelDisplay.appendChild(levelTrack);
        panel.appendChild(levelDisplay);

        this.abilityPoolDisplay = document.createElement('div');
        this.abilityPoolDisplay.className = 'ability-pool-display';
        this.abilityPoolDisplay.style.color = '#9edfff';
        this.abilityPoolDisplay.style.fontSize = isCompact ? '9px' : '11px';
        this.abilityPoolDisplay.style.fontFamily = 'monospace';
        this.abilityPoolDisplay.style.fontWeight = 'bold';
        this.abilityPoolDisplay.style.whiteSpace = 'nowrap';
        this.abilityPoolDisplay.textContent = 'SYSTEM CHARGES 0/5';
        panel.appendChild(this.abilityPoolDisplay);

        const abilities = [
            { id: 'scan', icon: '◎', color: '#68FF9A', title: 'Active Scan Pulse (2x radar, costs 15% Energy)' },
            { id: 'afterburner', icon: '🚀', color: '#FF4400', title: 'Afterburner (Boost Speed)' },
            { id: 'bubble', icon: '🫧', color: '#00AAFF', title: 'Bubble (Stop Nearby)' },
            { id: 'cloak', icon: '👻', color: '#AAAAAA', title: 'Cloak (Invisibility)' },
            { id: 'mine', icon: '💣', color: '#FF0000', title: 'Warp Mine (Proximity Trap)' },
            { id: 'medkit', icon: '✚', color: '#00C8FF', title: 'Emergency Repair (stabilize and repair selected ship)' },
            { id: 'fire', icon: '🔥', color: '#FF5500', title: `Weapon Overcharge (+${Math.round((TACTICAL_BALANCE.overchargeDamageMultiplier - 1) * 100)}% selected ship damage, +${Math.round((TACTICAL_BALANCE.overchargeEnergyMultiplier - 1) * 100)}% Energy use)` },
            { id: 'shield', icon: '🛡', color: '#66CCFF', title: `Shield Cell (+${Math.round(TACTICAL_BALANCE.shieldCellFraction * 100)}% selected ship shield)` }
        ];

        abilities.push({
            id: 'net',
            icon: '🕸',
            color: '#D58CFF',
            title: 'Stasis Net (halve target speed for ' + TACTICAL_BALANCE.netDuration + 's)'
        });
        const shieldAbility = abilities.find(ability => ability.id === 'shield');
        if (shieldAbility) {
            shieldAbility.title = 'Shield Cell (restore ' +
                Math.round(TACTICAL_BALANCE.shieldCellFraction * 100) +
                '% fleet shield over ' + TACTICAL_BALANCE.shieldCellDuration + 's)';
        }
        abilities.forEach(ability => {
            const btn = document.createElement('button');
            btn.className = 'ability-btn';
            btn.style.width = '44px';
            btn.style.height = '44px';
            btn.style.minWidth = '44px';
            btn.style.borderRadius = '50%';
            btn.style.border = '2px solid rgba(255, 255, 255, 0.1)';
            btn.style.background = 'rgba(20, 20, 25, 0.8)';
            btn.style.color = 'white';
            btn.style.fontSize = isCompact ? '16px' : '20px';
            btn.style.cursor = 'pointer';
            btn.style.position = 'relative';
            btn.style.overflow = 'visible';
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

            bindButtonAction(btn, () => {
                this.onAbility(ability.id);
            });

            btn.appendChild(overlay);
            btn.appendChild(timerText);
            const iconSpan = document.createElement('span');
            iconSpan.innerText = ability.icon;
            iconSpan.style.zIndex = '1';
            btn.appendChild(iconSpan);

            this.abilityButtons[ability.id] = btn;
            this.abilityCooldowns[ability.id] = overlay;
            this.abilityTimers[ability.id] = timerText;
            panel.appendChild(btn);
        });

        panel.addEventListener('click', (e) => e.stopPropagation());
        panel.addEventListener('pointerdown', (e) => e.stopPropagation());

        this.container.appendChild(panel);
    }

    public updateAbilities(fleet: any) {
        const isCompact = window.innerWidth <= 600;
        if (this.abilityPoolDisplay) {
            this.abilityPoolDisplay.textContent = `SYSTEM CHARGES ${fleet.abilityChargesUsed ?? 0}/${fleet.abilityChargeCapacity ?? 5}`;
        }
        for (const key in fleet.abilities) {
            const a = fleet.abilities[key];
            const btn = this.abilityButtons[key];
            const overlay = this.abilityCooldowns[key];

            if (btn && overlay) {
                // Show charges count
                let badge = btn.querySelector('.charge-badge') as HTMLElement;
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'charge-badge';
                    badge.style.position = 'absolute';
                    badge.style.top = isCompact ? '-6px' : '-8px';
                    badge.style.right = isCompact ? '-6px' : '-8px';
                    badge.style.background = '#FFD700';
                    badge.style.color = 'black';
                    badge.style.borderRadius = '6px';
                    badge.style.minWidth = isCompact ? '14px' : '16px';
                    badge.style.height = isCompact ? '14px' : '16px';
                    badge.style.padding = isCompact ? '0 2px' : '0 3px';
                    badge.style.fontSize = isCompact ? '9px' : '10px';
                    badge.style.fontWeight = 'bold';
                    badge.style.display = 'flex';
                    badge.style.alignItems = 'center';
                    badge.style.justifyContent = 'center';
                    badge.style.boxShadow = '0 0 6px rgba(0,0,0,0.5)';
                    badge.style.zIndex = '10';
                    btn.appendChild(badge);
                }
                badge.textContent = a.charges.toString();
                badge.style.background = a.charges > 0 ? '#FFD700' : '#666';

                if (a.charges <= 0 && !a.active) {
                    btn.style.opacity = '0.3';
                    btn.style.cursor = 'not-allowed';
                } else if (a.cooldown > 0) {
                    const perc = (1 - a.cooldown / (a.cdMax || 1)) * 100;
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

    public updateScanPulse(secondsRemaining: number) {
        const btn = this.abilityButtons.scan;
        const timer = this.abilityTimers.scan;
        if (!btn || !timer) return;
        const active = secondsRemaining > 0;
        timer.textContent = active ? secondsRemaining.toFixed(1) : '';
        btn.style.border = active ? '2px solid #68FF9A' : '2px solid rgba(255, 255, 255, 0.1)';
        btn.style.boxShadow = active ? '0 0 18px rgba(104,255,154,.8)' : 'none';
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
            moneyDisplay.textContent = `$${formatNumber(Math.floor(money))}`;
        }
    }

    public updateStrength(strength: number, maxStrength?: number) {
        const strengthDisplay = document.getElementById('strength-display');
        if (strengthDisplay) {
            void maxStrength;
            strengthDisplay.textContent = `Threat ${formatNumber(strength)}`;
        }
    }

    public updateLevel(level: number, progress: number, needed: number) {
        if (!this.levelDisplay || !this.levelText || !this.levelFill) return;
        const prog = Math.max(0, Math.floor(progress));
        const required = Math.max(1, Math.floor(needed));
        this.levelText.textContent = `Lv ${level} · XP ${formatNumber(prog)}/${formatNumber(required)}`;
        this.levelFill.style.width = `${Math.min(100, (prog / required) * 100)}%`;
        this.levelDisplay.title = `Level ${level}: ${formatNumber(prog)} / ${formatNumber(required)} XP`;
    }
}

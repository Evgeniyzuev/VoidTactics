import { formatNumber } from '../utils/NumberFormatter';
import { SaveSystem } from './SaveSystem';
import type { FleetSkillId } from '../entities/Fleet';
import { FLEET_SKILLS } from '../entities/Fleet';
import { SHOP_SHIPS } from '../tactical/FleetGenerator';
import { HULLS } from '../tactical/ShipDefinitions';

export class ModalManager {
    private modalContainer: HTMLDivElement | null = null;

    constructor() {
        // Modal container will be created on demand
    }

    /**
     * Check if a modal is currently open
     */
    isModalOpen(): boolean {
        return this.modalContainer !== null;
    }

    /**
     * Show contact dialog when fleets are in contact range
     */
    showContactDialog(onCommunicate: () => void, onAttack: () => void, onCancel: () => void) {
        this.closeModal();

        this.modalContainer = document.createElement('div');
        this.modalContainer.style.position = 'fixed';
        this.modalContainer.style.top = '0';
        this.modalContainer.style.left = '0';
        this.modalContainer.style.width = '100%';
        this.modalContainer.style.height = '100%';
        this.modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.modalContainer.style.display = 'flex';
        this.modalContainer.style.alignItems = 'center';
        this.modalContainer.style.justifyContent = 'center';
        this.modalContainer.style.zIndex = '10000';

        const dialog = document.createElement('div');
        dialog.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
        dialog.style.padding = '30px';
        dialog.style.borderRadius = '12px';
        dialog.style.border = '2px solid rgba(0, 200, 255, 0.5)';
        dialog.style.boxShadow = '0 8px 32px rgba(0, 200, 255, 0.3)';
        dialog.style.color = 'white';
        dialog.style.fontFamily = 'monospace';
        dialog.style.textAlign = 'center';
        dialog.style.minWidth = '300px';

        const title = document.createElement('h2');
        title.textContent = '⚠️ Fleet Contact';
        title.style.margin = '0 0 20px 0';
        title.style.fontSize = '24px';
        title.style.color = '#00C8FF';

        const message = document.createElement('p');
        message.textContent = 'You are in contact zone with another fleet. Choose an action:';
        message.style.margin = '0 0 30px 0';
        message.style.fontSize = '14px';
        message.style.lineHeight = '1.6';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.justifyContent = 'center';

        const createButton = (text: string, bgColor: string, callback: () => void) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.padding = '12px 24px';
            btn.style.border = 'none';
            btn.style.borderRadius = '6px';
            btn.style.background = bgColor;
            btn.style.color = 'white';
            btn.style.fontSize = '14px';
            btn.style.fontWeight = 'bold';
            btn.style.cursor = 'pointer';
            btn.style.transition = 'transform 0.2s, box-shadow 0.2s';
            btn.style.fontFamily = 'monospace';

            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'scale(1.05)';
                btn.style.boxShadow = `0 4px 12px ${bgColor}80`;
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'scale(1)';
                btn.style.boxShadow = 'none';
            });

            btn.addEventListener('click', () => {
                callback();
                this.closeModal();
            });

            return btn;
        };

        buttonContainer.appendChild(createButton('📡 Communicate', '#00A8FF', onCommunicate));
        buttonContainer.appendChild(createButton('⚔️ Attack', '#FF4444', onAttack));
        buttonContainer.appendChild(createButton('❌ Cancel', '#666666', onCancel));

        dialog.appendChild(title);
        dialog.appendChild(message);
        dialog.appendChild(buttonContainer);
        this.modalContainer.appendChild(dialog);
        document.body.appendChild(this.modalContainer);
    }

    /**
     * Show battle screen (basic version with close button)
     */
    showBattleScreen(onClose: () => void) {
        this.closeModal();

        this.modalContainer = document.createElement('div');
        this.modalContainer.style.position = 'fixed';
        this.modalContainer.style.top = '0';
        this.modalContainer.style.left = '0';
        this.modalContainer.style.width = '100%';
        this.modalContainer.style.height = '100%';
        this.modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        this.modalContainer.style.display = 'flex';
        this.modalContainer.style.alignItems = 'center';
        this.modalContainer.style.justifyContent = 'center';
        this.modalContainer.style.zIndex = '10000';

        const battleScreen = document.createElement('div');
        battleScreen.style.width = '90%';
        battleScreen.style.height = '90%';
        battleScreen.style.background = 'linear-gradient(135deg, #0a0a0a 0%, #1a0000 100%)';
        battleScreen.style.borderRadius = '12px';
        battleScreen.style.border = '3px solid #FF4444';
        battleScreen.style.boxShadow = '0 0 50px rgba(255, 68, 68, 0.5)';
        battleScreen.style.display = 'flex';
        battleScreen.style.flexDirection = 'column';
        battleScreen.style.alignItems = 'center';
        battleScreen.style.justifyContent = 'center';
        battleScreen.style.color = 'white';
        battleScreen.style.fontFamily = 'monospace';
        battleScreen.style.position = 'relative';

        const title = document.createElement('h1');
        title.textContent = '⚔️ BATTLE SCREEN ⚔️';
        title.style.fontSize = '48px';
        title.style.color = '#FF4444';
        title.style.textShadow = '0 0 20px rgba(255, 68, 68, 0.8)';
        title.style.margin = '0 0 20px 0';

        const subtitle = document.createElement('p');
        subtitle.textContent = 'In development...';
        subtitle.style.fontSize = '24px';
        subtitle.style.color = '#AAAAAA';
        subtitle.style.margin = '0 0 40px 0';

        const closeButton = document.createElement('button');
        closeButton.textContent = '✖ Close';
        closeButton.style.padding = '16px 32px';
        closeButton.style.border = 'none';
        closeButton.style.borderRadius = '8px';
        closeButton.style.background = '#FF4444';
        closeButton.style.color = 'white';
        closeButton.style.fontSize = '18px';
        closeButton.style.fontWeight = 'bold';
        closeButton.style.cursor = 'pointer';
        closeButton.style.transition = 'transform 0.2s, box-shadow 0.2s';
        closeButton.style.fontFamily = 'monospace';

        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.transform = 'scale(1.1)';
            closeButton.style.boxShadow = '0 8px 24px rgba(255, 68, 68, 0.6)';
        });

        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.transform = 'scale(1)';
            closeButton.style.boxShadow = 'none';
        });

        closeButton.addEventListener('click', () => {
            onClose();
            this.closeModal();
        });

        battleScreen.appendChild(title);
        battleScreen.appendChild(subtitle);
        battleScreen.appendChild(closeButton);
        this.modalContainer.appendChild(battleScreen);
        document.body.appendChild(this.modalContainer);
    }

    /**
     * Show main menu
     */
    showMainMenu(callbacks: { onNewGame: () => void, onSaveFleet: () => void, onLoadFleet: () => void, onLoadAuto: () => void, onResume: () => void }, isDead: boolean = false) {
        this.closeModal();

        this.modalContainer = document.createElement('div');
        this.modalContainer.style.position = 'fixed';
        this.modalContainer.style.top = '0';
        this.modalContainer.style.left = '0';
        this.modalContainer.style.width = '100%';
        this.modalContainer.style.height = '100%';
        this.modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        this.modalContainer.style.display = 'flex';
        this.modalContainer.style.alignItems = 'center';
        this.modalContainer.style.justifyContent = 'center';
        this.modalContainer.style.zIndex = '10000';
        this.modalContainer.style.backdropFilter = 'blur(5px)';

        const menu = document.createElement('div');
        menu.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
        menu.style.padding = '40px';
        menu.style.borderRadius = '20px';
        menu.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        menu.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.5)';
        menu.style.display = 'flex';
        menu.style.flexDirection = 'column';
        menu.style.gap = '15px';
        menu.style.minWidth = '250px';

        const title = document.createElement('h1');
        title.textContent = isDead ? 'GAME OVER' : 'VOID TACTICS';
        title.style.margin = '0 0 20px 0';
        title.style.textAlign = 'center';
        title.style.color = isDead ? '#FF4444' : '#00C8FF';
        title.style.letterSpacing = '5px';
        title.style.fontSize = '24px';
        title.style.fontFamily = 'monospace';

        // Get saved fleet sizes
        const savedSize = SaveSystem.loadFleetSize();
        const autosaveSize = SaveSystem.loadAutosaveFleetSize();

        const createMenuButton = (text: string, subtext: string, color: string, callback: () => void, disabled: boolean = false) => {
            const btn = document.createElement('button');
            btn.style.padding = '15px 25px';
            btn.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            btn.style.borderRadius = '10px';
            btn.style.background = 'rgba(255, 255, 255, 0.05)';
            btn.style.color = 'white';
            btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
            btn.style.opacity = disabled ? '0.3' : '1';
            btn.style.transition = 'all 0.3s';
            btn.style.display = 'flex';
            btn.style.flexDirection = 'column';
            btn.style.alignItems = 'center';
            btn.style.gap = '5px';
            btn.disabled = disabled;

            const mainText = document.createElement('span');
            mainText.textContent = text;
            mainText.style.fontWeight = 'bold';
            mainText.style.fontSize = '16px';

            const sub = document.createElement('span');
            sub.textContent = subtext;
            sub.style.fontSize = '10px';
            sub.style.opacity = '0.5';

            btn.appendChild(mainText);
            btn.appendChild(sub);

            if (!disabled) {
                btn.onmouseenter = () => {
                    btn.style.background = 'rgba(255, 255, 255, 0.1)';
                    btn.style.borderColor = color;
                    btn.style.boxShadow = `0 0 20px ${color}40`;
                    btn.style.transform = 'translateY(-2px)';
                };
                btn.onmouseleave = () => {
                    btn.style.background = 'rgba(255, 255, 255, 0.05)';
                    btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    btn.style.boxShadow = 'none';
                    btn.style.transform = 'translateY(0)';
                };
                btn.onclick = () => {
                    this.closeModal();
                    callback();
                };
            }
            return btn;
        };

        menu.appendChild(title);
        menu.appendChild(createMenuButton('CONTINUE', 'Back to battle', '#00C8FF', callbacks.onResume, isDead));
        menu.appendChild(createMenuButton('NEW GAME', 'Reset all progress', '#FF4444', callbacks.onNewGame));
        menu.appendChild(createMenuButton('SAVE FLEET', 'Store current fleet size', '#00FF88', callbacks.onSaveFleet, isDead));

        // Load Fleet button with saved size
        const loadFleetText = savedSize ? `Load Fleet (Size: ${formatNumber(savedSize)})` : 'Load Fleet';
        menu.appendChild(createMenuButton('LOAD FLEET', loadFleetText, '#FFCC00', callbacks.onLoadFleet));

        // Load Auto button with autosave size
        const loadAutoText = autosaveSize ? `Load Auto (Size: ${formatNumber(autosaveSize)})` : 'Load Auto';
        menu.appendChild(createMenuButton('LOAD AUTO', loadAutoText, '#00FFFF', callbacks.onLoadAuto));

        this.modalContainer.appendChild(menu);
        document.body.appendChild(this.modalContainer);
    }

    /**
     * Show arrival dialog for celestial bodies
     */
    showArrivalDialog(name: string, onCancel: () => void) {
        this.closeModal();

        this.modalContainer = document.createElement('div');
        this.modalContainer.style.position = 'fixed';
        this.modalContainer.style.top = '0';
        this.modalContainer.style.left = '0';
        this.modalContainer.style.width = '100%';
        this.modalContainer.style.height = '100%';
        this.modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.modalContainer.style.display = 'flex';
        this.modalContainer.style.alignItems = 'center';
        this.modalContainer.style.justifyContent = 'center';
        this.modalContainer.style.zIndex = '10000';

        const dialog = document.createElement('div');
        dialog.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
        dialog.style.padding = '30px';
        dialog.style.borderRadius = '12px';
        dialog.style.border = '2px solid rgba(0, 200, 255, 0.5)';
        dialog.style.boxShadow = '0 8px 32px rgba(0, 200, 255, 0.3)';
        dialog.style.color = 'white';
        dialog.style.fontFamily = 'monospace';
        dialog.style.textAlign = 'center';
        dialog.style.minWidth = '300px';

        const title = document.createElement('h2');
        title.textContent = `🌍 ${name}`;
        title.style.margin = '0 0 20px 0';
        title.style.fontSize = '24px';
        title.style.color = '#00C8FF';

        const message = document.createElement('p');
        message.textContent = `You have arrived at ${name}`;
        message.style.margin = '0 0 30px 0';
        message.style.fontSize = '14px';
        message.style.lineHeight = '1.6';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.padding = '12px 24px';
        cancelButton.style.border = 'none';
        cancelButton.style.borderRadius = '6px';
        cancelButton.style.background = '#666666';
        cancelButton.style.color = 'white';
        cancelButton.style.fontSize = '14px';
        cancelButton.style.fontWeight = 'bold';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontFamily = 'monospace';

        cancelButton.addEventListener('click', () => {
            onCancel();
        });

        dialog.appendChild(title);
        dialog.appendChild(message);
        dialog.appendChild(cancelButton);
        this.modalContainer.appendChild(dialog);
        document.body.appendChild(this.modalContainer);
    }

    /**
     * Show liberation reward dialog
     */
    showLiberationRewardDialog(onCollect: () => void, onCancel: () => void) {
        this.closeModal();

        this.modalContainer = document.createElement('div');
        this.modalContainer.style.position = 'fixed';
        this.modalContainer.style.top = '0';
        this.modalContainer.style.left = '0';
        this.modalContainer.style.width = '100%';
        this.modalContainer.style.height = '100%';
        this.modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.modalContainer.style.display = 'flex';
        this.modalContainer.style.alignItems = 'center';
        this.modalContainer.style.justifyContent = 'center';
        this.modalContainer.style.zIndex = '10000';

        const dialog = document.createElement('div');
        dialog.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
        dialog.style.padding = '30px';
        dialog.style.borderRadius = '12px';
        dialog.style.border = '2px solid rgba(0, 255, 0, 0.5)';
        dialog.style.boxShadow = '0 8px 32px rgba(0, 255, 0, 0.3)';
        dialog.style.color = 'white';
        dialog.style.fontFamily = 'monospace';
        dialog.style.textAlign = 'center';
        dialog.style.minWidth = '300px';

        const title = document.createElement('h2');
        title.textContent = '🎉 System Liberation!';
        title.style.margin = '0 0 20px 0';
        title.style.fontSize = '24px';
        title.style.color = '#00FF00';

        const message = document.createElement('p');
        message.textContent = 'Congratulations! You have liberated the Alpha Centauri system from raiders. The central planet thanks you and offers a reward:';
        message.style.margin = '0 0 20px 0';
        message.style.fontSize = '14px';
        message.style.lineHeight = '1.6';

        const reward = document.createElement('p');
        reward.textContent = '+3 Command Capacity\n+10 Supply Capacity\n+$5,000 Credits';
        reward.style.margin = '0 0 30px 0';
        reward.style.fontSize = '16px';
        reward.style.fontWeight = 'bold';
        reward.style.color = '#FFD700';
        reward.style.whiteSpace = 'pre-line';

        const collectButton = document.createElement('button');
        collectButton.textContent = '🎁 Collect Reward';
        collectButton.style.padding = '12px 24px';
        collectButton.style.border = 'none';
        collectButton.style.borderRadius = '6px';
        collectButton.style.background = '#00AA00';
        collectButton.style.color = 'white';
        collectButton.style.fontSize = '14px';
        collectButton.style.fontWeight = 'bold';
        collectButton.style.cursor = 'pointer';
        collectButton.style.fontFamily = 'monospace';
        collectButton.style.marginRight = '10px';

        collectButton.addEventListener('click', () => {
            onCollect();
            this.closeModal();
        });

        const cancelButton = document.createElement('button');
        cancelButton.textContent = '❌ Decline';
        cancelButton.style.padding = '12px 24px';
        cancelButton.style.border = 'none';
        cancelButton.style.borderRadius = '6px';
        cancelButton.style.background = '#666666';
        cancelButton.style.color = 'white';
        cancelButton.style.fontSize = '14px';
        cancelButton.style.fontWeight = 'bold';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontFamily = 'monospace';

        cancelButton.addEventListener('click', () => {
            onCancel();
            this.closeModal();
        });

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.gap = '10px';
        buttonContainer.appendChild(collectButton);
        buttonContainer.appendChild(cancelButton);

        dialog.appendChild(title);
        dialog.appendChild(message);
        dialog.appendChild(reward);
        dialog.appendChild(buttonContainer);
        this.modalContainer.appendChild(dialog);
        document.body.appendChild(this.modalContainer);
    }

    /**
     * Show communication dialog with OK button
     */
    showCommunicationDialog(onOk: () => void) {
        this.closeModal();

        this.modalContainer = document.createElement('div');
        this.modalContainer.style.position = 'fixed';
        this.modalContainer.style.top = '0';
        this.modalContainer.style.left = '0';
        this.modalContainer.style.width = '100%';
        this.modalContainer.style.height = '100%';
        this.modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.modalContainer.style.display = 'flex';
        this.modalContainer.style.alignItems = 'center';
        this.modalContainer.style.justifyContent = 'center';
        this.modalContainer.style.zIndex = '10000';

        const dialog = document.createElement('div');
        dialog.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
        dialog.style.padding = '30px';
        dialog.style.borderRadius = '12px';
        dialog.style.border = '2px solid rgba(0, 200, 255, 0.5)';
        dialog.style.boxShadow = '0 8px 32px rgba(0, 200, 255, 0.3)';
        dialog.style.color = 'white';
        dialog.style.fontFamily = 'monospace';
        dialog.style.textAlign = 'center';
        dialog.style.minWidth = '300px';

        const title = document.createElement('h2');
        title.textContent = '📡 Communication';
        title.style.margin = '0 0 20px 0';
        title.style.fontSize = '24px';
        title.style.color = '#00C8FF';

        const message = document.createElement('p');
        message.textContent = 'Communication established.';
        message.style.margin = '0 0 30px 0';
        message.style.fontSize = '16px';
        message.style.lineHeight = '1.6';

        const okButton = document.createElement('button');
        okButton.textContent = 'OK';
        okButton.style.padding = '12px 24px';
        okButton.style.border = 'none';
        okButton.style.borderRadius = '6px';
        okButton.style.background = '#00A8FF';
        okButton.style.color = 'white';
        okButton.style.fontSize = '14px';
        okButton.style.fontWeight = 'bold';
        okButton.style.cursor = 'pointer';
        okButton.style.transition = 'transform 0.2s, box-shadow 0.2s';
        okButton.style.fontFamily = 'monospace';

        okButton.addEventListener('mouseenter', () => {
            okButton.style.transform = 'scale(1.05)';
            okButton.style.boxShadow = '0 4px 12px rgba(0, 168, 255, 0.8)';
        });

        okButton.addEventListener('mouseleave', () => {
            okButton.style.transform = 'scale(1)';
            okButton.style.boxShadow = 'none';
        });

        okButton.addEventListener('click', () => {
            onOk();
            this.closeModal();
        });

        dialog.appendChild(title);
        dialog.appendChild(message);
        dialog.appendChild(okButton);
        this.modalContainer.appendChild(dialog);
        document.body.appendChild(this.modalContainer);
    }

    /**
     * Show Terra upgrade dialog
     */
    showTerraUpgradeDialog(
        getState: () => {
            currentStrength: number,
            currentMaxStrength: number,
            currentMoney: number,
            commandUsed: number,
            commandCapacity: number,
            shipCost: number,
            levelInfo: string,
            mercenaryCount: number,
            mercenaryMax: number,
            mercenaryCost: number
        },
        onUpgrade: () => boolean,
        onCancel: () => void,
        onBuyAbility: (id: string) => boolean,
        onHireMercenary: () => boolean
    ) {
        this.closeModal();

        const state = getState();

        this.modalContainer = document.createElement('div');
        this.modalContainer.style.position = 'fixed';
        this.modalContainer.style.top = '0';
        this.modalContainer.style.left = '0';
        this.modalContainer.style.width = '100%';
        this.modalContainer.style.height = '100%';
        this.modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.modalContainer.style.display = 'flex';
        this.modalContainer.style.alignItems = 'center';
        this.modalContainer.style.justifyContent = 'center';
        this.modalContainer.style.zIndex = '10000';

        const dialog = document.createElement('div');
        dialog.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
        dialog.style.padding = '30px';
        dialog.style.borderRadius = '12px';
        dialog.style.border = '2px solid rgba(0, 200, 255, 0.5)';
        dialog.style.boxShadow = '0 8px 32px rgba(0, 200, 255, 0.3)';
        dialog.style.color = 'white';
        dialog.style.fontFamily = 'monospace';
        dialog.style.textAlign = 'center';
        dialog.style.minWidth = '400px';

        const title = document.createElement('h2');
        title.textContent = '🌍 Terra Station';
        title.style.margin = '0 0 10px 0';
        title.style.fontSize = '24px';
        title.style.color = '#00C8FF';

        const info = document.createElement('p');
        info.textContent = `Threat: ${formatNumber(state.currentStrength)} | Command: ${state.commandUsed}/${state.commandCapacity} | Money: $${formatNumber(state.currentMoney)}`;
        info.style.margin = '0 0 10px 0';
        info.style.fontSize = '14px';
        info.style.color = '#FFD700';

        const levelText = document.createElement('p');
        levelText.textContent = state.levelInfo;
        levelText.style.margin = '0 0 20px 0';
        levelText.style.fontSize = '12px';
        levelText.style.color = '#AAAAAA';

        // --- UPGRADE SECTION ---
        const section1 = document.createElement('div');
        section1.style.background = 'rgba(255, 255, 255, 0.05)';
        section1.style.padding = '15px';
        section1.style.borderRadius = '8px';
        section1.style.marginBottom = '20px';

        const upgradeLabel = document.createElement('div');
        upgradeLabel.textContent = 'SHIPYARD · CHOOSE A HULL, ROLE AND TIER';
        upgradeLabel.style.fontSize = '12px';
        upgradeLabel.style.marginBottom = '10px';
        upgradeLabel.style.opacity = '0.7';

        const upgradeButton = document.createElement('button');
        upgradeButton.textContent = '⚓ SHIPYARD';
        upgradeButton.style.padding = '10px 20px';
        upgradeButton.style.width = '100%';
        upgradeButton.style.border = 'none';
        upgradeButton.style.borderRadius = '6px';
        upgradeButton.style.background = '#00AA00';
        upgradeButton.style.color = 'white';
        upgradeButton.style.cursor = 'pointer';
        upgradeButton.onclick = () => {
            onUpgrade();
            updateUi();
        };

        section1.appendChild(upgradeLabel);
        section1.appendChild(upgradeButton);

        // --- ABILITIES SECTION ---
        const section2 = document.createElement('div');
        section2.style.background = 'rgba(255, 255, 255, 0.05)';
        section2.style.padding = '15px';
        section2.style.borderRadius = '8px';
        section2.style.marginBottom = '20px';

        const shopLabel = document.createElement('div');
        shopLabel.textContent = 'EQUIPMENT SHOP (200$ per unit, max 10)';
        shopLabel.style.fontSize = '12px';
        shopLabel.style.marginBottom = '10px';
        shopLabel.style.opacity = '0.7';
        section2.appendChild(shopLabel);

        const abilities = [
            { id: 'afterburner', name: '🚀 Boost' },
            { id: 'bubble', name: '🫧 Bubble' },
            { id: 'cloak', name: '👻 Cloak' },
            { id: 'mine', name: '💣 Warp Mine' },
            { id: 'medkit', name: '✚ Emergency Repair' },
            { id: 'fire', name: '🔥 Fire' },
            { id: 'shield', name: '🛡 Shield' }
        ];

        const shopGrid = document.createElement('div');
        shopGrid.style.display = 'grid';
        shopGrid.style.gridTemplateColumns = '1fr 1fr';
        shopGrid.style.gap = '8px';

        const abilityButtons: HTMLButtonElement[] = [];
        abilities.forEach(ability => {
            const btn = document.createElement('button');
            btn.textContent = ability.name;
            btn.style.padding = '8px';
            btn.style.background = state.currentMoney >= 200 ? 'rgba(0, 200, 255, 0.2)' : '#333';
            btn.style.border = '1px solid rgba(0, 200, 255, 0.4)';
            btn.style.color = 'white';
            btn.style.borderRadius = '4px';
            btn.style.cursor = state.currentMoney >= 200 ? 'pointer' : 'not-allowed';
            btn.style.fontSize = '12px';
            btn.onclick = () => {
                const ok = onBuyAbility(ability.id);
                if (ok) updateUi();
            };
            shopGrid.appendChild(btn);
            abilityButtons.push(btn);
        });
        section2.appendChild(shopGrid);

        // --- MERCENARY SECTION ---
        const section3 = document.createElement('div');
        section3.style.background = 'rgba(255, 255, 255, 0.05)';
        section3.style.padding = '15px';
        section3.style.borderRadius = '8px';
        section3.style.marginBottom = '20px';

        const mercLabel = document.createElement('div');
        mercLabel.textContent = `HIRE MERCENARY (${state.mercenaryCount}/${state.mercenaryMax} in system)`;
        mercLabel.style.fontSize = '12px';
        mercLabel.style.marginBottom = '10px';
        mercLabel.style.opacity = '0.7';

        const mercBtn = document.createElement('button');
        const canHire = state.mercenaryCount < state.mercenaryMax && state.currentMoney >= state.mercenaryCost;
        mercBtn.textContent = `Hire mercenary (${formatNumber(state.mercenaryCost)}$)`;
        mercBtn.style.padding = '10px 20px';
        mercBtn.style.width = '100%';
        mercBtn.style.border = '1px solid rgba(255, 200, 0, 0.4)';
        mercBtn.style.borderRadius = '6px';
        mercBtn.style.background = canHire ? 'rgba(255, 200, 0, 0.2)' : '#333';
        mercBtn.style.color = 'white';
        mercBtn.style.cursor = canHire ? 'pointer' : 'not-allowed';
        mercBtn.onclick = () => {
            const ok = onHireMercenary();
            if (ok) updateUi();
        };

        section3.appendChild(mercLabel);
        section3.appendChild(mercBtn);

        // --- FOOTER ---
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '❌ Close';
        closeBtn.style.marginTop = '10px';
        closeBtn.style.padding = '10px 30px';
        closeBtn.style.background = '#666';
        closeBtn.style.border = 'none';
        closeBtn.style.color = 'white';
        closeBtn.style.borderRadius = '6px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.onclick = () => {
            onCancel();
            this.closeModal();
        };

        dialog.appendChild(title);
        dialog.appendChild(info);
        dialog.appendChild(levelText);
        dialog.appendChild(section1);
        dialog.appendChild(section2);
        dialog.appendChild(section3);
        dialog.appendChild(closeBtn);
        this.modalContainer.appendChild(dialog);
        document.body.appendChild(this.modalContainer);

        const updateUi = () => {
            const next = getState();
            info.textContent = `Threat: ${formatNumber(next.currentStrength)} | Command: ${next.commandUsed}/${next.commandCapacity} | Money: $${formatNumber(next.currentMoney)}`;
            levelText.textContent = next.levelInfo;

            upgradeButton.textContent = '⚓ SHIPYARD';
            upgradeButton.style.background = '#00AA00';
            upgradeButton.style.cursor = 'pointer';

            for (const btn of abilityButtons) {
                btn.style.background = next.currentMoney >= 200 ? 'rgba(0, 200, 255, 0.2)' : '#333';
                btn.style.cursor = next.currentMoney >= 200 ? 'pointer' : 'not-allowed';
            }

            mercLabel.textContent = `HIRE MERCENARY (${next.mercenaryCount}/${next.mercenaryMax} in system)`;
            const nextCanHire = next.mercenaryCount < next.mercenaryMax && next.currentMoney >= next.mercenaryCost;
            mercBtn.textContent = `Hire mercenary (${formatNumber(next.mercenaryCost)}$)`;
            mercBtn.style.background = nextCanHire ? 'rgba(255, 200, 0, 0.2)' : '#333';
            mercBtn.style.cursor = nextCanHire ? 'pointer' : 'not-allowed';
        };

        updateUi();
    }

    showFAQDialog(onClose: () => void) {
        this.closeModal();
        this.modalContainer = this.createOverlay();
        const dialog = this.createDialog('VOIDTACTICS · СПРАВКА', 720);
        const sections = [
            ['Как понять угрозу?', 'Threat — компактная оценка боевой опасности флота: корпус кораблей, оружие и поддержка. Это не запас здоровья. DEF в панели — текущие щиты + броня + корпус.'],
            ['Почему щит не пробивается?', 'Урон проходит слоями: щит → броня → корпус. Щит восстанавливается после паузы, броня и корпус — только поддержкой, припасами или на станции. Поэтому фокусируйте огонь и следите за DPS.'],
            ['Что означает форма и цвет?', 'Силуэт показывает роль флагмана флота: широкий — защитник, длинный — артиллерия, компактный — разведка. Цвет кольца — относительная угроза: зелёный ниже половины вашей, жёлтый близкий, оранжевый выше, красный значительно выше.'],
            ['Как растёт флот?', 'Деньги зачисляются только за урон по корпусу. На Terra кнопка SHIPYARD открывает выбор конкретного корпуса, роли и усиленного tier; command cost должен помещаться в лимит. Навык Leadership даёт +3 command capacity за уровень.'],
            ['Зачем нужны роли?', 'Defender перехватывает часть атак, striker наносит урон, artillery стреляет издалека, scout раскрывает цели и ставит помехи, support ремонтирует и стабилизирует disabled-корабли, flagship задаёт командование.'],
            ['Как работают уровни и навыки?', 'Каждые 1000 заработанных кредитов открывают уровень (следующий порог растёт в 1,5 раза) и дают очко навыка. Навыки не имеют верхнего лимита: Logistics увеличивает припасы, Engineering ускоряет ремонт, Sensors уменьшает заметность, Navigation ускоряет перелёт, Tactics усиливает перехваты.'],
            ['Что делать после боя?', 'Проверьте disabled-корабли, прикажите REPAIR и пополните припасы. На станции можно полностью восстановить флот. Бой можно покинуть — повреждения и трофеи сохраняются.']
        ];
        for (const [title, body] of sections) {
            const item = document.createElement('section');
            item.style.marginBottom = '14px';
            item.innerHTML = `<h3 style="margin:0 0 5px;color:#62d8ff;font-size:14px">${title}</h3><p style="margin:0;color:#c8d5e2;line-height:1.45;font-size:12px">${body}</p>`;
            dialog.appendChild(item);
        }
        const close = this.makeButton('Закрыть', '#475569', () => { onClose(); this.closeModal(); });
        dialog.appendChild(close);
        this.modalContainer.appendChild(dialog);
        document.body.appendChild(this.modalContainer);
    }

    showFleetManagementDialog(
        getState: () => { money: number; commandUsed: number; commandCapacity: number; level: number; skillPoints: number; skills: Record<FleetSkillId, number>; ships: { name: string; role: string; commandCost: number }[] },
        onBuy: (id: string) => boolean,
        onSkill: (skill: FleetSkillId) => boolean,
        onClose: () => void
    ) {
        this.closeModal();
        this.modalContainer = this.createOverlay();
        const dialog = this.createDialog('ФЛОТ · ВЕРФЬ · НАВЫКИ', 760);
        const summary = document.createElement('div');
        summary.style.cssText = 'color:#ffd166;font:13px monospace;margin-bottom:12px';
        dialog.appendChild(summary);
        const content = document.createElement('div');
        content.style.cssText = 'max-height:65vh;overflow:auto;text-align:left;padding-right:4px';
        dialog.appendChild(content);

        const update = () => {
            const state = getState();
            summary.textContent = `Кредиты $${formatNumber(Math.floor(state.money))}  ·  Командование ${state.commandUsed}/${state.commandCapacity}  ·  Уровень ${state.level}  ·  Очки навыков ${state.skillPoints}`;
            content.innerHTML = '';
            const skillTitle = document.createElement('h3');
            skillTitle.textContent = 'НАВЫКИ ФЛОТА';
            skillTitle.style.cssText = 'color:#62d8ff;margin:4px 0 8px;font-size:14px';
            content.appendChild(skillTitle);
            (Object.keys(FLEET_SKILLS) as FleetSkillId[]).forEach(skill => {
                const def = FLEET_SKILLS[skill];
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,.08);padding:7px 0';
                const label = document.createElement('span');
                label.style.cssText = 'flex:1;color:#e2e8f0;font-size:12px';
                label.innerHTML = `<b>${def.name}</b> ${state.skills[skill] || 0}/∞<small style="display:block;color:#94a3b8">${def.description}</small>`;
                const btn = this.makeButton('+1', '#0b7285', () => { if (onSkill(skill)) update(); });
                btn.disabled = state.skillPoints <= 0;
                btn.style.opacity = btn.disabled ? '0.4' : '1';
                row.append(label, btn); content.appendChild(row);
            });
            const shipTitle = document.createElement('h3');
            shipTitle.textContent = 'ВЕРФЬ · КОРАБЛИ';
            shipTitle.style.cssText = 'color:#62d8ff;margin:18px 0 8px;font-size:14px';
            content.appendChild(shipTitle);
            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px';
            for (const ship of SHOP_SHIPS) {
                const card = document.createElement('div');
                card.style.cssText = 'background:rgba(255,255,255,.05);border:1px solid rgba(98,216,255,.18);border-radius:6px;padding:9px';
                const hull = HULLS[ship.loadout.hullId];
                const commandCost = Math.max(hull.commandCost, Math.ceil(hull.commandCost * Math.sqrt(ship.statScale)));
                const skillReady = !ship.requiredSkill || (state.skills[ship.requiredSkill.skill] || 0) >= ship.requiredSkill.level;
                const can = state.money >= ship.price && state.commandUsed + commandCost <= state.commandCapacity && state.level >= ship.requiredLevel && skillReady;
                const requirement = ship.requiredSkill ? ` · ${ship.requiredSkill.skill} ${ship.requiredSkill.level}+` : '';
                const reason = state.level < ship.requiredLevel ? `Нужен Lv ${ship.requiredLevel}` : !skillReady ? `Нужен ${ship.requiredSkill?.skill} ${ship.requiredSkill?.level}` : state.commandUsed + commandCost > state.commandCapacity ? 'Не хватает command' : state.money < ship.price ? 'Не хватает кредитов' : 'Недоступно';
                card.innerHTML = `<b style="color:#f8fafc">${ship.name}</b><small style="display:block;color:#94a3b8">${ship.size} · ${ship.role} · ${ship.description}</small><span style="display:block;color:#ffd166;margin:5px 0">$${formatNumber(ship.price)} · C${commandCost} · ×${ship.statScale} power${requirement}</span>`;
                const buy = this.makeButton(can ? 'Купить' : reason, can ? '#167c80' : '#334155', () => { if (onBuy(ship.id)) update(); });
                buy.disabled = !can; buy.style.opacity = can ? '1' : '0.55'; buy.style.width = '100%'; card.appendChild(buy); grid.appendChild(card);
            }
            content.appendChild(grid);
        };
        update();
        dialog.appendChild(this.makeButton('Закрыть', '#475569', () => { onClose(); this.closeModal(); }));
        this.modalContainer.appendChild(dialog);
        document.body.appendChild(this.modalContainer);
    }

    private createOverlay() {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.82);display:flex;align-items:center;justify-content:center;z-index:10000;padding:12px';
        return overlay;
    }

    private createDialog(titleText: string, maxWidth: number) {
        const dialog = document.createElement('div');
        dialog.style.cssText = `background:linear-gradient(135deg,#0f1b2d,#111827);border:1px solid rgba(98,216,255,.45);border-radius:10px;box-shadow:0 12px 45px rgba(0,0,0,.55);color:white;font-family:monospace;text-align:left;width:min(100%,${maxWidth}px);max-height:92vh;overflow:auto;padding:20px`;
        const title = document.createElement('h2');
        title.textContent = titleText; title.style.cssText = 'margin:0 0 16px;color:#62d8ff;font-size:18px';
        dialog.appendChild(title); return dialog;
    }

    private makeButton(text: string, color: string, callback: () => void) {
        const button = document.createElement('button');
        button.textContent = text; button.style.cssText = `padding:7px 12px;border:1px solid rgba(255,255,255,.18);border-radius:5px;background:${color};color:white;font:12px monospace;cursor:pointer`;
        button.onclick = event => { event.stopPropagation(); callback(); }; return button;
    }

    /**
     * Show asteroid mining dialog
     */
    showAsteroidMiningDialog(onMine: () => void, onCancel: () => void) {
        this.closeModal();

        this.modalContainer = document.createElement('div');
        this.modalContainer.style.position = 'fixed';
        this.modalContainer.style.top = '0';
        this.modalContainer.style.left = '0';
        this.modalContainer.style.width = '100%';
        this.modalContainer.style.height = '100%';
        this.modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.modalContainer.style.display = 'flex';
        this.modalContainer.style.alignItems = 'center';
        this.modalContainer.style.justifyContent = 'center';
        this.modalContainer.style.zIndex = '10000';

        const dialog = document.createElement('div');
        dialog.style.background = 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)';
        dialog.style.padding = '30px';
        dialog.style.borderRadius = '12px';
        dialog.style.border = '2px solid rgba(255, 165, 0, 0.5)';
        dialog.style.boxShadow = '0 8px 32px rgba(255, 165, 0, 0.3)';
        dialog.style.color = 'white';
        dialog.style.fontFamily = 'monospace';
        dialog.style.textAlign = 'center';
        dialog.style.minWidth = '300px';

        const title = document.createElement('h2');
        title.textContent = '⛏️ Asteroid Mining';
        title.style.margin = '0 0 20px 0';
        title.style.fontSize = '24px';
        title.style.color = '#FFA500';

        const message = document.createElement('p');
        message.textContent = 'Mining rate depends on active ships in the fleet.';
        message.style.margin = '0 0 30px 0';
        message.style.fontSize = '14px';
        message.style.lineHeight = '1.6';
        message.style.color = '#CCCCCC';

        const info = document.createElement('div');
        info.style.background = 'rgba(255, 255, 255, 0.1)';
        info.style.padding = '15px';
        info.style.borderRadius = '8px';
        info.style.marginBottom = '30px';
        info.style.fontSize = '12px';
        info.style.color = '#AAAAAA';
        info.innerHTML = `
            <strong>⚠️ WARNING:</strong><br/>
            While mining, your fleet is vulnerable to attacks.<br/>
            Enemies will prioritize mining targets.<br/>
            Mining will be interrupted if you take damage.
        `;

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.justifyContent = 'center';

        const createButton = (text: string, bgColor: string, callback: () => void) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.padding = '12px 24px';
            btn.style.border = 'none';
            btn.style.borderRadius = '6px';
            btn.style.background = bgColor;
            btn.style.color = 'white';
            btn.style.fontSize = '14px';
            btn.style.fontWeight = 'bold';
            btn.style.cursor = 'pointer';
            btn.style.transition = 'transform 0.2s, box-shadow 0.2s';
            btn.style.fontFamily = 'monospace';

            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'scale(1.05)';
                btn.style.boxShadow = `0 4px 12px ${bgColor}80`;
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'scale(1)';
                btn.style.boxShadow = 'none';
            });

            btn.addEventListener('click', () => {
                callback();
                this.closeModal();
            });

            return btn;
        };

        buttonContainer.appendChild(createButton('⛏️ Mine', '#FFA500', onMine));
        buttonContainer.appendChild(createButton('❌ Cancel', '#666666', onCancel));

        dialog.appendChild(title);
        dialog.appendChild(message);
        dialog.appendChild(info);
        dialog.appendChild(buttonContainer);
        this.modalContainer.appendChild(dialog);
        document.body.appendChild(this.modalContainer);
    }

    /**
     * Close any open modal
     */
    closeModal() {
        if (this.modalContainer) {
            this.modalContainer.remove();
            this.modalContainer = null;
        }
    }
}

import { formatNumber } from '../utils/NumberFormatter';
import { SaveSystem } from './SaveSystem';

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
        reward.textContent = '+100 💪 Fleet Strength\n+$5,000 💰 Money';
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
    showTerraUpgradeDialog(currentStrength: number, currentMoney: number, onUpgrade: () => void, onCancel: () => void) {
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
        title.textContent = '🌍 Terra Station';
        title.style.margin = '0 0 20px 0';
        title.style.fontSize = '24px';
        title.style.color = '#00C8FF';

        const info = document.createElement('p');
        info.textContent = `Current Fleet Strength: ${formatNumber(currentStrength)}\nCurrent Money: $${formatNumber(currentMoney)}`;
        info.style.margin = '0 0 30px 0';
        info.style.fontSize = '14px';
        info.style.lineHeight = '1.6';
        info.style.whiteSpace = 'pre-line';

        const upgradeButton = document.createElement('button');
        upgradeButton.textContent = 'Upgrade Fleet (All Money)';
        upgradeButton.style.padding = '12px 24px';
        upgradeButton.style.border = 'none';
        upgradeButton.style.borderRadius = '6px';
        upgradeButton.style.background = currentMoney >= 100 ? '#00AA00' : '#666666';
        upgradeButton.style.color = 'white';
        upgradeButton.style.fontSize = '14px';
        upgradeButton.style.fontWeight = 'bold';
        upgradeButton.style.cursor = currentMoney >= 100 ? 'pointer' : 'not-allowed';
        upgradeButton.style.fontFamily = 'monospace';
        upgradeButton.style.marginRight = '10px';

        upgradeButton.addEventListener('click', () => {
            onUpgrade();
        });

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.padding = '12px 24px';
        cancelButton.style.border = 'none';
        cancelButton.style.borderRadius = '6px';
        cancelButton.style.background = '#FF4444';
        cancelButton.style.color = 'white';
        cancelButton.style.fontSize = '14px';
        cancelButton.style.fontWeight = 'bold';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontFamily = 'monospace';

        cancelButton.addEventListener('click', () => {
            onCancel();
        });

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.gap = '10px';
        buttonContainer.appendChild(upgradeButton);
        buttonContainer.appendChild(cancelButton);

        dialog.appendChild(title);
        dialog.appendChild(info);
        dialog.appendChild(buttonContainer);
        this.modalContainer.appendChild(dialog);
        document.body.appendChild(this.modalContainer);
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
        message.textContent = 'Mining Rate: 0.001$ per second per fleet strength';
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

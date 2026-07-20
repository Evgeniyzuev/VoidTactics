import { formatNumber } from '../utils/NumberFormatter';
import { SaveSystem } from './SaveSystem';
import type { FleetSkillId } from '../entities/Fleet';
import { FLEET_SKILLS } from '../entities/Fleet';
import { getShopShipStats, getShopSizeMultiplier, getShopTechMultiplier, getShopMultiplier, getShopRequirements, SHOP_SHIPS } from '../tactical/FleetGenerator';
import { ABILITY_EQUIPMENT_MARKET, type FleetAbilityId } from '../tactical/AbilityService';
import type { StationServiceMode } from '../tactical/RepairService';
import { bindButtonAction } from '../utils/TouchButton';

export interface TerraServiceQuoteView {
    fuel: number;
    supplies: number;
    ammunition: number;
    hull: number;
    armor: number;
    repairsTotal: number;
    total: number;
}

export interface TerraDialogState {
    currentStrength: number;
    currentMaxStrength: number;
    currentMoney: number;
    commandUsed: number;
    commandCapacity: number;
    shipCost: number;
    levelInfo: string;
    mercenaryCount: number;
    mercenaryMax: number;
    mercenaryCost: number;
    abilityCharges: Record<FleetAbilityId, number>;
    serviceQuote?: TerraServiceQuoteView;
}

export interface TerraServicePurchaseResult {
    ok: boolean;
    cost: number;
    partial?: boolean;
}

export class ModalManager {
    private modalContainer: HTMLDivElement | null = null;
    private modalRefreshTimer: number | null = null;

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

            bindButtonAction(btn, () => {
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
        getState: () => TerraDialogState,
        onUpgrade: () => boolean,
        onCancel: () => void,
        onBuyAbility: (id: string) => boolean,
        onSellAbility: (id: string) => boolean,
        onHireMercenary: () => boolean,
        onPurchaseService?: (mode: StationServiceMode) => TerraServicePurchaseResult
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
        dialog.style.padding = 'clamp(14px, 4vw, 30px)';
        dialog.style.borderRadius = '12px';
        dialog.style.border = '2px solid rgba(0, 200, 255, 0.5)';
        dialog.style.boxShadow = '0 8px 32px rgba(0, 200, 255, 0.3)';
        dialog.style.color = 'white';
        dialog.style.fontFamily = 'monospace';
        dialog.style.textAlign = 'center';
        dialog.style.width = 'min(92vw, 620px)';
        dialog.style.maxHeight = '92vh';
        dialog.style.overflowY = 'auto';
        dialog.style.boxSizing = 'border-box';

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
        upgradeButton.style.minHeight = '44px';
        upgradeButton.style.touchAction = 'manipulation';
        bindButtonAction(upgradeButton, () => {
            onUpgrade();
            updateUi();
        });

        section1.appendChild(upgradeLabel);
        section1.appendChild(upgradeButton);

        // --- ABILITIES SECTION ---
        const section2 = document.createElement('div');
        section2.style.background = 'rgba(255, 255, 255, 0.05)';
        section2.style.padding = '15px';
        section2.style.borderRadius = '8px';
        section2.style.marginBottom = '20px';

        const shopLabel = document.createElement('div');
        shopLabel.textContent = `EQUIPMENT MARKET · BUY $${ABILITY_EQUIPMENT_MARKET.buyPrice} · SELL $${ABILITY_EQUIPMENT_MARKET.sellPrice} · MAX ${ABILITY_EQUIPMENT_MARKET.maxCharges}`;
        shopLabel.style.fontSize = '12px';
        shopLabel.style.marginBottom = '10px';
        shopLabel.style.opacity = '0.7';
        section2.appendChild(shopLabel);

        const shopGrid = document.createElement('div');
        shopGrid.style.display = 'grid';
        shopGrid.style.gridTemplateColumns = '1fr';
        shopGrid.style.gap = '8px';

        const abilities: { id: FleetAbilityId; name: string }[] = [
            { id: 'afterburner', name: '🚀 Afterburner' },
            { id: 'bubble', name: '🫧 Bubble' },
            { id: 'cloak', name: '👻 Cloak' },
            { id: 'mine', name: '💣 Warp Mine' },
            { id: 'medkit', name: '✚ Emergency Repair' },
            { id: 'fire', name: '🔥 Weapon Overcharge' },
            { id: 'shield', name: '🛡 Shield Cell' }
        ];
        const abilityRows: { id: FleetAbilityId; count: HTMLElement; buy: HTMLButtonElement; sell: HTMLButtonElement }[] = [];
        abilities.forEach(ability => {
            const row = document.createElement('div');
            row.style.display = 'grid';
            row.style.gridTemplateColumns = 'minmax(0, 1fr) 48px 86px 86px';
            row.style.gap = '6px';
            row.style.alignItems = 'center';
            row.style.padding = '4px 0';
            const name = document.createElement('span');
            name.textContent = ability.name;
            name.style.textAlign = 'left';
            name.style.fontSize = '12px';
            const count = document.createElement('span');
            count.style.color = '#9edfff';
            count.style.font = '11px monospace';
            count.style.textAlign = 'center';
            const buy = document.createElement('button');
            buy.type = 'button';
            buy.style.minHeight = '44px';
            buy.style.touchAction = 'manipulation';
            buy.style.fontSize = '11px';
            buy.textContent = `BUY $${ABILITY_EQUIPMENT_MARKET.buyPrice}`;
            bindButtonAction(buy, () => {
                onBuyAbility(ability.id);
                updateUi();
            });
            const sell = document.createElement('button');
            sell.type = 'button';
            sell.style.minHeight = '44px';
            sell.style.touchAction = 'manipulation';
            sell.style.fontSize = '11px';
            sell.textContent = `SELL $${ABILITY_EQUIPMENT_MARKET.sellPrice}`;
            bindButtonAction(sell, () => {
                onSellAbility(ability.id);
                updateUi();
            });
            row.append(name, count, buy, sell);
            shopGrid.appendChild(row);
            abilityRows.push({ id: ability.id, count, buy, sell });
        });
        section2.appendChild(shopGrid);

        // --- FULL SERVICE SECTION ---
        const serviceSection = document.createElement('div');
        serviceSection.style.background = 'rgba(255, 255, 255, 0.05)';
        serviceSection.style.padding = '15px';
        serviceSection.style.borderRadius = '8px';
        serviceSection.style.marginBottom = '20px';

        const serviceLabel = document.createElement('div');
        serviceLabel.textContent = 'FLEET SERVICE · FULL REPAIR AND RESUPPLY';
        serviceLabel.style.fontSize = '12px';
        serviceLabel.style.marginBottom = '8px';
        serviceLabel.style.opacity = '0.8';

        const serviceBreakdown = document.createElement('div');
        serviceBreakdown.style.cssText = 'font-size:11px;line-height:1.55;color:#a7c7d9;margin-bottom:10px;text-align:left';

        const serviceStatus = document.createElement('div');
        serviceStatus.style.cssText = 'min-height:16px;font-size:11px;margin-bottom:8px;color:#ffd166';

        const serviceButton = document.createElement('button');
        serviceButton.style.padding = '10px 20px';
        serviceButton.style.width = '100%';
        serviceButton.style.minHeight = '44px';
        serviceButton.style.border = '1px solid rgba(0, 255, 160, 0.5)';
        serviceButton.style.borderRadius = '6px';
        serviceButton.style.color = 'white';
        serviceButton.style.fontFamily = 'monospace';
        serviceButton.style.touchAction = 'manipulation';
        const serviceChoiceRow = document.createElement('div');
        serviceChoiceRow.style.display = 'grid';
        serviceChoiceRow.style.gridTemplateColumns = '1fr 1fr';
        serviceChoiceRow.style.gap = '6px';
        serviceChoiceRow.style.marginBottom = '6px';
        const fuelButton = document.createElement('button');
        fuelButton.type = 'button';
        fuelButton.textContent = 'REFUEL · up to budget';
        const repairButton = document.createElement('button');
        repairButton.type = 'button';
        repairButton.textContent = 'REPAIR · up to budget';
        for (const button of [fuelButton, repairButton]) {
            button.style.minHeight = '44px';
            button.style.padding = '8px';
            button.style.border = '1px solid rgba(0, 220, 170, 0.4)';
            button.style.borderRadius = '6px';
            button.style.color = 'white';
            button.style.fontFamily = 'monospace';
            button.style.fontSize = '10px';
            button.style.touchAction = 'manipulation';
        }
        serviceChoiceRow.append(fuelButton, repairButton);
        const performService = (mode: StationServiceMode) => {
            if (!onPurchaseService) return;
            const result = onPurchaseService(mode);
            serviceStatus.textContent = result.ok
                ? `${mode === 'fuel' ? 'Refuel' : mode === 'repairs' ? 'Repairs' : 'Service'} complete: $${formatNumber(result.cost)}${result.partial ? ' · budget applied partially' : ''}.`
                : 'No credits available for this service.';
            serviceStatus.style.color = result.ok ? '#69f0ae' : '#ff8a80';
            updateUi();
        };
        bindButtonAction(serviceButton, () => {
            performService('all');
        });
        bindButtonAction(fuelButton, () => performService('fuel'));
        bindButtonAction(repairButton, () => performService('repairs'));

        serviceSection.append(serviceLabel, serviceBreakdown, serviceStatus, serviceChoiceRow, serviceButton);

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
        mercBtn.style.minHeight = '44px';
        mercBtn.style.touchAction = 'manipulation';
        bindButtonAction(mercBtn, () => {
            const ok = onHireMercenary();
            if (ok) updateUi();
        });

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
        closeBtn.style.minHeight = '44px';
        closeBtn.style.minWidth = '44px';
        closeBtn.style.touchAction = 'manipulation';
        bindButtonAction(closeBtn, () => {
            onCancel();
            this.closeModal();
        });

        dialog.appendChild(title);
        dialog.appendChild(info);
        dialog.appendChild(levelText);
        dialog.appendChild(section1);
        dialog.appendChild(section2);
        dialog.appendChild(serviceSection);
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

            for (const row of abilityRows) {
                const charges = next.abilityCharges[row.id] || 0;
                row.count.textContent = `${charges}/${ABILITY_EQUIPMENT_MARKET.maxCharges}`;
                row.buy.disabled = charges >= ABILITY_EQUIPMENT_MARKET.maxCharges || next.currentMoney < ABILITY_EQUIPMENT_MARKET.buyPrice;
                row.sell.disabled = charges <= 0;
                row.buy.style.background = row.buy.disabled ? '#333' : 'rgba(0, 200, 255, 0.2)';
                row.sell.style.background = row.sell.disabled ? '#333' : 'rgba(255, 185, 80, 0.2)';
                row.buy.style.cursor = row.buy.disabled ? 'not-allowed' : 'pointer';
                row.sell.style.cursor = row.sell.disabled ? 'not-allowed' : 'pointer';
            }

            const quote = next.serviceQuote;
            if (quote) {
                serviceBreakdown.textContent =
                    `Fuel $${formatNumber(Math.ceil(quote.fuel))} · Supplies $${formatNumber(Math.ceil(quote.supplies))} · ` +
                    `Ammo $${formatNumber(Math.ceil(quote.ammunition))} · Hull $${formatNumber(Math.ceil(quote.hull))} · ` +
                    `Armor $${formatNumber(Math.ceil(quote.armor))} · Repairs $${formatNumber(quote.repairsTotal)} · Shield/Energy FREE`;
                serviceButton.textContent = quote.total > 0
                    ? `SERVICE ALL · up to $${formatNumber(quote.total)}`
                    : 'RECHARGE SHIELD & ENERGY · FREE';
                serviceButton.disabled = !onPurchaseService || (quote.total > 0 && next.currentMoney <= 0);
                fuelButton.disabled = !onPurchaseService || quote.fuel <= 0 || next.currentMoney <= 0;
                repairButton.disabled = !onPurchaseService || quote.repairsTotal <= 0 || next.currentMoney <= 0;
            } else {
                serviceBreakdown.textContent = 'Fuel $2/u · Supply $25 · Ammo $1/u · Hull $3/u · Armor $2/u · Shield/Energy FREE';
                serviceButton.textContent = 'SERVICE ALL · CONNECT GAME CALLBACK';
                serviceButton.disabled = true;
                fuelButton.disabled = true;
                repairButton.disabled = true;
            }
            serviceButton.style.background = serviceButton.disabled ? '#333' : 'rgba(0, 180, 110, 0.32)';
            serviceButton.style.cursor = serviceButton.disabled ? 'not-allowed' : 'pointer';
            serviceButton.style.opacity = serviceButton.disabled ? '0.65' : '1';
            for (const button of [fuelButton, repairButton]) {
                button.style.background = button.disabled ? '#333' : 'rgba(0, 180, 110, 0.22)';
                button.style.cursor = button.disabled ? 'not-allowed' : 'pointer';
                button.style.opacity = button.disabled ? '0.65' : '1';
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
            ['Что показывает зелёный радар?', 'Окружность — строгая номинальная область обнаружения флотов. При входе появляется приблизительный Classified-контакт, точные данные требуют сканирования; вышедший за границу корабль скрывается. Сигналы могут оставаться последней отметкой до 8 секунд.'],
            ['Почему данные о цели неполные?', 'Контакт проходит три стадии: Blip показывает только отметку, Classified — фракцию, Ships и примерный Threat, Identified — точные DPS, readiness, роли и защиту. Оставайтесь рядом до завершения сканирования.'],
            ['Что делает Scan Pulse?', 'Active Scan Pulse на 4 секунды удваивает радиус радара и расходует 15% общей Energy. После импульса ваша Signature 8 секунд удвоена: вы увидите дальше, но противники тоже легче обнаружат вас.'],
            ['Почему bubble иногда появляется без видимого владельца?', 'Bubble считается зоной угрозы. Если её центр или край входит в ваш радар, либо вы уже попали внутрь, зона отображается даже при скрытом владельце. Дальние зоны без сенсорного контакта намеренно не рисуются.'],
            ['Что такое Energy?', 'Это единая шкала корабля для оружия, восстановления shield и активных систем. При пустой Energy стрельба и регенерация щита останавливаются до подзарядки. Старой отдельной шкалы Flux больше нет.'],
            ['Как работают слои защиты?', 'Урон проходит как shield → armor → hull. Shield восстанавливается после 4 секунд без попаданий и тратит Energy. Armor и hull сами не чинятся; при нуле hull корабль становится disabled.'],
            ['Зачем нужны fuel и supplies?', 'Fuel тратится только в движении. Supplies оплачивают стабилизацию, ремонт hull/armor, боезапас и восстановление readiness. При нуле fuel остаётся аварийная скорость 25%, но форсаж недоступен.'],
            ['Что означает readiness?', 'Бой и форсаж снижают боеготовность. Ниже 50 постепенно падают damage, скорость и Energy recharge; ниже 15 нельзя включить форсаж. Вне боя readiness восстанавливается за supplies.'],
            ['Какова цена форсажа?', 'Afterburner даёт ×1,75 скорости на 3 секунды, но расходует Energy, снижает readiness, умножает расход fuel на 2,5 и Signature на 1,75. Это средство перехвата или отхода, а не постоянный режим.'],
            ['Что делают три аварийных расходника?', 'Emergency Repair чинит только hull выбранного корабля и стабилизирует disabled. Shield Cell мгновенно возвращает 35% shield. Weapon Overcharge даёт +50% damage на 5 секунд ценой ×1,75 Energy cost и 5 readiness после действия.'],
            ['Почему charge не потратился?', 'Сначала проверяются цель и ресурсы. Полный hull/shield, destroyed-цель, cooldown или нехватка Energy, fuel либо readiness отменяют применение без списания charge. Причина появляется в журнале.'],
            ['Как работают сигналы?', 'SignalDirector периодически создаёт до трёх событий: конвой, ловушку-дереликт, аномалию, терпящий бедствие танкер или гонку за salvage. У них есть таймер, несколько решений и самостоятельный исход без игрока.'],
            ['Что делать на Terra?', 'SHIPYARD меняет состав флота, а EQUIPMENT MARKET позволяет покупать и продавать charges всех расходников. REFUEL, REPAIR и SERVICE ALL работают частично и тратят доступный бюджет, если денег не хватает на полный объём; shield и Energy на станции заряжаются бесплатно.'],
            ['Что делает cloak?', 'Cloak снижает Signature и сбрасывает входящие захваты цели. После активации преследователи теряют право на атаку и должны заново обнаружить флот; cloak нельзя включить во время собственной атаки.'],
            ['Что защищает Terra?', 'Вокруг Terra стоят шесть неподвижных военных платформ. Они образуют оборонное кольцо и автоматически обстреливают пиратов, орков и рейдеров, вошедших в охраняемую зону.'],
            ['Как понять Threat и увеличить флот?', 'Threat — оценка оружия, корпуса и поддержки, а не здоровье. Каждый корабль занимает 1 command point; Leadership даёт ещё 3. Size и Tech открывают более сильные корпуса и не расходуются при покупке.'],
            ['Зачем нужны роли?', 'Defender перехватывает часть атак, striker наносит урон, artillery стреляет издалека, scout разведывает, support ремонтирует и стабилизирует disabled, flagship обеспечивает командование.']
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
        getState: () => { money: number; commandUsed: number; commandCapacity: number; level: number; skillPoints: number; skills: Record<FleetSkillId, number>; ships: { id: string; name: string; role: string; state: string; commandCost: number; refund: number; threat: number; hull: number; armor: number; shield: number; dps: number }[] },
        onBuy: (id: string) => boolean,
        onSkill: (skill: FleetSkillId) => boolean,
        onDismiss: (id: string) => boolean,
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
                const current = state.skills[skill] || 0;
                const atLimit = current >= state.level;
                label.innerHTML = `<b>${def.name}</b> ${current}/${state.level}<small style="display:block;color:#94a3b8">${def.description}</small>`;
                const btn = this.makeButton('+1', '#0b7285', () => { if (onSkill(skill)) update(); });
                btn.disabled = state.skillPoints <= 0 || atLimit;
                if (atLimit) btn.textContent = 'ЛИМИТ';
                btn.style.opacity = btn.disabled ? '0.4' : '1';
                row.append(label, btn); content.appendChild(row);
            });
            const rosterTitle = document.createElement('h3');
            rosterTitle.textContent = 'ТЕКУЩИЙ ФЛОТ · DISMISS ВОЗВРАЩАЕТ 50% ЦЕНЫ';
            rosterTitle.style.cssText = 'color:#62d8ff;margin:18px 0 8px;font-size:14px';
            content.appendChild(rosterTitle);
            const roster = document.createElement('div');
            roster.style.cssText = 'display:grid;gap:6px;margin-bottom:12px';
            for (const ship of state.ships) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px;border:1px solid rgba(255,255,255,.1);border-radius:5px;background:rgba(255,255,255,.03)';
                const stats = document.createElement('span');
                stats.style.cssText = 'flex:1;color:#c8d5e2;font-size:11px';
                stats.innerHTML = `<b>${ship.name}</b> · ${ship.role} · ${ship.state}<small style="display:block;color:#94a3b8">Threat ${Math.round(ship.threat)} · DPS ${Math.round(ship.dps)} · S ${Math.round(ship.shield)} · A ${Math.round(ship.armor)} · H ${Math.round(ship.hull)}</small>`;
                const dismiss = this.makeButton(ship.refund > 0 ? `Уволить +$${formatNumber(ship.refund)}` : 'Уволить', '#7f2939', () => { if (onDismiss(ship.id)) update(); });
                dismiss.disabled = state.ships.length <= 1;
                dismiss.style.opacity = dismiss.disabled ? '0.4' : '1';
                row.append(stats, dismiss); roster.appendChild(row);
            }
            content.appendChild(roster);
            const shipTitle = document.createElement('h3');
            shipTitle.textContent = 'ВЕРФЬ · КОРАБЛИ';
            shipTitle.style.cssText = 'color:#62d8ff;margin:18px 0 8px;font-size:14px';
            content.appendChild(shipTitle);
            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px';
            for (const ship of [...SHOP_SHIPS].sort((a, b) => a.rank - b.rank)) {
                const card = document.createElement('div');
                card.style.cssText = 'background:linear-gradient(145deg,rgba(30,64,92,.9),rgba(15,23,42,.96));border:1px solid rgba(98,216,255,.28);border-radius:9px;padding:10px;box-shadow:0 5px 14px rgba(0,0,0,.2)';
                const commandCost = 1;
                const preview = getShopShipStats(ship);
                const requirements = getShopRequirements(ship);
                const missingSkills = Object.entries(requirements)
                    .filter(([skill, level]) => (state.skills[skill as FleetSkillId] || 0) < (level || 0))
                    .map(([skill, level]) => `${FLEET_SKILLS[skill as FleetSkillId].name} ${level}`);
                const requirementChips = Object.entries(requirements).map(([skill, level]) => {
                    const ready = (state.skills[skill as FleetSkillId] || 0) >= (level || 0);
                    return `<span style="display:inline-block;padding:2px 5px;margin:2px;border-radius:4px;background:${ready ? '#176b4d' : '#8b3030'};color:#fff">${skill} ${level}</span>`;
                }).join('');
                const can = missingSkills.length === 0 && state.money >= ship.price && state.commandUsed + commandCost <= state.commandCapacity;
                const reason = missingSkills.length > 0 ? `Нужны навыки: ${missingSkills.join(', ')}` : state.commandUsed + commandCost > state.commandCapacity ? 'Не хватает command' : state.money < ship.price ? 'Не хватает кредитов' : 'Недоступно';
                card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><b style="color:#f8fafc">${ship.name}</b><span style="color:#62d8ff">R${ship.rank}</span></div><small style="display:block;color:#a8dadc;margin-top:3px">${ship.role} · ${ship.size}</small><div style="display:flex;justify-content:space-between;align-items:baseline;margin:7px 0"><b style="font-size:18px;color:#ffd166">$${formatNumber(ship.price)}</b><b style="font-size:16px;color:#f8fafc">Threat ${Math.round(preview.threat)}</b></div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;color:#c8d5e2;font-size:10px;text-align:center"><span>DPS<br/><b>${Math.round(preview.dps)}</b></span><span>Shield<br/><b>${Math.round(preview.shield)}</b></span><span>Armor<br/><b>${Math.round(preview.armor)}</b></span><span>Hull<br/><b>${Math.round(preview.hull)}</b></span></div><div style="margin-top:7px;font-size:10px">${requirementChips || '<span style="color:#74c69d">Без требований навыков</span>'}</div><small style="display:block;color:#94a3b8;margin-top:4px">Size×${getShopSizeMultiplier(ship.sizeRequired)} · Tech×${getShopTechMultiplier(ship.techRequired)} = ×${getShopMultiplier(ship)}</small>`;
                const buy = this.makeButton(can ? 'Купить' : reason, can ? '#167c80' : '#334155', () => { if (onBuy(ship.id)) update(); });
                buy.disabled = !can; buy.style.opacity = can ? '1' : '0.55'; buy.style.width = '100%'; card.appendChild(buy); grid.appendChild(card);
            }
            content.appendChild(grid);
        };
        update();
        dialog.appendChild(this.makeButton('Закрыть', '#475569', () => { onClose(); this.closeModal(); }));
        this.modalContainer.appendChild(dialog);
        document.body.appendChild(this.modalContainer);
        this.modalRefreshTimer = window.setInterval(update, 250);
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
        button.textContent = text; button.style.cssText = `min-width:44px;min-height:44px;padding:7px 12px;border:1px solid rgba(255,255,255,.18);border-radius:5px;background:${color};color:white;font:12px monospace;cursor:pointer;touch-action:manipulation`;
        bindButtonAction(button, () => callback()); return button;
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
        if (this.modalRefreshTimer !== null) {
            window.clearInterval(this.modalRefreshTimer);
            this.modalRefreshTimer = null;
        }
        if (this.modalContainer) {
            this.modalContainer.remove();
            this.modalContainer = null;
        }
    }
}

import { COMBAT_BALANCE, clampShipProgressionLevel, getShipAccelerationMultiplier, getShipMassMultiplier, getShipProgressionScale, getShipSensorMultiplier, getShipSignatureMultiplier, getShipSpeedMultiplier, getShipTurnRateMultiplier, HULLS, MODULES, SHIP_PROGRESSION_BALANCE, TACTICAL_BALANCE, WEAPONS, type DamageType, type FleetOrder, type ShipLoadout, type ShipState } from './ShipDefinitions';

export interface ShipSnapshot {
    id: string;
    loadout: ShipLoadout;
    hull: number;
    armor: number;
    shield: number;
    energy: number;
    order: FleetOrder;
    statScale?: number;
    /** Progression levels. Old saves default to the starter 1/1 hull. */
    sizeLevel?: number;
    techLevel?: number;
    state?: ShipState;
    /** Legacy v3 field, used only by save migration. */
    flux?: number;
    targetShipId?: string | null;
    variantName?: string;
    purchasePrice?: number;
    ammunition?: number;
    /** Legacy v3 field, used only by save migration. */
    fuel?: number;
    crew?: number;
    damagedSystems?: ('engines' | 'weapons' | 'sensors' | 'command')[];
    disabledDamage?: number;
    shieldRechargeDelay?: number;
}

let nextShipId = 1;

export class Ship {
    public readonly id: string;
    public readonly loadout: ShipLoadout;
    public hull: number;
    public armor: number;
    public shield: number;
    public energy: number;
    public order: FleetOrder = { type: 'escort', issuedAt: 0 };
    public shieldFlash = 0;
    public hitFlash = 0;
    public shieldRechargeDelay = 0;
    public statScale = 1;
    /** Hull scale in command points. Size 1 is a light hull. */
    public sizeLevel = 1;
    /** Technology generation. Tech 1 is the baseline shipyard tier. */
    public techLevel = 1;
    public state: ShipState = 'active';
    public targetShipId: string | null = null;
    public variantName: string | null = null;
    public purchasePrice = 0;
    public targetLockTimer = 0;
    public disabledDamage = 0;
    public damagedSystems: ('engines' | 'weapons' | 'sensors' | 'command')[] = [];
    public ammunition: number;
    public crew: number;
    public overchargeTimer = 0;
    public emergencyRepairRemaining = 0;
    public emergencyRepairTimer = 0;

    constructor(loadout: ShipLoadout, id = `ship-${nextShipId++}`) {
        this.id = id;
        this.loadout = loadout;
        const hull = this.definition;
        this.hull = hull.hull;
        this.armor = hull.armor;
        this.shield = hull.shield;
        this.energy = hull.energyCapacity + this.modules.reduce((sum, module) => sum + (module.energyCapacityModifier || 0), 0);
        this.ammunition = hull.ammunition;
        this.crew = hull.crew;
    }

    get definition() { return HULLS[this.loadout.hullId] || HULLS.command; }
    get displayName() { return this.variantName || this.definition.name; }
    get role() { return this.definition.role; }
    get weapons() { return this.loadout.weaponIds.map(id => WEAPONS[id]).filter(Boolean); }
    get modules() { return this.loadout.moduleIds.map(id => MODULES[id]).filter(Boolean); }
    get alive() { return this.state === 'active'; }
    get maxHull() { return this.definition.hull * this.statScale; }
    get maxArmor() { return this.definition.armor * this.statScale; }
    get maxShield() { return this.definition.shield * this.statScale; }
    get maxEnergy() { return (this.definition.energyCapacity + this.modules.reduce((sum, module) => sum + (module.energyCapacityModifier || 0), 0)) * this.statScale; }
    get energyRecharge() { return (this.definition.energyRecharge + this.modules.reduce((sum, module) => sum + (module.energyRechargeModifier || 0), 0)) * this.statScale; }
    get maxFuelCapacity() { return this.definition.fuelCapacity * this.statScale; }
    get maxAmmunition() { return this.definition.ammunition * this.statScale; }
    get cargoCapacity() { return this.definition.cargo * this.statScale; }
    get maxSpeed() { return SHIP_PROGRESSION_BALANCE.baseFleetSpeed * getShipSpeedMultiplier(this.sizeLevel, this.techLevel); }
    get acceleration() { return getShipAccelerationMultiplier(this.sizeLevel, this.techLevel); }
    get turnRate() { return getShipTurnRateMultiplier(this.sizeLevel, this.techLevel); }
    get sensorRange() { return this.definition.sensorRange * getShipSensorMultiplier(this.sizeLevel, this.techLevel); }
    get scanResolution() { return this.definition.scanResolution * getShipSensorMultiplier(this.sizeLevel, this.techLevel); }
    get signature() { return this.definition.signature * Math.sqrt(Math.max(0.02, this.statScale)) * getShipSignatureMultiplier(this.sizeLevel, this.techLevel); }
    get mass() { return this.definition.mass * getShipMassMultiplier(this.sizeLevel); }
    get integrity() { return this.hull / this.maxHull; }
    get effectiveHealth() { return Math.max(0, this.hull) + Math.max(0, this.armor) + Math.max(0, this.shield); }
    get maxEffectiveHealth() { return this.maxHull + this.maxArmor + this.maxShield; }
    get weaponDps() { return this.weapons.reduce((sum, weapon) => sum + weapon.damage / Math.max(0.1, weapon.cooldown), 0) * this.statScale; }
    /** Most ship output scales from the Size x Tech progression product. */
    get progressionMultiplier() { return getShipProgressionScale(this.sizeLevel, this.techLevel); }
    /** Each size unit consumes one point of fleet command capacity. */
    get commandCost() { return this.sizeLevel; }
    get utilityRating() { return (this.role === 'support' || this.role === 'scout' ? 6 : this.role === 'defender' || this.role === 'flagship' ? 5 : 2) * this.statScale; }
    get maxCombatRating() {
        return this.maxHull * COMBAT_BALANCE.hullThreatWeight + this.weaponDps * COMBAT_BALANCE.offenseThreatWeight + this.utilityRating;
    }
    get combatRating() {
        if (this.state !== 'active') return this.maxCombatRating * COMBAT_BALANCE.disabledThreatFactor;
        return Math.max(0, this.hull) * COMBAT_BALANCE.hullThreatWeight + this.weaponDps * COMBAT_BALANCE.offenseThreatWeight + this.utilityRating;
    }

    update(dt: number, readinessEfficiency = 1, energyRechargeMultiplier = 1, shieldRechargeMultiplier = 1) {
        this.targetLockTimer = Math.max(0, this.targetLockTimer - dt);
        this.shieldRechargeDelay = Math.max(0, this.shieldRechargeDelay - dt);
        this.shieldFlash = Math.max(0, this.shieldFlash - dt * 3);
        this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
        this.overchargeTimer = Math.max(0, this.overchargeTimer - dt);
        if (!this.alive) return 0;

        const availableRecharge = Math.max(0, Math.min(1, energyRechargeMultiplier));
        const energyRestored = Math.min(
            Math.max(0, this.maxEnergy - this.energy),
            this.energyRecharge * readinessEfficiency * dt * availableRecharge
        );
        this.energy = Math.min(this.maxEnergy, this.energy + energyRestored);
        if (this.emergencyRepairRemaining > 0 && this.emergencyRepairTimer > 0) {
            const repair = Math.min(this.emergencyRepairRemaining, this.emergencyRepairRemaining / Math.max(dt, this.emergencyRepairTimer) * dt);
            this.restore(repair);
            this.emergencyRepairRemaining = Math.max(0, this.emergencyRepairRemaining - repair);
            this.emergencyRepairTimer = Math.max(0, this.emergencyRepairTimer - dt);
        }
        if (this.shieldRechargeDelay <= 0 && this.shield < this.maxShield && this.energy > 0) {
            const wanted = Math.min(this.maxShield - this.shield, this.maxShield * TACTICAL_BALANCE.shieldRechargeFraction * Math.max(0, shieldRechargeMultiplier) * dt);
            const affordable = this.energy / TACTICAL_BALANCE.shieldEnergyPerPoint;
            const restored = Math.min(wanted, affordable);
            this.shield += restored;
            this.energy = Math.max(0, this.energy - restored * TACTICAL_BALANCE.shieldEnergyPerPoint);
        }
        return energyRestored;
    }

    applyDamage(amount: number, type: DamageType): number {
        if (this.state === 'destroyed') return 0;
        if (this.state === 'disabled') {
            this.disabledDamage += amount;
            if (this.disabledDamage >= this.maxHull * 0.25) this.state = 'destroyed';
            return 0;
        }
        let remaining = amount;
        if (remaining > 0) this.shieldRechargeDelay = TACTICAL_BALANCE.shieldRechargeDelay;
        if (this.shield > 0) {
            const modifier = type === 'kinetic' ? 1.25 : type === 'explosive' ? 0.75 : 1;
            const absorbed = Math.min(this.shield, remaining * modifier);
            this.shield -= absorbed;
            remaining -= absorbed / modifier;
            this.shieldFlash = 1;
        }
        if (remaining > 0 && this.armor > 0) {
            const modifier = type === 'explosive' ? 1.35 : type === 'kinetic' ? 0.75 : 1;
            const absorbed = Math.min(this.armor, remaining * modifier);
            this.armor -= absorbed;
            remaining -= absorbed / modifier;
        }
        if (remaining > 0) {
            const dealt = Math.min(this.hull, remaining);
            this.hull -= dealt;
            this.hitFlash = 1;
            if (this.hull <= 0) {
                this.hull = 0;
                this.state = 'disabled';
                this.targetShipId = null;
                this.targetLockTimer = 0;
                this.damageRandomSystem();
            } else if (dealt >= this.maxHull * 0.08) {
                this.damageRandomSystem();
            }
            return dealt;
        }
        return 0;
    }

    setStatScale(scale: number) {
        const next = Math.max(0.02, scale);
        const ratio = next / this.statScale;
        this.statScale = next;
        this.hull *= ratio; this.armor *= ratio; this.shield *= ratio; this.energy *= ratio;
        this.ammunition *= ratio; this.crew *= ratio;
    }

    setProgression(sizeLevel: number, techLevel: number) {
        this.sizeLevel = clampShipProgressionLevel(sizeLevel);
        this.techLevel = clampShipProgressionLevel(techLevel);
    }

    restore(amount: number) { this.hull = Math.min(this.maxHull, this.hull + amount); }

    restoreShield(amount: number) {
        const previous = this.shield;
        this.shield = Math.min(this.maxShield, this.shield + Math.max(0, amount));
        return this.shield - previous;
    }

    spendEnergy(amount: number) {
        const cost = Math.max(0, amount);
        if (this.energy + 1e-6 < cost) return false;
        this.energy = Math.max(0, this.energy - cost);
        return true;
    }

    stabilize() {
        if (this.state !== 'disabled') return false;
        this.state = 'active';
        this.hull = Math.max(1, this.maxHull * TACTICAL_BALANCE.disabledStabilizeHullFraction);
        this.disabledDamage = 0;
        return true;
    }

    private damageRandomSystem() {
        const systems: Ship['damagedSystems'][number][] = ['engines', 'weapons', 'sensors', 'command'];
        const system = systems[(this.id.length + this.damagedSystems.length) % systems.length];
        if (!this.damagedSystems.includes(system)) this.damagedSystems.push(system);
    }

    snapshot(): ShipSnapshot {
        return { id: this.id, loadout: this.loadout, hull: this.hull, armor: this.armor, shield: this.shield, energy: this.energy, order: this.order, statScale: this.statScale, sizeLevel: this.sizeLevel, techLevel: this.techLevel, state: this.state, targetShipId: this.targetShipId, variantName: this.variantName || undefined, purchasePrice: this.purchasePrice || undefined, ammunition: this.ammunition, crew: this.crew, damagedSystems: [...this.damagedSystems], disabledDamage: this.disabledDamage, shieldRechargeDelay: this.shieldRechargeDelay };
    }

    static fromSnapshot(data: ShipSnapshot) {
        const ship = new Ship(data.loadout, data.id);
        ship.statScale = data.statScale || 1;
        ship.setProgression(data.sizeLevel ?? 1, data.techLevel ?? 1);
        ship.hull = data.hull;
        ship.armor = data.armor;
        ship.shield = data.shield;
        ship.energy = data.energy;
        ship.order = data.order;
        ship.state = data.state || (data.hull > 0 ? 'active' : 'disabled');
        ship.targetShipId = data.targetShipId || null;
        ship.variantName = data.variantName || null;
        ship.purchasePrice = data.purchasePrice || 0;
        ship.ammunition = data.ammunition ?? ship.definition.ammunition;
        ship.crew = data.crew ?? ship.definition.crew;
        ship.damagedSystems = [...new Set(data.damagedSystems ?? [])];
        ship.disabledDamage = Math.max(0, data.disabledDamage ?? 0);
        ship.shieldRechargeDelay = Math.max(0, data.shieldRechargeDelay ?? 0);
        Ship.syncIdSequence([ship.id]);
        return ship;
    }

    static syncIdSequence(ids: string[]) {
        for (const id of ids) {
            const match = /^ship-(\d+)$/.exec(id);
            if (match) nextShipId = Math.max(nextShipId, Number(match[1]) + 1);
        }
    }
}

export function createStarterShips(): Ship[] {
    const ship = new Ship({ hullId: 'lance', weaponIds: ['pulse', 'missile'], moduleIds: [] });
    ship.setProgression(1, 1);
    ship.variantName = 'Skiff';
    ship.setStatScale(10 / ship.maxCombatRating);
    return [ship];
}

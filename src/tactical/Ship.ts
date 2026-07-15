import { COMBAT_BALANCE, HULLS, MODULES, WEAPONS, type DamageType, type FleetOrder, type ShipLoadout, type ShipState } from './ShipDefinitions';

export interface ShipSnapshot {
    id: string;
    loadout: ShipLoadout;
    hull: number;
    armor: number;
    shield: number;
    energy: number;
    order: FleetOrder;
    statScale?: number;
    state?: ShipState;
    flux?: number;
    targetShipId?: string | null;
    ammunition?: number;
    fuel?: number;
    crew?: number;
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
    public weaponCooldowns: number[];
    public shieldFlash = 0;
    public hitFlash = 0;
    public shieldRechargeDelay = 0;
    public statScale = 1;
    public state: ShipState = 'active';
    public flux = 0;
    public targetShipId: string | null = null;
    public targetLockTimer = 0;
    public disabledDamage = 0;
    public damagedSystems: ('engines' | 'weapons' | 'sensors' | 'command')[] = [];
    public ammunition: number;
    public fuel: number;
    public crew: number;

    constructor(loadout: ShipLoadout, id = `ship-${nextShipId++}`) {
        this.id = id;
        this.loadout = loadout;
        const hull = this.definition;
        this.hull = hull.hull;
        this.armor = hull.armor;
        this.shield = hull.shield;
        this.energy = hull.energy + this.modules.reduce((sum, module) => sum + (module.energyModifier || 0), 0);
        this.weaponCooldowns = loadout.weaponIds.map(() => 0);
        this.ammunition = hull.ammunition;
        this.fuel = hull.fuel;
        this.crew = hull.crew;
    }

    get definition() { return HULLS[this.loadout.hullId] || HULLS.command; }
    get role() { return this.definition.role; }
    get weapons() { return this.loadout.weaponIds.map(id => WEAPONS[id]).filter(Boolean); }
    get modules() { return this.loadout.moduleIds.map(id => MODULES[id]).filter(Boolean); }
    get alive() { return this.state === 'active'; }
    get maxHull() { return this.definition.hull * this.statScale; }
    get maxArmor() { return this.definition.armor * this.statScale; }
    get maxShield() { return this.definition.shield * this.statScale; }
    get maxEnergy() { return (this.definition.energy + this.modules.reduce((sum, module) => sum + (module.energyModifier || 0), 0)) * this.statScale; }
    get maxFlux() { return this.maxEnergy * 1.5; }
    get integrity() { return this.hull / this.maxHull; }
    get effectiveHealth() { return Math.max(0, this.hull) + Math.max(0, this.armor) + Math.max(0, this.shield); }
    get maxEffectiveHealth() { return this.maxHull + this.maxArmor + this.maxShield; }
    get weaponDps() { return this.weapons.reduce((sum, weapon) => sum + weapon.damage / Math.max(0.1, weapon.cooldown), 0) * this.statScale; }
    /** Advanced hulls consume more command capacity as their systems grow. */
    get commandCost() { return Math.max(this.definition.commandCost, Math.ceil(this.definition.commandCost * Math.sqrt(this.statScale))); }
    get utilityRating() { return this.role === 'support' || this.role === 'scout' ? 6 : this.role === 'defender' || this.role === 'flagship' ? 5 : 2; }
    get maxCombatRating() {
        return this.maxHull * COMBAT_BALANCE.hullThreatWeight + this.weaponDps * COMBAT_BALANCE.offenseThreatWeight + this.utilityRating;
    }
    get combatRating() {
        if (this.state !== 'active') return this.maxCombatRating * COMBAT_BALANCE.disabledThreatFactor;
        return Math.max(0, this.hull) * COMBAT_BALANCE.hullThreatWeight + this.weaponDps * COMBAT_BALANCE.offenseThreatWeight + this.utilityRating;
    }

    update(dt: number) {
        this.energy = Math.min(this.maxEnergy, this.energy + dt * 8);
        this.flux = Math.max(0, this.flux - dt * this.maxFlux * 0.08);
        this.targetLockTimer = Math.max(0, this.targetLockTimer - dt);
        this.shieldRechargeDelay = Math.max(0, this.shieldRechargeDelay - dt);
        if (this.shieldRechargeDelay <= 0) {
            this.shield = Math.min(this.maxShield, this.shield + dt * 2.5 * this.statScale);
        }
        this.shieldFlash = Math.max(0, this.shieldFlash - dt * 3);
        this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
        this.weaponCooldowns = this.weaponCooldowns.map(value => Math.max(0, value - dt));
    }

    applyDamage(amount: number, type: DamageType): number {
        if (this.state === 'destroyed') return 0;
        if (this.state === 'disabled') {
            this.disabledDamage += amount;
            if (this.disabledDamage >= this.maxHull * 0.25) this.state = 'destroyed';
            return 0;
        }
        let remaining = amount;
        if (this.shield > 0) {
            this.shieldRechargeDelay = 4;
            const modifier = type === 'energy' ? 1.15 : type === 'kinetic' ? 0.8 : 1;
            const absorbed = Math.min(this.shield, remaining * modifier);
            this.shield -= absorbed;
            remaining -= absorbed / modifier;
            this.shieldFlash = 1;
        }
        if (remaining > 0 && this.armor > 0) {
            const modifier = type === 'kinetic' ? 1.2 : type === 'explosive' ? 0.75 : 0.9;
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
        const next = Math.max(0.35, scale);
        const ratio = next / this.statScale;
        this.statScale = next;
        this.hull *= ratio; this.armor *= ratio; this.shield *= ratio; this.energy *= ratio;
        this.ammunition *= ratio; this.fuel *= ratio; this.crew *= ratio;
    }

    restore(amount: number) { this.hull = Math.min(this.maxHull, this.hull + amount); }

    stabilize() {
        if (this.state !== 'disabled') return false;
        this.state = 'active';
        this.hull = Math.max(1, this.maxHull * 0.08);
        this.disabledDamage = 0;
        return true;
    }

    private damageRandomSystem() {
        const systems: Ship['damagedSystems'][number][] = ['engines', 'weapons', 'sensors', 'command'];
        const system = systems[(this.id.length + this.damagedSystems.length) % systems.length];
        if (!this.damagedSystems.includes(system)) this.damagedSystems.push(system);
    }

    snapshot(): ShipSnapshot {
        return { id: this.id, loadout: this.loadout, hull: this.hull, armor: this.armor, shield: this.shield, energy: this.energy, order: this.order, statScale: this.statScale, state: this.state, flux: this.flux, targetShipId: this.targetShipId, ammunition: this.ammunition, fuel: this.fuel, crew: this.crew };
    }

    static fromSnapshot(data: ShipSnapshot) {
        const ship = new Ship(data.loadout, data.id);
        ship.statScale = data.statScale || 1;
        ship.hull = data.hull;
        ship.armor = data.armor;
        ship.shield = data.shield;
        ship.energy = data.energy;
        ship.order = data.order;
        ship.state = data.state || (data.hull > 0 ? 'active' : 'disabled');
        ship.flux = data.flux || 0;
        ship.targetShipId = data.targetShipId || null;
        ship.ammunition = data.ammunition ?? ship.definition.ammunition;
        ship.fuel = data.fuel ?? ship.definition.fuel;
        ship.crew = data.crew ?? ship.definition.crew;
        return ship;
    }
}

export function createStarterShips(): Ship[] {
    const ships = [
        new Ship({ hullId: 'command', weaponIds: ['pulse', 'autocannon'], moduleIds: ['commandLink'] }),
        new Ship({ hullId: 'bulwark', weaponIds: ['autocannon', 'autocannon'], moduleIds: [] }),
        new Ship({ hullId: 'lance', weaponIds: ['pulse', 'missile'], moduleIds: [] }),
        new Ship({ hullId: 'tender', weaponIds: ['pulse'], moduleIds: ['repairDrones'] })
    ];
    const defender = ships.find(ship => ship.role === 'defender');
    const support = ships.find(ship => ship.role === 'support');
    if (defender) defender.order = { type: 'protect', issuedAt: 0 };
    if (support) support.order = { type: 'repair', issuedAt: 0 };
    return ships;
}

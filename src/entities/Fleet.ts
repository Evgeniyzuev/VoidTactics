import { Entity } from './Entity';
import { Camera } from '../renderer/Camera';
import { Vector2 } from '../utils/Vector2';
import { Ship, createStarterShips } from '../tactical/Ship';
import { DEFAULT_FORMATION, TACTICAL_BALANCE, type DamageType, type FleetDoctrine, type FleetOrderType } from '../tactical/ShipDefinitions';
import { FleetGenerator } from '../tactical/FleetGenerator';
import { RepairService } from '../tactical/RepairService';
import { ABILITY_CHARGE_BALANCE, ABILITY_DEFINITIONS, type FleetAbilityId } from '../tactical/AbilityService';

export type Faction = 'civilian' | 'pirate' | 'orc' | 'military' | 'player' | 'raider' | 'trader' | 'mercenary';
export interface FleetResources { fuel: number; maxFuel: number; supplies: number; maxSupplies: number; readiness: number }
export type FleetSkillId = 'leadership' | 'logistics' | 'engineering' | 'sensors' | 'navigation' | 'tactics' | 'size' | 'tech';
export const FLEET_SKILLS: Record<FleetSkillId, { name: string; description: string }> = {
    leadership: { name: 'Leadership', description: '+10 command capacity per level' },
    logistics: { name: 'Logistics', description: '+10 supply capacity and better readiness' },
    engineering: { name: 'Engineering', description: 'Faster field repairs' },
    sensors: { name: 'Sensors', description: 'Longer sensor range and lower fleet signature' },
    navigation: { name: 'Navigation', description: 'Higher strategic speed' },
    tactics: { name: 'Tactics', description: 'More defender intercept charges' },
    size: { name: 'Size', description: 'Unlocks ships one size class larger per level' },
    tech: { name: 'Tech', description: 'Unlocks the next technology tier per level' }
};

/**
 * Converts relative fleet power into a clock-like ring fill.
 *
 * Six o'clock is the player's reference strength. Stronger fleets use a
 * compressed logarithmic-style tail: 2x reaches nine o'clock and 4x reaches
 * ten-thirty instead of immediately saturating the ring.
 */
export function getThreatIndicatorProgress(threat: number, referenceThreat: number): number {
    const ratio = Math.max(0, threat) / Math.max(1, referenceThreat);
    const progress = ratio < 1
        ? ratio * 0.5
        : 1 - 0.5 / Math.max(1, ratio);
    return Math.max(0.03, Math.min(0.98, progress));
}

export class Fleet extends Entity {
    public ships: Ship[] = [];
    public selectedShipId: string | null = null;
    public formation = DEFAULT_FORMATION;
    private tacticalClock = 0;
    private legacyBudget = 10;
    public commandCapacity = 4;
    /** Shared consumables pool. Capacity is derived from the fleet cargo. */
    public supplies = 5;
    private supplyCapacityBonus = 0;
    public fuel = 0;
    public operationalReadiness = 100;
    public skillPoints = 3;
    public skills: Record<FleetSkillId, number> = { leadership: 0, logistics: 0, engineering: 0, sensors: 0, navigation: 0, tactics: 0, size: 0, tech: 0 };
    public stabilizationProgress = 0;
    public doctrine: FleetDoctrine = { targetPriority: 'nearest', preferredRange: 'balanced', aggression: 'balanced' };
    public interceptCharges = 0;
    public target: Vector2 | null = null;
    public followTarget: Entity | null = null; // Entity to follow
    public followDistance: number = 100; // Distance to maintain when following
    public followMode: 'approach' | 'contact' | null = null;
    public manualSteerTarget: Vector2 | null = null; // Manual override for interception

    public maxSpeed: number = 500;
    /** Distance at which a fleet can initiate a tactical interception. */
    public attackRadius: number = 100;
    public isStation = false;
    /** True while the fleet is inside the outer asteroid belt. */
    public inAsteroidBelt = false;
    private stopThreshold: number = 5;

    /** Inertial world-space nucleus position; lags behind the course while moving. */
    private nucleusWorld: Vector2 | null = null;

    private rotation: number = 0;
    public color: string;
    public isPlayer: boolean = false;
    public accumulatedDamage: number = 0;
    /** Actual shield + armor + hull damage from the most recent salvo. */
    public lastTacticalDamage = 0;
    public faction: Faction = 'civilian';
    public state: 'normal' | 'combat' | 'flee' | 'mining' = 'normal';
    public combatTimer: number = 0;
    public activeBattle: any = null; // Reference to ongoing Battle
    public decisionTimer: number = 0;
    public civilianStopTimer: number = 0;
    public lastAcceleration: Vector2 = new Vector2(0, 0);
    public currentTarget: Fleet | null = null; // Current attack target
    public hostileTo: Set<Fleet> = new Set(); // Persistent hostility to other fleets
    /** Temporary legal hostility created only when this fleet witnesses an attack. */
    public witnessHostility: Set<Fleet> = new Set();
    /** One-use permission to answer the aggressor of a battle seen at its start. */
    public witnessedAggressors: Set<Fleet> = new Set();
    public lootDropped: boolean = false;
    public worldEventId: string | null = null;
    public worldEventRole: 'transport' | 'raider' | 'responder' | null = null;

    // Money-based progression
    public totalMoneyEarned: number = 0;
    public level: number = 1;
    public levelThreshold: number = 0;
    public nextLevelThreshold: number = 1000;

    // Abilities State (Player uses charges, others use cooldowns)
    public abilities = {
        afterburner: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.afterburner.duration, cdMax: ABILITY_DEFINITIONS.afterburner.cooldown, charges: 0 },
        cloak: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.cloak.duration, cdMax: ABILITY_DEFINITIONS.cloak.cooldown, charges: 0 },
        bubble: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.bubble.duration, cdMax: ABILITY_DEFINITIONS.bubble.cooldown, charges: 0 },
        mine: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.mine.duration, cdMax: ABILITY_DEFINITIONS.mine.cooldown, charges: 0 },
        medkit: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.medkit.duration, cdMax: ABILITY_DEFINITIONS.medkit.cooldown, charges: 0 },
        fire: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.fire.duration, cdMax: ABILITY_DEFINITIONS.fire.cooldown, charges: 0 },
        shield: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.shield.duration, cdMax: ABILITY_DEFINITIONS.shield.cooldown, charges: 0 },
        net: { active: false, timer: 0, cooldown: 0, duration: ABILITY_DEFINITIONS.net.duration, cdMax: ABILITY_DEFINITIONS.net.cooldown, charges: 0 }
    };
    public isCloaked: boolean = false;
    public isBubbled: boolean = false; // Set by external bubbles
    public bubbleDistance: number = 0; // Distance to bubble center
    public netSlowTimer = 0;
    public shieldCellRemaining = 0;
    public shieldCellRate = 0;
    public stunTimer: number = 0;
    public money: number = 0; // Only for player
    /** Active scan has an upfront cost and continues draining Energy. */
    private scanPulseTimer = 0;
    /** Assault is a free stance, balanced by speed, Energy and readiness loss. */
    public assaultMode = false;

    public get scanPulseActive() { return this.scanPulseTimer > 0; }

    public startScanPulse(duration = TACTICAL_BALANCE.scanPulseDuration) {
        this.scanPulseTimer = Math.max(this.scanPulseTimer, duration);
    }

    public setAssaultMode(active: boolean) {
        this.assaultMode = Boolean(active);
        return this.assaultMode;
    }

    // Mining properties
    public isMining: boolean = false;
    public miningTarget: any = null; // Reference to asteroid being mined

    constructor(x: number, y: number, color: string = '#55CCFF', isPlayer: boolean = false) {
        super(x, y);
        this.color = color;
        this.isPlayer = isPlayer;
        if (isPlayer) this.faction = 'player';
        this.radius = 8;
        this.ships = isPlayer ? createStarterShips() : [];
        if (!isPlayer) {
            this.skillPoints = 0;
            this.abilities.afterburner.charges = 1;
            this.abilities.mine.charges = 1;
            this.abilities.bubble.charges = 1;
            this.abilities.cloak.charges = 1;
        }
        this.selectedShipId = this.ships[0]?.id || null;
        this.fuel = this.maxFuel;
        this.supplies = this.maxSupplies;
        if (isPlayer) this.refreshFleetState();
    }

    public get baseThreatRating() { return this.ships.reduce((sum, ship) => sum + ship.combatRating, 0); }
    /** Threat at full hull and full readiness; used for combat XP rewards. */
    public get maximumThreatRating() { return this.ships.reduce((sum, ship) => sum + ship.maxCombatRating, 0); }
    public get threatRating() { return this.baseThreatRating * this.readinessEfficiency; }
    public get commandUsed() { return this.ships.filter(ship => ship.state !== 'destroyed').reduce((sum, ship) => sum + ship.commandCost, 0); }
    public get accelerationMultiplier() {
        const active = this.ships.filter(ship => ship.alive);
        return active.length > 0
            ? active.reduce((sum, ship) => sum + ship.acceleration * ship.commandCost, 0)
                / Math.max(1, active.reduce((sum, ship) => sum + ship.commandCost, 0))
            : 1;
    }
    public get turnRateMultiplier() {
        const active = this.ships.filter(ship => ship.alive);
        return active.length > 0
            ? active.reduce((sum, ship) => sum + ship.turnRate * ship.commandCost, 0)
                / Math.max(1, active.reduce((sum, ship) => sum + ship.commandCost, 0))
            : 1;
    }
    /** One shared pool for afterburner, bubble, cloak, mine and all other systems. */
    public get abilityChargeCapacity() {
        return ABILITY_CHARGE_BALANCE.baseCapacity
            + Math.max(0, this.commandUsed - 1) * ABILITY_CHARGE_BALANCE.perCommandUnit;
    }
    public get abilityChargesUsed() {
        return Object.values(this.abilities).reduce((sum, ability) => sum + Math.max(0, Math.floor(ability.charges || 0)), 0);
    }
    public addAbilityCharge(id: FleetAbilityId, amount = 1) {
        const ability = this.abilities[id];
        if (!ability) return 0;
        const requested = Math.max(0, Math.floor(amount));
        const added = Math.min(requested, Math.max(0, this.abilityChargeCapacity - this.abilityChargesUsed));
        ability.charges = Math.max(0, Math.floor(ability.charges || 0)) + added;
        return added;
    }
    public removeAbilityCharge(id: FleetAbilityId, amount = 1) {
        const ability = this.abilities[id];
        if (!ability) return 0;
        const removed = Math.min(Math.max(0, Math.floor(amount)), Math.max(0, Math.floor(ability.charges || 0)));
        ability.charges -= removed;
        return removed;
    }
    /** Drops excess charges from legacy or externally restored per-ability data. */
    public clampAbilityChargesToCapacity() {
        let remaining = this.abilityChargeCapacity;
        for (const ability of Object.values(this.abilities)) {
            const charges = Math.max(0, Math.floor(ability.charges || 0));
            ability.charges = Math.min(charges, remaining);
            remaining -= ability.charges;
        }
        return this.abilityChargesUsed;
    }
    public get readiness() {
        if (!this.ships.some(ship => ship.state !== 'destroyed')) return 0;
        return Math.max(0, Math.min(1, this.operationalReadiness / 100));
    }
    public get readinessEfficiency() {
        if (this.operationalReadiness >= TACTICAL_BALANCE.lowReadinessThreshold) return 1;
        const normalized = Math.max(0, this.operationalReadiness) / TACTICAL_BALANCE.lowReadinessThreshold;
        return TACTICAL_BALANCE.minimumReadinessEfficiency + (1 - TACTICAL_BALANCE.minimumReadinessEfficiency) * normalized;
    }
    public get energyEfficiency() {
        const maximum = this.maxEnergy;
        if (maximum <= 0) return 0;
        const ratio = Math.max(0, Math.min(1, this.totalEnergy / maximum));
        return TACTICAL_BALANCE.minimumEnergyEfficiency
            + (1 - TACTICAL_BALANCE.minimumEnergyEfficiency) * ratio;
    }
    private get baseSupplyCapacity() {
        const cargo = this.ships
            .filter(ship => ship.state !== 'destroyed')
            .reduce((sum, ship) => sum + ship.cargoCapacity, 0);
        // Ten units of ship cargo form one shared supply unit. A new fleet
        // always starts with at least five supplies and scales with cargo.
        return Math.max(5, Math.ceil(cargo / 10) + this.skills.logistics * 10);
    }
    /** One shared supplies pool, growing with every surviving ship's cargo. */
    public get maxSupplies() {
        return this.baseSupplyCapacity + this.supplyCapacityBonus;
    }
    /** Legacy saves may assign a capacity; preserve the excess as a bonus. */
    public set maxSupplies(value: number) {
        this.supplyCapacityBonus = Math.max(0, Math.floor(value) - this.baseSupplyCapacity);
    }
    public get maxFuel() {
        return this.ships.filter(ship => ship.state !== 'destroyed').reduce((sum, ship) => sum + ship.maxFuelCapacity, 0);
    }
    public get totalEnergy() { return this.ships.filter(ship => ship.alive).reduce((sum, ship) => sum + ship.energy, 0); }
    public get maxEnergy() { return this.ships.filter(ship => ship.alive).reduce((sum, ship) => sum + ship.maxEnergy, 0); }
    public get maxShield() { return this.ships.filter(ship => ship.alive).reduce((sum, ship) => sum + ship.maxShield, 0); }
    public get fuelBurnPerDistance() {
        return TACTICAL_BALANCE.fuelPerDistance * this.ships.filter(ship => ship.alive)
            .reduce((sum, ship) => sum + Math.sqrt(Math.max(0.02, ship.statScale)), 0);
    }
    public get estimatedFuelRange() {
        const burn = this.fuelBurnPerDistance;
        return burn > 0 ? this.fuel / burn : 0;
    }
    public get signature() {
        let signature = this.ships.filter(ship => ship.alive)
            .reduce((sum, ship) => sum + ship.signature, 0);
        signature *= Math.max(0.6, 1 - this.skills.sensors * 0.08);
        if (this.isCloaked) signature *= 0.25;
        if (this.abilities.afterburner.active) signature *= TACTICAL_BALANCE.afterburnerSignatureMultiplier;
        if (this.scanPulseActive) signature *= TACTICAL_BALANCE.scanPulseSignatureMultiplier;
        if (this.assaultMode) signature *= TACTICAL_BALANCE.assaultSignatureMultiplier;
        if (this.fuel <= 0) signature *= TACTICAL_BALANCE.emptyFuelSignatureMultiplier;
        return Math.max(0.01, signature);
    }
    public getSkillLevel(skill: FleetSkillId) { return this.skills[skill] || 0; }
    public canLearnSkill(skill: FleetSkillId) { return this.skillPoints > 0 && !!FLEET_SKILLS[skill] && this.skills[skill] < this.level; }
    public learnSkill(skill: FleetSkillId) {
        if (!this.canLearnSkill(skill)) return false;
        this.skillPoints--;
        this.skills[skill]++;
        if (skill === 'leadership') this.commandCapacity += 10;
        if (skill === 'logistics') { this.supplies += 10; }
        return true;
    }
    /** Compatibility adapter while old economy and AI callers are migrated. */
    public get strength() { return this.ships.length ? this.threatRating : this.legacyBudget; }
    public set strength(value: number) { if (!this.ships.length) this.legacyBudget = Math.max(1, value); }
    public get maxStrength() { return this.ships.length ? this.threatRating : this.legacyBudget; }
    public set maxStrength(value: number) { if (!this.ships.length) this.legacyBudget = Math.max(1, value); }

    public ensureComposition() {
        if (this.ships.length > 0) return;
        this.ships = FleetGenerator.generate(this.legacyBudget, this.faction);
        this.selectedShipId = this.ships[0]?.id || null;
        this.fuel = this.maxFuel;
        this.supplies = this.maxSupplies;
        if (!this.isPlayer) {
            this.abilities.afterburner.charges = 1;
           this.abilities.mine.charges = 1;
            this.abilities.net.charges = Math.floor(Math.random() * 4);
           if (this.faction === 'military' || this.faction === 'mercenary') this.abilities.bubble.charges = 1;
            if (this.faction === 'raider') this.abilities.cloak.charges = 1;
        }
        this.clampAbilityChargesToCapacity();
    }

    public consumeFleetEnergyFraction(fraction: number) {
        const active = this.ships.filter(ship => ship.alive);
        const safeFraction = Math.max(0, fraction);
        if (!active.length || active.some(ship => ship.energy + 1e-6 < ship.maxEnergy * safeFraction)) return false;
        for (const ship of active) ship.spendEnergy(ship.maxEnergy * safeFraction);
        return true;
    }

    /** Consume a concrete pooled Energy amount, distributing it by current reserve. */
    public consumePooledEnergy(amount: number) {
        const active = this.ships.filter(ship => ship.alive);
        const requested = Math.max(0, amount);
        const available = active.reduce((sum, ship) => sum + ship.energy, 0);
        const consumed = Math.min(requested, available);
        if (consumed <= 0 || available <= 0) return 0;
        for (const ship of active) {
            ship.spendEnergy(consumed * ship.energy / available);
        }
        return consumed;
    }

    /** Spends a fraction of total maximum Energy, shared by current Energy reserves. */
    public consumePooledEnergyFraction(fraction: number) {
        const active = this.ships.filter(ship => ship.alive);
        const safeFraction = Math.max(0, fraction);
        if (!active.length) return false;
        const totalAvailable = active.reduce((sum, ship) => sum + ship.energy, 0);
        const cost = active.reduce((sum, ship) => sum + ship.maxEnergy, 0) * safeFraction;
        if (totalAvailable + 1e-6 < cost) return false;
        if (cost <= 0) return true;
        return this.consumePooledEnergy(cost) + 1e-6 >= cost;
    }

    public clampSuppliesToCapacity() {
        this.supplies = Math.max(0, Math.min(this.maxSupplies, this.supplies));
        return this.supplies;
    }

    public clampFuelToCapacity() {
        this.fuel = Math.max(0, Math.min(this.maxFuel, this.fuel));
        return this.fuel;
    }

    public addFuel(amount: number) {
        const previous = this.fuel;
        this.fuel = Math.min(this.maxFuel, Math.max(0, this.fuel + amount));
        return this.fuel - previous;
    }

    public setReadiness(value: number) {
        this.operationalReadiness = Math.max(0, Math.min(100, value));
    }

    public issueOrder(type: FleetOrderType, shipId?: string) {
        let targets = shipId ? this.ships.filter(ship => ship.id === shipId) : this.ships.filter(ship => ship.role !== 'flagship');
        if (type === 'repair') targets = this.ships.filter(ship => ship.role === 'support');
        if (type === 'protect') targets = this.ships.filter(ship => ship.role === 'defender');
        for (const ship of targets) ship.order = { type, issuedAt: this.tacticalClock };
    }

    public receiveTacticalDamage(amount: number, type: DamageType = 'energy', targetShipId?: string): number {
        this.ensureComposition();
        const alive = this.ships.filter(ship => ship.alive);
        this.lastTacticalDamage = 0;
        if (!alive.length) return 0;
        let target = alive.find(ship => ship.id === targetShipId) || alive[0];
        const defender = alive.find(ship => ship.role === 'defender' && ship.order.type === 'protect');
        if (defender && defender !== target && this.interceptCharges >= 1) {
            target = defender;
            this.interceptCharges -= 1;
        }
        const before = target.shield + target.armor + target.hull;
        const hullDamage = target.applyDamage(amount, type);
        const after = target.shield + target.armor + target.hull;
        this.lastTacticalDamage = Math.max(0, before - after);
        return hullDamage;
    }

    public get flagship() { return this.ships.find(ship => ship.role === 'flagship' && ship.alive) || this.ships.find(ship => ship.alive); }

    private refreshFleetState(dt = 0) {
        if (!this.isStation) {
            const active = this.ships.filter(ship => ship.alive);
            if (active.length > 0) {
                const command = Math.max(1, active.reduce((sum, ship) => sum + ship.commandCost, 0));
                this.maxSpeed = active.reduce((sum, ship) => sum + ship.maxSpeed * ship.commandCost, 0) / command;
            } else {
                this.maxSpeed = 0;
            }
        }
        const defenders = this.ships.filter(ship => ship.alive && ship.role === 'defender' && ship.order.type === 'protect').length;
        const cap = defenders * (3 + this.skills.tactics);
        this.interceptCharges = Math.min(cap, this.interceptCharges + defenders * (0.75 + this.skills.tactics * 0.15) * dt);
    }

    setTarget(pos: Vector2) {
        this.target = pos;
        this.followTarget = null; // Clear follow mode when setting direct target
        this.followMode = null;
    }

    setFollowTarget(entity: Entity, mode: 'approach' | 'contact' = 'approach') {
        this.followTarget = entity;
        this.followMode = mode;
        this.target = null; // Will be set in update
    }

    stopFollowing() {
        this.followTarget = null;
        this.followMode = null;
        this.target = null;
    }

    private updateShieldCell(dt: number) {
        if (this.shieldCellRemaining <= 0 || this.shieldCellRate <= 0) return;
        const wanted = Math.min(this.shieldCellRemaining, this.shieldCellRate * Math.max(0, dt));
        let remaining = wanted;
       const targets = this.ships
           .filter(ship => ship.alive && ship.shield < ship.maxShield)
           .sort((a, b) => a.shield / Math.max(1, a.maxShield) - b.shield / Math.max(1, b.maxShield));
        if (targets.length === 0) {
            this.shieldCellRemaining = 0;
            this.shieldCellRate = 0;
            return;
        }
       for (const ship of targets) {
            if (remaining <= 0) break;
            const restored = ship.restoreShield(remaining);
            remaining -= restored;
        }
        this.shieldCellRemaining = Math.max(0, this.shieldCellRemaining - (wanted - remaining));
        if (this.shieldCellRemaining <= 1e-6) {
            this.shieldCellRemaining = 0;
            this.shieldCellRate = 0;
        }
    }

    update(dt: number) {
        this.tacticalClock += dt; this.ensureComposition();
        this.clampAbilityChargesToCapacity();
        this.clampSuppliesToCapacity();
        this.clampFuelToCapacity();
        this.netSlowTimer = Math.max(0, this.netSlowTimer - Math.max(0, dt));
        this.scanPulseTimer = Math.max(0, this.scanPulseTimer - Math.max(0, dt));
        const activeShips = this.ships.filter(ship => ship.alive);
        const stanceRechargeMultiplier = this.assaultMode ? TACTICAL_BALANCE.assaultEnergyRechargeMultiplier : 1;
        const potentialEnergy = activeShips.reduce((sum, ship) => sum + Math.min(
            Math.max(0, ship.maxEnergy - ship.energy),
            ship.energyRecharge * this.readinessEfficiency * Math.max(0, dt)
        ), 0) * stanceRechargeMultiplier;
        const energyFuel = potentialEnergy * TACTICAL_BALANCE.energyFuelPerPoint;
        const energyRechargeMultiplier = energyFuel > 0 ? Math.min(1, this.fuel / energyFuel) : 0;
        let energyRestored = 0;
        for (const ship of this.ships) {
            energyRestored += ship.update(dt, this.readinessEfficiency, energyRechargeMultiplier * stanceRechargeMultiplier, stanceRechargeMultiplier);
        }
        this.fuel = Math.max(0, this.fuel - energyRestored * TACTICAL_BALANCE.energyFuelPerPoint);
        if (this.scanPulseActive) {
            const scanDrain = this.maxEnergy * TACTICAL_BALANCE.scanPulseEnergyPerSecond * Math.max(0, dt);
            if (this.consumePooledEnergy(scanDrain) + 1e-6 < scanDrain) this.scanPulseTimer = 0;
        }
        this.updateShieldCell(dt);
        if (this.velocity.mag() > 5) {
            const afterburnerMultiplier = this.abilities.afterburner.active ? TACTICAL_BALANCE.afterburnerFuelMultiplier : 1;
            const fuelUse = this.velocity.mag() * dt * this.fuelBurnPerDistance * afterburnerMultiplier;
            this.fuel = Math.max(0, this.fuel - fuelUse);
        }
        const inCombat = this.state === 'combat' || this.currentTarget !== null;
        if (inCombat) this.setReadiness(this.operationalReadiness - TACTICAL_BALANCE.combatReadinessPerSecond * dt);
        if (this.abilities.afterburner.active) {
            this.setReadiness(this.operationalReadiness - TACTICAL_BALANCE.afterburnerReadinessPerSecond * dt);
        }
        if (this.assaultMode) {
            this.setReadiness(this.operationalReadiness - TACTICAL_BALANCE.assaultReadinessPerSecond * dt);
        }
        if (!this.assaultMode && !this.abilities.afterburner.active && !inCombat && this.operationalReadiness < 100 && this.supplies > 0) {
            const recovery = Math.min(TACTICAL_BALANCE.readinessRecoveryPerSecond * dt, 100 - this.operationalReadiness, this.supplies * TACTICAL_BALANCE.readinessPerSupply);
            this.setReadiness(this.operationalReadiness + recovery);
            this.supplies = Math.max(0, this.supplies - recovery / TACTICAL_BALANCE.readinessPerSupply);
        }
        RepairService.update(this, dt, inCombat);
        this.refreshFleetState(dt);
        // Sanitize position and velocity to prevent NaN errors
        if (!isFinite(this.position.x) || !isFinite(this.position.y)) this.position = new Vector2(0, 0);
        if (!isFinite(this.velocity.x) || !isFinite(this.velocity.y)) this.velocity = new Vector2(0, 0);

        if (this.decisionTimer > 0) this.decisionTimer -= dt;
        if (this.civilianStopTimer > 0) this.civilianStopTimer -= dt;

        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            this.velocity = this.velocity.scale(Math.pow(0.5, Math.max(0, dt) * 8)); // Smoothly bleed velocity
            if (this.velocity.mag() < 1) this.velocity = new Vector2(0, 0);
            this.position = this.position.add(this.velocity.scale(dt));
            return;
        }

        // Civilian stop at planets
        if (this.faction === 'civilian' && this.civilianStopTimer > 0) {
            this.velocity = new Vector2(0, 0);
            this.position = this.position.add(this.velocity.scale(dt));
            return;
        }

        // Tick abilities
        for (const key in this.abilities) {
            const a = (this.abilities as any)[key];
            if (a.cooldown > 0) a.cooldown -= dt;
            if (a.active) {
                a.timer -= dt;
                if (a.timer <= 0) {
                    a.active = false;
                    if (key === 'cloak') this.isCloaked = false;
                    const definition = ABILITY_DEFINITIONS[key as keyof typeof ABILITY_DEFINITIONS];
                    if (definition.readinessCost > 0) {
                        this.setReadiness(this.operationalReadiness - definition.readinessCost);
                    }
                }
            }
        }

        if (this.state === 'combat') {
            // Safety fallback: if battle is missing or finished, reset state
            if (!this.activeBattle) {
                this.state = 'normal';
                return;
            }
            this.combatTimer -= dt;
            // NPCs keep their tactical engagement orbit, while the player may
            // still steer the flagship/flotilla in real time during combat.
            // The normal movement code below applies the combat speed cap and
            // still honours direct targets and manual steering.
            if (!this.isPlayer) {
                this.velocity = this.velocity.scale(Math.pow(0.9, Math.max(0, dt) * 60));
                this.position = this.position.add(this.velocity.scale(dt));
                return;
            }
        }

        let currentMaxSpeed = this.maxSpeed * (this.isPlayer ? 1 + this.skills.navigation * 0.04 : 1);

        // Dense debris makes navigation slower inside the outer belt.
        if (this.inAsteroidBelt) currentMaxSpeed *= 0.5;

        // Ability modifiers
        if (this.abilities.afterburner.active) {
            currentMaxSpeed *= TACTICAL_BALANCE.afterburnerSpeedMultiplier;
        }
        if (this.scanPulseActive) currentMaxSpeed *= TACTICAL_BALANCE.scanPulseSpeedMultiplier;
        if (this.assaultMode) currentMaxSpeed *= TACTICAL_BALANCE.assaultSpeedMultiplier;
        if (this.fuel <= 0) currentMaxSpeed *= TACTICAL_BALANCE.emergencySpeedMultiplier;
        currentMaxSpeed *= this.readinessEfficiency;
        currentMaxSpeed *= this.energyEfficiency;
        if (this.netSlowTimer > 0) currentMaxSpeed *= TACTICAL_BALANCE.netSpeedMultiplier;
        if (this.abilities.bubble.active) {
            currentMaxSpeed *= 0.5;
        }

        // External bubble effect
        if (this.isBubbled) {
            currentMaxSpeed *= 0.1;
            // Instantly slow down velocity if it's faster than new max speed
            const maxVel = currentMaxSpeed;
            if (this.velocity.mag() > maxVel) {
                this.velocity = this.velocity.normalize().scale(maxVel);
            }
        }

        // Trader speed penalty (Heavy Cargo)
        if (this.faction === 'trader') {
            currentMaxSpeed *= 0.3;
        }

        // Combat speed limit: if under attack, speed cannot exceed 90% of base max
        if (this.currentTarget) {
            const baseMaxSpeed = this.maxSpeed;
            const combatSpeedCap = baseMaxSpeed * 0.9;
            currentMaxSpeed = Math.min(currentMaxSpeed, combatSpeedCap);
            // Instantly slow down velocity if it's faster than combat speed cap
            if (this.velocity.mag() > combatSpeedCap) {
                this.velocity = this.velocity.normalize().scale(combatSpeedCap);
            }
        }
        this.isBubbled = false; // Reset for next frame

        // Stationary fleets still use the normal Fleet update path. Avoid
        // intercept calculations such as distance / maxSpeed when their
        // configured speed is zero, and keep them fully immobile.
        if (currentMaxSpeed <= 0) {
            this.velocity = new Vector2(0, 0);
            this.target = null;
            this.lastAcceleration = new Vector2(0, 0);
            return;
        }

        // If following another entity, update target to an intercept point
        if (this.followTarget) {
            const targetPos = this.followTarget.position;
            const targetVel = this.followTarget.velocity;
            const targetAcc = (this.followTarget instanceof Fleet) ? this.followTarget.lastAcceleration : new Vector2(0, 0);
            const myPos = this.position;
            const maxSpeed = currentMaxSpeed;

            // Iterative Intercept (Accounts for Acceleration)
            // We do a few passes to find a stable time 't'
            let t = 0;
            const iterations = 5;
            for (let i = 0; i < iterations; i++) {
                // Future position: P + V*t + 0.5*A*t^2
                // We clamp the acceleration time lookahead to 2s to avoid extreme overshooting
                const tAcc = Math.min(t, 2);
                const futurePos = targetPos
                    .add(targetVel.scale(t))
                    .add(targetAcc.scale(0.5 * tAcc * tAcc));

                const dist = futurePos.sub(myPos).mag();
                t = dist / maxSpeed;

                // Clamp lookahead to 10s to avoid crazy predictions
                if (t > 10) {
                    t = 10;
                    break;
                }
            }

            // Calculate final intercept point
            const tAccFinal = Math.min(t, 2);
            let interceptPoint = targetPos
                .add(targetVel.scale(t))
                .add(targetAcc.scale(0.5 * tAccFinal * tAccFinal));

            // Hybrid Pursuit/Intercept:
            // At long distances, steer more towards the actual current position 
            // to avoid flying "too parallel" and actually close the distance faster.
            const directDist = targetPos.sub(myPos).mag();
            const interceptWeight = Math.max(0, Math.min(1, 1 - (directDist - 500) / 2000));
            // 1.0 (full intercept) at 500 units, 0.0 (full pursuit) at 2500 units.

            const finalAimedPoint = targetPos.scale(1 - interceptWeight).add(interceptPoint.scale(interceptWeight));

            // Calculate effective follow distance
            const effectiveFollowDist = this.followDistance + this.followTarget.radius;

            if (this.manualSteerTarget) {
                // Manual nudge: prioritize player input over calculated intercept
                this.target = this.manualSteerTarget;
            } else if (this.followMode === 'approach') {
                const toTarget = finalAimedPoint.sub(myPos);
                const dist = toTarget.mag();
                if (dist > effectiveFollowDist) {
                    const dir = toTarget.normalize();
                    this.target = finalAimedPoint.sub(dir.scale(effectiveFollowDist));
                } else {
                    this.target = null;
                }
            } else {
                // Contact mode: Directly to aimed point
                this.target = finalAimedPoint;
            }
        }

        if (this.target) {
            const toTarget = this.target.sub(this.position);
            const dist = toTarget.mag();

            if (dist < this.stopThreshold) {
                this.target = null;
                this.velocity = new Vector2(0, 0); // Snap stop
            } else {
                const dir = toTarget.normalize();

                const desired = dir.scale(currentMaxSpeed);
                // Arrive logic (skip if manually steering for "thrust" feeling)
                const slowRadius = 200;
                if (dist < slowRadius && !this.manualSteerTarget) {
                    desired.x *= (dist / slowRadius);
                    desired.y *= (dist / slowRadius);
                }

                const steering = desired.sub(this.velocity);

                // Lower steering response makes acceleration, braking and
                // direction changes take roughly twice as long as before.
                let responsiveness = TACTICAL_BALANCE.fleetSteeringResponse * this.accelerationMultiplier;
                if (this.abilities.afterburner.active) responsiveness *= 1.25;
                // Critically damped steering: frame-rate independent and
                // visually smooth when a fleet changes course or speed.
                if (desired.mag() < this.velocity.mag()) responsiveness *= 1.45;
                const response = 1 - Math.exp(-responsiveness * Math.max(0, dt));
                let steerForce = steering.scale(response);
                if (!isFinite(steerForce.x) || !isFinite(steerForce.y)) steerForce = new Vector2(0, 0);
                this.velocity = this.velocity.add(steerForce);
                this.lastAcceleration = dt > 0 ? steerForce.scale(1 / dt) : new Vector2(0, 0);
            }
        } else {
            // Friction/Drag when no target
            this.velocity = this.velocity.scale(Math.pow(0.95, Math.max(0, dt) * 60));
            if (this.velocity.mag() < 0.5) this.velocity = new Vector2(0, 0);
            this.lastAcceleration = new Vector2(0, 0);
        }

        // Apply Velocity
        this.position = this.position.add(this.velocity.scale(dt));

        // The nucleus is a mass with inertia: it trails the course and only
        // drifts back to centre while the fleet rests, which gives turns and
        // burns a soft organic lag instead of the whole icon snapping around.
        if (!this.nucleusWorld) this.nucleusWorld = this.position.clone();
        this.nucleusWorld = this.nucleusWorld.add(this.velocity.scale(dt));
        const nucleusToBody = this.position.sub(this.nucleusWorld);
        const drag = Math.pow(0.12, dt);
        if (nucleusToBody.mag() < 2.5) {
            this.nucleusWorld = this.position.clone();
        } else {
            this.nucleusWorld = this.position.sub(nucleusToBody.scale(drag));
        }

        // Final sanitization to prevent NaN errors
        if (!isFinite(this.position.x) || !isFinite(this.position.y)) this.position = new Vector2(0, 0);
        if (!isFinite(this.velocity.x) || !isFinite(this.velocity.y)) this.velocity = new Vector2(0, 0);

        // Update Rotation (Smooth turn towards velocity)
        if (this.velocity.mag() > 1) {
            const desiredAngle = Math.atan2(this.velocity.y, this.velocity.x);
            const delta = Math.atan2(Math.sin(desiredAngle - this.rotation), Math.cos(desiredAngle - this.rotation));
            const turnResponse = 1 - Math.exp(-9 * this.turnRateMultiplier * Math.max(0, dt));
            this.rotation += delta * turnResponse;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const screenPos = camera.worldToScreen(this.position);

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        if (this.isCloaked) {
            ctx.globalAlpha = 0.1;
        }

        // Keep one strategic icon at every zoom level. The camera may scale
        // the icon, but its silhouette never switches to a detailed ship
        // organism when the player zooms in.
        this.drawFleetIcon(ctx, camera, 'strategic');

        ctx.restore();
    }

    /**
     * Use the compact strategic directional glyph at every zoom level. The
     * camera still scales world-space size naturally, but the icon's visual
     * language never changes.
     */
    private drawFleetIcon(
        ctx: CanvasRenderingContext2D,
        camera: Camera,
        tier: 'tactical' | 'strategic'
    ) {
        const commandMass = Math.max(1, this.commandUsed);
        const size = tier === 'strategic'
            ? Math.max(4.5, Math.min(10.5, 4.5 + Math.sqrt(commandMass) * 1.3))
            : Math.max(8, Math.min(17, 8 + Math.sqrt(commandMass) * 1.8));
        const heading = this.velocity.mag() > 1
            ? Math.atan2(this.velocity.y, this.velocity.x) + Math.PI / 2
            : this.rotation + Math.PI / 2;
        const color = this.getFleetIconColor();

        ctx.save();
        ctx.rotate(heading);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = tier === 'strategic' ? 0.18 : 0.28;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = tier === 'strategic' ? 7 : 12;
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // A compact pointed hull reads at both zoom levels and communicates
        // direction without requiring a sprite sheet.
        ctx.fillStyle = '#06131e';
        ctx.strokeStyle = color;
        ctx.lineWidth = tier === 'strategic' ? 1 : 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -size * 1.25);
        ctx.lineTo(size * 0.9, size * 0.55);
        ctx.lineTo(0, size * 0.25);
        ctx.lineTo(-size * 0.9, size * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (tier === 'tactical') {
            ctx.globalAlpha = 0.72;
            ctx.strokeStyle = '#e7fbff';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(-size * 0.45, -size * 0.12);
            ctx.lineTo(size * 0.45, -size * 0.12);
            ctx.moveTo(-size * 0.35, size * 0.3);
            ctx.lineTo(size * 0.35, size * 0.3);
            ctx.stroke();
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(0, -size * 0.35, tier === 'strategic' ? 1.1 : 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        if (this.isPlayer) {
            ctx.save();
            ctx.strokeStyle = '#a9f5ff';
            ctx.globalAlpha = 0.82;
            ctx.lineWidth = tier === 'strategic' ? 1 : 1.3;
            ctx.setLineDash(tier === 'strategic' ? [2, 3] : [4, 3]);
            ctx.beginPath(); ctx.arc(0, 0, size * 1.65, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        } else if (tier === 'strategic' && commandMass > 2) {
            ctx.save();
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.82;
            ctx.font = '8px ui-monospace, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${Math.min(99, commandMass)}`, size * 1.8, 3);
            ctx.restore();
        }

        // Keep an important pursuit legible even when the ships collapse to
        // strategic markers.
        if (this.currentTarget && !this.currentTarget.isCloaked && tier === 'tactical') {
            const targetScreen = camera.worldToScreen(this.currentTarget.position);
            const originScreen = camera.worldToScreen(this.position);
            ctx.save();
            ctx.strokeStyle = `${color}66`;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 8]);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(targetScreen.x - originScreen.x, targetScreen.y - originScreen.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    private getFleetIconColor(): string {
        if (this.isPlayer || this.faction === 'player') return '#75ecff';
        switch (this.faction) {
            case 'pirate':
            case 'raider': return '#ff5f68';
            case 'military': return '#ffd66b';
            case 'mercenary': return '#ffad67';
            case 'orc': return '#c59aff';
            case 'trader': return '#e8cc84';
            case 'civilian': return '#d8f5ff';
            default: return this.color;
        }
    }

    public drawThreatIndicator(ctx: CanvasRenderingContext2D, camera: Camera, referenceThreat: number) {
        if (!this.ships.some(ship => ship.state !== 'destroyed')) return;
        const screen = camera.worldToScreen(this.position);
        const color = this.color;
        const progress = getThreatIndicatorProgress(this.threatRating, referenceThreat);
        const radius = 10 * Math.max(0.85, Math.min(1.15, camera.zoom));

        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(4, 10, 18, .82)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = color; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(screen.x, screen.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.restore();
    }

}

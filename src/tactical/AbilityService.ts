import type { Fleet } from '../entities/Fleet';
import type { SensorService } from './SensorService';
import { TACTICAL_BALANCE } from './ShipDefinitions';

export type FleetAbilityId = 'afterburner' | 'cloak' | 'bubble' | 'mine' | 'medkit' | 'fire' | 'shield' | 'net';
export type TacticalAbilityId = FleetAbilityId | 'scan';

export const ABILITY_EQUIPMENT_MARKET = {
    buyPrice: 200,
    sellPrice: 100,
    maxCharges: 10
} as const;

export interface AbilityDefinition {
    id: TacticalAbilityId;
    name: string;
    duration: number;
    cooldown: number;
    energyFraction: number;
    readinessCost: number;
    requiresSelectedShip: boolean;
}

export const ABILITY_DEFINITIONS: Readonly<Record<TacticalAbilityId, AbilityDefinition>> = {
    afterburner: { id: 'afterburner', name: 'Afterburner', duration: 3, cooldown: 10, energyFraction: TACTICAL_BALANCE.afterburnerEnergyFraction, readinessCost: 0, requiresSelectedShip: false },
    cloak: { id: 'cloak', name: 'Cloak', duration: 10, cooldown: 12, energyFraction: 0.2, readinessCost: 0, requiresSelectedShip: false },
    bubble: { id: 'bubble', name: 'Interdiction Bubble', duration: 10, cooldown: 16, energyFraction: 0.15, readinessCost: 0, requiresSelectedShip: false },
    mine: { id: 'mine', name: 'Warp Mine', duration: 0, cooldown: 5, energyFraction: 0.1, readinessCost: 0, requiresSelectedShip: false },
    medkit: { id: 'medkit', name: 'Emergency Repair', duration: 6, cooldown: 10, energyFraction: 0, readinessCost: 0, requiresSelectedShip: true },
    fire: { id: 'fire', name: 'Weapon Overcharge', duration: 5, cooldown: 10, energyFraction: 0, readinessCost: 5, requiresSelectedShip: true },
    shield: { id: 'shield', name: 'Shield Cell', duration: TACTICAL_BALANCE.shieldCellDuration, cooldown: TACTICAL_BALANCE.shieldCellCooldown, energyFraction: 0, readinessCost: 0, requiresSelectedShip: false },
    net: { id: 'net', name: 'Stasis Net', duration: TACTICAL_BALANCE.netDuration, cooldown: TACTICAL_BALANCE.netCooldown, energyFraction: 0, readinessCost: 0, requiresSelectedShip: false },
    scan: { id: 'scan', name: 'Active Scan Pulse', duration: 4, cooldown: 0, energyFraction: TACTICAL_BALANCE.scanPulseEnergyFraction, readinessCost: 0, requiresSelectedShip: false }
};

export interface AbilityActivationResult {
    ok: boolean;
    reason?: string;
    targetShipId?: string;
    chargeConsumed?: boolean;
}

export class AbilityService {
    static activate(fleet: Fleet, id: FleetAbilityId): AbilityActivationResult {
        const ability = fleet.abilities[id];
        if (!ability) return { ok: false, reason: 'Unknown system.' };
        if (ability.active || ability.cooldown > 0) return { ok: false, reason: 'System is cooling down.' };
        const unlimitedStationNet = id === 'net' && fleet.isStation;
        if (!unlimitedStationNet && ability.charges <= 0) return { ok: false, reason: 'No charges.' };
        if (id === 'cloak' && fleet.currentTarget) {
            return { ok: false, reason: 'Cannot cloak while attacking.' };
        }

        const selected = fleet.ships.find(ship => ship.id === fleet.selectedShipId);
        if (id === 'afterburner') {
            if (fleet.fuel <= 0) return { ok: false, reason: 'No fuel: emergency drive only.' };
            if (fleet.operationalReadiness < TACTICAL_BALANCE.criticalReadinessThreshold) {
                return { ok: false, reason: 'Readiness is too low.' };
            }
        }

        if (id === 'medkit') {
            if (!selected || selected.state === 'destroyed') return { ok: false, reason: 'Select a recoverable ship.' };
            if (selected.state === 'active' && selected.hull >= selected.maxHull) return { ok: false, reason: 'Hull is already full.' };
            if (selected.state === 'disabled') selected.stabilize();
            const targetHull = Math.min(selected.maxHull, selected.hull + selected.maxHull * TACTICAL_BALANCE.emergencyRepairHullFraction);
            selected.emergencyRepairRemaining = Math.max(0, targetHull - selected.hull);
            selected.emergencyRepairTimer = 6;
        } else if (id === 'shield') {
            const missingShield = fleet.ships
                .filter(ship => ship.alive)
                .reduce((sum, ship) => sum + Math.max(0, ship.maxShield - ship.shield), 0);
            if (missingShield <= 0) return { ok: false, reason: 'Fleet shield is already full.' };
            fleet.shieldCellRemaining = Math.min(fleet.maxShield * TACTICAL_BALANCE.shieldCellFraction, missingShield);
            fleet.shieldCellRate = fleet.shieldCellRemaining / Math.max(0.1, TACTICAL_BALANCE.shieldCellDuration);
       } else if (id === 'net') {
            const target = fleet.currentTarget;
            if (!target || target.isCloaked || !target.ships.some(ship => ship.alive)) {
                return { ok: false, reason: 'Stasis Net requires an active attack target.' };
            }
            target.netSlowTimer = TACTICAL_BALANCE.netDuration;
            target.velocity = target.velocity.scale(TACTICAL_BALANCE.netSpeedMultiplier);
        } else if (id === 'fire') {
            if (!selected?.alive) return { ok: false, reason: 'Select an active ship.' };
            if (selected.energy <= 0) return { ok: false, reason: 'Not enough Energy.' };
            selected.overchargeTimer = ability.duration;
        } else {
            const energyFraction = ABILITY_DEFINITIONS[id].energyFraction;
            if (energyFraction > 0 && !fleet.consumeFleetEnergyFraction(energyFraction)) {
                return { ok: false, reason: 'Not enough Energy.' };
            }
        }

        if (!unlimitedStationNet) ability.charges--;
        ability.active = ability.duration > 0;
        ability.timer = ability.duration;
        ability.cooldown = ability.cdMax;
        if (id === 'cloak') fleet.isCloaked = true;
        return { ok: true, targetShipId: selected?.id, chargeConsumed: true };
    }

    static activateScanPulse(fleet: Fleet, sensors: SensorService, now: number): AbilityActivationResult {
        if (!fleet.consumePooledEnergyFraction(ABILITY_DEFINITIONS.scan.energyFraction)) {
            return { ok: false, reason: 'Not enough Energy.' };
        }
        sensors.activateScanPulse(
            fleet,
            now,
            TACTICAL_BALANCE.scanPulseDuration,
            TACTICAL_BALANCE.scanPulseSignatureDuration
        );
        return { ok: true, chargeConsumed: false };
    }
}

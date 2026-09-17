import { describe, expect, it, vi } from 'vitest';
import { AIController } from '../src/core/AIController';
import type { Game } from '../src/core/Game';
import { Fleet } from '../src/entities/Fleet';

function createGame(player: Fleet, npcs: Fleet[]) {
    return {
        getPlayerFleet: () => player,
        getNpcFleets: () => npcs,
        canFleetTarget: vi.fn(() => true),
        getFleetSensorRange: vi.fn(() => 2_000)
    } as unknown as Game;
}

describe('lawful combat witnesses', () => {
    it('marks only a witness of the opening attack as a temporary responder', () => {
        const attacker = new Fleet(0, 0, '#fff');
        attacker.faction = 'civilian';
        const target = new Fleet(20, 0, '#fff');
        target.faction = 'military';
        const witness = new Fleet(40, 0, '#fff');
        witness.faction = 'civilian';
        const lateObserver = new Fleet(60, 0, '#fff');
        lateObserver.faction = 'military';
        const npcs = [attacker, target];
        const controller = new AIController(createGame(witness, npcs));

        expect(controller.isHostile(witness, attacker)).toBe(false);
        controller.recordCombatStart(attacker, target);
        npcs.push(lateObserver);

        expect(controller.isHostile(witness, attacker)).toBe(true);
        expect(witness.witnessedAggressors.has(attacker)).toBe(true);
        expect(controller.isHostile(lateObserver, attacker)).toBe(false);
    });

    it('does not turn a neutral civilian into a combatant because an ally is fighting', () => {
        const civilian = new Fleet(0, 0, '#fff');
        civilian.faction = 'civilian';
        const military = new Fleet(20, 0, '#fff');
        military.faction = 'military';
        const attacker = new Fleet(40, 0, '#fff');
        attacker.faction = 'civilian';
        military.currentTarget = attacker;
        const controller = new AIController(createGame(civilian, [military, attacker]));

        expect(controller.isHostile(civilian, military)).toBe(false);
    });
});

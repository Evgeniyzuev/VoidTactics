import { describe, expect, it, vi } from 'vitest';
import { AIController } from '../src/core/AIController';
import { Game } from '../src/core/Game';
import { Fleet } from '../src/entities/Fleet';
import { SensorService } from '../src/tactical/SensorService';

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

    it('does not create a lawful response when the opening attack targets an enemy faction', () => {
        const attacker = new Fleet(0, 0, '#fff');
        attacker.faction = 'player';
        const pirate = new Fleet(20, 0, '#fff');
        pirate.faction = 'pirate';
        const witness = new Fleet(40, 0, '#fff');
        witness.faction = 'civilian';
        const controller = new AIController(createGame(witness, [attacker, pirate]));

        controller.recordCombatStart(attacker, pirate);

        expect(witness.witnessedAggressors.has(attacker)).toBe(false);
        expect(controller.isHostile(witness, attacker)).toBe(false);
    });

    it('lets the player fire at a hostile fleet in attack radius even if that fleet is already fighting', () => {
        const player = new Fleet(0, 0, '#fff', true);
        const pirate = new Fleet(100, 0, '#f55');
        pirate.faction = 'pirate';
        const civilian = new Fleet(300, 0, '#fff');
        civilian.faction = 'civilian';
        pirate.currentTarget = civilian;

        const game = Object.create(Game.prototype) as Game & Record<string, any>;
        game.playerFleet = player;
        game.npcFleets = [pirate, civilian];
        game.attacks = [];
        game.sensors = new SensorService();
        game.aiController = new AIController(game);

        (game as any).processCombat(0.016);

        expect(game.attacks).toHaveLength(1);
        expect(game.attacks[0].attacker).toBe(player);
        expect(game.attacks[0].target).toBe(pirate);
    });
});

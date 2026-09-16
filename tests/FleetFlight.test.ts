import { describe, expect, it } from 'vitest';
import { Fleet } from '../src/entities/Fleet';
import { Ship } from '../src/tactical/Ship';
import { Vector2 } from '../src/utils/Vector2';
import { FLIGHT_BALANCE } from '../src/tactical/ShipDefinitions';

function createFleet(faction: Fleet['faction'] = 'military', hullId = 'lance'): Fleet {
    const fleet = new Fleet(0, 0, '#fff', faction === 'player');
    const ship = new Ship({ hullId, weaponIds: ['pulse'], moduleIds: [] });
    fleet.ships = [ship];
    fleet.faction = faction;
    fleet.selectedShipId = ship.id;
    fleet.fuel = fleet.maxFuel;
    fleet.supplies = fleet.maxSupplies;
    return fleet;
}

/** Runs the real 60 Hz update loop for the requested number of seconds. */
function run(fleet: Fleet, seconds: number, dt = 1 / 60) {
    const steps = Math.round(seconds / dt);
    for (let index = 0; index < steps; index++) fleet.update(dt);
}

describe('fleet flight integration', () => {
    it('derives its cruise speed from the hull instead of a flat default', () => {
        const striker = createFleet('military', 'lance');
        const artillery = createFleet('military', 'siege');

        striker.update(1 / 60);
        artillery.update(1 / 60);

        expect(striker.maxSpeed).toBe(570);
        expect(artillery.maxSpeed).toBe(340);
        expect(striker.flightProfile?.maxSpeed).toBe(striker.maxSpeed);
        expect(striker.attackRadius).toBeGreaterThan(300);
    });

    it('takes seconds to build up speed on a long warp run', () => {
        const fleet = createFleet();
        fleet.setTarget(new Vector2(8000, 0));

        fleet.update(1);
        const afterOneSecond = fleet.velocity.mag();
        run(fleet, 12);
        const cruise = fleet.velocity.mag();

        expect(afterOneSecond).toBeGreaterThan(0);
        expect(afterOneSecond).toBeLessThan(fleet.maxSpeed * 0.25);
        expect(cruise).toBeGreaterThan(afterOneSecond * 4);
        expect(fleet.flight.mode).toBe('warp');
    });

    it('uses impulse for a short hop and switch back for a long journey', () => {
        const fleet = createFleet();
        fleet.setTarget(new Vector2(600, 0));
        fleet.update(1 / 60);
        expect(fleet.flight.mode).toBe('impulse');

        fleet.setTarget(new Vector2(9000, 0));
        fleet.update(1 / 60);
        expect(fleet.flight.mode).toBe('warp');
    });

    it('flies to a distant waypoint and comes to rest there', () => {
        const fleet = createFleet();
        const waypoint = new Vector2(8000, 0);
        fleet.setTarget(waypoint);

        run(fleet, 150);

        expect(Vector2.distance(fleet.position, waypoint)).toBeLessThan(FLIGHT_BALANCE.stopRadius * 6);
        expect(fleet.velocity.mag()).toBeLessThan(120);
    });

    it('holds a stand-off orbit instead of ramming during combat', () => {
        const hunter = createFleet('pirate', 'lance');
        const prey = createFleet('civilian', 'tender');
        prey.position = new Vector2(2000, 0);

        hunter.state = 'combat';
        hunter.activeBattle = {};
        hunter.currentTarget = prey;

        run(hunter, 20);

        const distance = Vector2.distance(hunter.position, prey.position);
        // It closes in, but keeps a firing distance instead of colliding.
        expect(distance).toBeLessThan(2000);
        expect(distance).toBeGreaterThan(120);
        expect(hunter.lastIntent).not.toBeNull();
    });

    it('comes to a stop when it has no orders left', () => {
        const fleet = createFleet();
        fleet.velocity = new Vector2(400, 0);

        run(fleet, 12);

        expect(fleet.velocity.mag()).toBeLessThan(1);
        expect(fleet.flight.throttle).toBeLessThan(0.05);
    });

    it('halves its performance inside the asteroid belt', () => {
        const open = createFleet();
        const belt = createFleet();
        belt.inAsteroidBelt = true;
        open.setTarget(new Vector2(8000, 0));
        belt.setTarget(new Vector2(8000, 0));

        run(open, 10);
        run(belt, 10);

        expect(belt.speedCap).toBeLessThan(open.speedCap * 0.6);
        expect(belt.velocity.mag()).toBeLessThan(open.velocity.mag() * 0.7);
    });
});
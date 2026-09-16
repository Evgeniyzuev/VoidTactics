import { describe, expect, it } from 'vitest';
import { Vector2 } from '../src/utils/Vector2';
import { Ship } from '../src/tactical/Ship';
import { FLIGHT_BALANCE, HULLS } from '../src/tactical/ShipDefinitions';
import {
    autopilotIntent,
    brakeDistance,
    chooseFlightMode,
    createFlightState,
    deriveEngagementRange,
    deriveFlightProfile,
    engagementIntent,
    previewFlightPath,
    speedCap,
    stepFlight,
    type FlightIntent,
    type FlightMode,
    type FlightProfile,
    type FlightState
} from '../src/tactical/FlightModel';

function makeShip(hullId: string, weaponIds: string[] = ['pulse']): Ship {
    return new Ship({ hullId, weaponIds, moduleIds: [] });
}

function lanceProfile(): FlightProfile {
    const profile = deriveFlightProfile([makeShip('lance')]);
    if (!profile) throw new Error('lance profile expected');
    return profile;
}

/** Mirrors the integration inside `Fleet.update`: intent, mode, then the step. */
function flyTowards(
    profile: FlightProfile,
    performance: number,
    waypoint: Vector2,
    options: { mode?: FlightMode; seconds?: number; dt?: number; startVelocity?: Vector2 } = {}
) {
    const dt = options.dt ?? 0.1;
    const steps = Math.round((options.seconds ?? 10) / dt);
    let state: FlightState = { ...createFlightState(0, options.mode ?? 'warp') };
    let velocity = options.startVelocity ? options.startVelocity.clone() : new Vector2(0, 0);
    let position = new Vector2(0, 0);
    const path: Vector2[] = [];

    for (let index = 0; index < steps; index++) {
        const intent = autopilotIntent(position, velocity, waypoint, profile, performance);
        if (!intent.brake) {
            state.mode = chooseFlightMode(Vector2.distance(position, waypoint), false, state.mode);
        }
        const result = stepFlight({ state, profile, performance, intent, velocity, dt });
        state = result.state;
        velocity = result.velocity;
        position = position.add(velocity.scale(dt));
        path.push(position);
    }

    return { state, velocity, position, path };
}

describe('flight profiles', () => {
    it('derives speed, acceleration and turn limits from the living hulls', () => {
        const lance = lanceProfile();
        expect(lance.maxSpeed).toBe(HULLS.lance.maxSpeed);
        expect(lance.acceleration).toBeCloseTo(HULLS.lance.acceleration * FLIGHT_BALANCE.accelerationScale, 6);
        expect(lance.maxTurnRate).toBeCloseTo(HULLS.lance.turnRate * FLIGHT_BALANCE.turnRateScale, 6);
        expect(lance.mass).toBe(HULLS.lance.mass);
    });

    it('lets the slowest hull govern the formation while acceleration is mass weighted', () => {
        const mixed = deriveFlightProfile([makeShip('lance'), makeShip('siege')]);
        if (!mixed) throw new Error('profile expected');

        expect(mixed.maxSpeed).toBe(HULLS.siege.maxSpeed);
        expect(mixed.maxSpeed).toBeLessThan(lanceProfile().maxSpeed);

        const weighted = (HULLS.lance.acceleration * HULLS.lance.mass + HULLS.siege.acceleration * HULLS.siege.mass)
            / (HULLS.lance.mass + HULLS.siege.mass);
        expect(mixed.acceleration).toBeCloseTo(weighted * FLIGHT_BALANCE.accelerationScale, 6);
        expect(mixed.maxTurnRate).toBeCloseTo(HULLS.siege.turnRate * FLIGHT_BALANCE.turnRateScale, 6);
    });

    it('ignores destroyed hulls and reports nothing for an empty fleet', () => {
        expect(deriveFlightProfile([])).toBeNull();
        const wreck = makeShip('lance');
        wreck.state = 'destroyed';
        expect(deriveFlightProfile([wreck])).toBeNull();
    });

    it('derives the engagement range from the longest weapon', () => {
        const pulseOnly = deriveEngagementRange([makeShip('lance', ['pulse'])]);
        expect(pulseOnly).toBeCloseTo(520 * FLIGHT_BALANCE.engagementRangeFraction, 6);

        const artillery = deriveEngagementRange([makeShip('siege', ['railgun'])]);
        expect(artillery).toBe(FLIGHT_BALANCE.maximumEngagementRange);

        expect(deriveEngagementRange([])).toBe(FLIGHT_BALANCE.engagementRangeDefault);
    });
});

describe('inertial flight step', () => {
    it('builds speed up slowly instead of matching the desired velocity instantly', () => {
        const profile = lanceProfile();
        const state = createFlightState(0, 'warp');
        const intent: FlightIntent = { course: new Vector2(1, 0), throttle: 1, brake: false };

        const result = stepFlight({ state, profile, performance: 1, intent, velocity: new Vector2(0, 0), dt: 0.5 });
        const cap = speedCap(profile, 'warp', 1);

        expect(result.velocity.mag()).toBeGreaterThan(0);
        // Half a second of warp thrust must stay far below the cruise speed.
        expect(result.velocity.mag()).toBeLessThan(cap * 0.3);
        // Slower than a burn that would have been at full thrust all the time.
        expect(result.velocity.mag()).toBeLessThan(profile.acceleration * FLIGHT_BALANCE.warpAccelerationFactor * 0.5);

        // The warp drive needs over a second to reach full thrust.
        const spooling = stepFlight({ state, profile, performance: 1, intent, velocity: new Vector2(0, 0), dt: 0.15 });
        expect(spooling.state.throttle).toBeGreaterThan(0);
        expect(spooling.state.throttle).toBeLessThan(0.6);
    });

    it('spools the impulse drive faster than the warp drive', () => {
        const profile = lanceProfile();
        const intent: FlightIntent = { course: new Vector2(1, 0), throttle: 1, brake: false };
        const impulse = stepFlight({ state: createFlightState(0, 'impulse'), profile, performance: 1, intent, velocity: new Vector2(0, 0), dt: 0.4 });
        const warp = stepFlight({ state: createFlightState(0, 'warp'), profile, performance: 1, intent, velocity: new Vector2(0, 0), dt: 0.4 });

        expect(impulse.velocity.mag()).toBeGreaterThan(warp.velocity.mag() * 2);
        expect(impulse.speedCap).toBeLessThan(warp.speedCap);
    });

    it('limits the turn rate so a course change takes time', () => {
        const profile = lanceProfile();
        const intent: FlightIntent = { course: new Vector2(-1, 0), throttle: 1, brake: false };
        const dt = 0.05;
        let current = createFlightState(0, 'impulse');
        let previousHeading = current.heading;
        let maxObservedTurn = 0;
        const firstStepTurn = Math.abs(current.heading);

        for (let index = 0; index < 40; index++) {
            const result = stepFlight({ state: current, profile, performance: 1, intent, velocity: new Vector2(0, 0), dt });
            current = result.state;
            maxObservedTurn = Math.max(maxObservedTurn, Math.abs(result.state.heading - previousHeading) / dt);
            previousHeading = result.state.heading;
        }

        expect(maxObservedTurn).toBeLessThanOrEqual(profile.maxTurnRate * 1.001);
        // The angular velocity has to ramp up, so the first step is tiny.
        expect(Math.abs(current.heading) - firstStepTurn).toBeGreaterThan(firstStepTurn);
    });

    it('turns more slowly in warp than in impulse', () => {
        const profile = lanceProfile();
        const intent: FlightIntent = { course: new Vector2(-1, 0), throttle: 0, brake: false };
        const dt = 0.1;

        const turnOver = (mode: FlightMode) => {
            let current = createFlightState(0, mode);
            for (let index = 0; index < 10; index++) {
                current = stepFlight({ state: current, profile, performance: 1, intent, velocity: new Vector2(0, 0), dt }).state;
            }
            return Math.abs(current.heading);
        };

        expect(turnOver('impulse')).toBeGreaterThan(turnOver('warp') * 1.5);
        expect(turnOver('impulse')).toBeGreaterThan(0.5);
    });
});

describe('braking and determinism', () => {
    it('bleeds speed off without overshooting into a reverse course', () => {
        const profile = lanceProfile();
        const intent: FlightIntent = { course: new Vector2(1, 0), throttle: 0, brake: true };
        let state = createFlightState(0, 'impulse');
        let velocity = new Vector2(100, 0);

        for (let index = 0; index < 40; index++) {
            const result = stepFlight({ state, profile, performance: 1, intent, velocity, dt: 0.1 });
            state = result.state;
            velocity = result.velocity;
            expect(velocity.x).toBeGreaterThanOrEqual(0);
        }

        expect(velocity.mag()).toBeLessThan(1e-6);
    });

    it('is frame-rate independent while the fleet is still accelerating', () => {
        const profile = lanceProfile();
        const intent: FlightIntent = { course: new Vector2(1, 0), throttle: 1, brake: false };

        const simulate = (dt: number) => {
            let state = createFlightState(0, 'warp');
            let velocity = new Vector2(0, 0);
            const steps = Math.round(2 / dt);
            for (let index = 0; index < steps; index++) {
                const result = stepFlight({ state, profile, performance: 1, intent, velocity, dt });
                state = result.state;
                velocity = result.velocity;
            }
            return velocity.x;
        };

        const fast = simulate(1 / 60);
        const medium = simulate(1 / 30);
        const coarse = simulate(0.1);

        // The only residual comes from sampling the throttle ramp at different
        // step boundaries, which stays below one thousandth of a percent.
        expect(Math.abs(fast - medium) / fast).toBeLessThan(1e-5);
        expect(Math.abs(medium - coarse) / medium).toBeLessThan(1e-5);
    });

    it('scales acceleration and speed cap proportionally with performance', () => {
        const profile = lanceProfile();
        const intent: FlightIntent = { course: new Vector2(1, 0), throttle: 1, brake: false };

        const simulate = (performance: number) => {
            let state = createFlightState(0, 'warp');
            let velocity = new Vector2(0, 0);
            for (let index = 0; index < 10; index++) {
                const result = stepFlight({ state, profile, performance, intent, velocity, dt: 0.1 });
                state = result.state;
                velocity = result.velocity;
            }
            return velocity.mag();
        };

        const full = simulate(1);
        expect(full).toBeGreaterThan(0);
        expect(simulate(0.25)).toBeCloseTo(full * 0.25, 9);
    });

    it('never returns non-finite values and stays deterministic', () => {
        const profile = lanceProfile();
        const run = () => {
            let state = createFlightState(0, 'warp');
            let velocity = new Vector2(0, 0);
            let position = new Vector2(0, 0);
            for (let index = 0; index < 200; index++) {
                const intent: FlightIntent = {
                    course: new Vector2(Math.cos(index * 0.05), Math.sin(index * 0.05)),
                    throttle: 1,
                    brake: false
                };
                const result = stepFlight({ state, profile, performance: 1, intent, velocity, dt: 0.05 });
                state = result.state;
                velocity = result.velocity;
                position = position.add(velocity.scale(0.05));
                expect(Number.isFinite(result.velocity.x)).toBe(true);
                expect(Number.isFinite(result.state.heading)).toBe(true);
            }
            return `${position.x.toFixed(6)}:${position.y.toFixed(6)}:${velocity.mag().toFixed(6)}`;
        };

        expect(run()).toBe(run());
    });

    it('reports the braking distance needed to shed the current speed', () => {
        const profile = lanceProfile();
        const thrust = profile.acceleration * FLIGHT_BALANCE.brakeBoost;
        expect(brakeDistance(200, profile, 1)).toBeCloseTo((200 * 200) / (2 * thrust), 6);
        expect(brakeDistance(400, profile, 1)).toBeCloseTo(brakeDistance(200, profile, 1) * 4, 6);
        expect(brakeDistance(200, profile, 0.5)).toBeCloseTo(brakeDistance(200, profile, 1) * 2, 6);
    });
});

describe('autopilot, engagement and path preview', () => {
    it('switches to warp only for journeys beyond the threshold', () => {
        expect(chooseFlightMode(FLIGHT_BALANCE.warpEngageDistance * 2, false, 'impulse')).toBe('warp');
        expect(chooseFlightMode(FLIGHT_BALANCE.warpEngageDistance * 0.2, false, 'impulse')).toBe('impulse');
        // Hysteresis keeps a fleet in warp a little longer on the way back.
        expect(chooseFlightMode(FLIGHT_BALANCE.warpEngageDistance * 0.7, false, 'warp')).toBe('warp');
        expect(chooseFlightMode(100, true, 'impulse')).toBe('warp');
    });

    it('accelerates first and then brakes so the fleet arrives at the waypoint', () => {
        const profile = lanceProfile();
        const waypoint = new Vector2(6000, 0);
        const flight = flyTowards(profile, 1, waypoint, { seconds: 90, dt: 0.1 });

        expect(flight.position.x).toBeGreaterThan(0);
        expect(Vector2.distance(flight.position, waypoint)).toBeLessThan(FLIGHT_BALANCE.stopRadius * 6);
        expect(flight.velocity.mag()).toBeLessThan(150);
    });

    it('cannot turn instantly, so a late course change overshoots the old heading', () => {
        const profile = lanceProfile();
        const startVelocity = new Vector2(profile.maxSpeed, 0);
        // The waypoint sits almost 90 degrees off a fast existing course.
        const waypoint = new Vector2(0, 300);
        const flight = flyTowards(profile, 1, waypoint, { seconds: 20, dt: 0.1, startVelocity });

        // Momentum carries the fleet far past the waypoint on the original course.
        const furthestEast = Math.max(...flight.path.map(point => point.x));
        expect(furthestEast).toBeGreaterThan(300);
        expect(flight.path.length).toBeGreaterThan(0);
    });

    it('closes in on a distant target and orbits once inside stand-off range', () => {
        const profile = lanceProfile();
        const engagementRange = 600;
        const standoff = engagementRange * FLIGHT_BALANCE.combatStandoffFraction;

        const far = engagementIntent(new Vector2(0, 0), new Vector2(10, 0), new Vector2(0, 3000), engagementRange, 1);
        expect(far.throttle).toBe(1);
        expect(far.brake).toBe(false);
        expect(far.course.normalize().dot(new Vector2(0, 1))).toBeGreaterThan(0.9);

        const close = engagementIntent(new Vector2(0, 0), new Vector2(10, 0), new Vector2(0, standoff), engagementRange, 1);
        // Orbiting means the course is mostly tangential, not straight in.
        expect(Math.abs(close.course.normalize().dot(new Vector2(0, 1)))).toBeLessThan(0.6);

        const tooClose = engagementIntent(new Vector2(0, 0), new Vector2(10, 0), new Vector2(0, standoff * 0.4), engagementRange, 1);
        expect(tooClose.brake).toBe(true);
        expect(tooClose.course.normalize().dot(new Vector2(0, 1))).toBeLessThan(0);
    });

    it('previews the planned path without mutating the world state', () => {
        const profile = lanceProfile();
        const state = createFlightState(0, 'warp');
        const position = new Vector2(0, 0);
        const velocity = new Vector2(0, 0);
        const waypoint = new Vector2(1200, 0);

        const path = previewFlightPath({ state, position, velocity, profile, performance: 1, waypoint, seconds: 20, step: 0.25 });

        expect(path).toHaveLength(80);
        expect(position.x).toBe(0);
        expect(position.y).toBe(0);
        expect(velocity.mag()).toBe(0);
        expect(state.throttle).toBe(0);
        expect(Vector2.distance(path[path.length - 1], waypoint)).toBeLessThan(400);
    });

    it('previews a station-keeping stop when there is no waypoint', () => {
        const profile = lanceProfile();
        const path = previewFlightPath({
            state: createFlightState(0, 'warp'),
            position: new Vector2(0, 0),
            velocity: new Vector2(300, 0),
            profile,
            performance: 1,
            waypoint: null,
            seconds: 20,
            step: 0.25
        });

        const last = path[path.length - 1];
        const previous = path[path.length - 2];
        expect(Vector2.distance(last, previous)).toBeLessThan(1);
        // The braking run still covers ground before it stops. Drag adds a little
        // free deceleration, so the prediction is a close upper bound.
        const predicted = brakeDistance(300, profile, 1);
        expect(last.x).toBeGreaterThan(predicted * 0.6);
        expect(last.x).toBeLessThan(predicted * 1.1);
    });
});

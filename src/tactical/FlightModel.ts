import { Vector2 } from '../utils/Vector2';
import { FLIGHT_BALANCE, HULLS } from './ShipDefinitions';
import type { Ship } from './Ship';

export type FlightMode = 'impulse' | 'warp';

/**
 * Performance envelope derived from the hulls of every living ship. A fleet
 * moves like one organism, so the slowest hull in the formation defines how
 * fast the whole formation can build up speed and turn.
 */
export interface FlightProfile {
    maxSpeed: number;
    acceleration: number;
    maxTurnRate: number;
    angularAcceleration: number;
    mass: number;
}

export interface FlightState {
    heading: number;
    angularVelocity: number;
    throttle: number;
    mode: FlightMode;
    /** True while the player holds manual warp trim. */
    manual: boolean;
}

/** What the fleet currently wants to do, independent of how heavy it is. */
export interface FlightIntent {
    /** Unit vector the fleet wants to travel along. */
    course: Vector2;
    /** 0..1 burn request; the drive still has to spool up. */
    throttle: number;
    /** Retro thrusters only: bleed speed off without turning the fleet around. */
    brake: boolean;
}

export interface FlightStepInput {
    state: FlightState;
    profile: FlightProfile;
    /** Scales both acceleration and the speed cap (readiness, Energy, fuel, abilities). */
    performance: number;
    intent: FlightIntent;
    velocity: Vector2;
    dt: number;
}

export interface FlightStepResult {
    state: FlightState;
    velocity: Vector2;
    /** Acceleration actually applied this step, in world units per second squared. */
    acceleration: Vector2;
    speedCap: number;
}

const TWO_PI = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return clamp(value, 0, 1);
}

/** Normalizes an angle into `(-PI, PI]`. */
export function wrapAngle(angle: number): number {
    if (!Number.isFinite(angle)) return 0;
    let wrapped = angle % TWO_PI;
    if (wrapped > Math.PI) wrapped -= TWO_PI;
    if (wrapped < -Math.PI) wrapped += TWO_PI;
    return wrapped;
}

/** Shortest signed rotation from `from` to `to`. */
export function angleDelta(from: number, to: number): number {
    return wrapAngle(to - from);
}

export function moveTowards(current: number, target: number, maxDelta: number): number {
    const delta = target - current;
    if (Math.abs(delta) <= maxDelta) return target;
    return current + Math.sign(delta) * maxDelta;
}

export function createFlightState(heading: number = 0, mode: FlightMode = 'impulse'): FlightState {
    return { heading: wrapAngle(heading), angularVelocity: 0, throttle: 0, mode, manual: false };
}

export function fallbackFlightProfile(maxSpeed: number): FlightProfile {
    return {
        maxSpeed: Math.max(FLIGHT_BALANCE.minimumMaxSpeed, maxSpeed),
        acceleration: FLIGHT_BALANCE.accelerationScale,
        maxTurnRate: 1.5,
        angularAcceleration: 1.5 * FLIGHT_BALANCE.angularAccelerationScale,
        mass: 16
    };
}

/** The slowest living hull sets the fleet speed; heavier ships slow the formation. */
export function deriveFlightProfile(ships: Ship[]): FlightProfile | null {
    const active = ships.filter(ship => ship.state !== 'destroyed');
    if (!active.length) return null;

    let maxSpeed = Number.POSITIVE_INFINITY;
    let turnRate = Number.POSITIVE_INFINITY;
    let weightedAcceleration = 0;
    let totalMass = 0;

    for (const ship of active) {
        const hull = HULLS[ship.loadout.hullId] || HULLS.command;
        maxSpeed = Math.min(maxSpeed, hull.maxSpeed);
        turnRate = Math.min(turnRate, hull.turnRate);
        weightedAcceleration += hull.acceleration * hull.mass;
        totalMass += hull.mass;
    }

    const averageAcceleration = weightedAcceleration / Math.max(1, totalMass);
    const scaledTurnRate = turnRate * FLIGHT_BALANCE.turnRateScale;

    return {
        maxSpeed: Math.max(FLIGHT_BALANCE.minimumMaxSpeed, maxSpeed * FLIGHT_BALANCE.speedScale),
        acceleration: Math.max(FLIGHT_BALANCE.minimumAcceleration, averageAcceleration * FLIGHT_BALANCE.accelerationScale),
        maxTurnRate: Math.max(FLIGHT_BALANCE.minimumTurnRate, scaledTurnRate),
        angularAcceleration: Math.max(FLIGHT_BALANCE.minimumAngularAcceleration, scaledTurnRate * FLIGHT_BALANCE.angularAccelerationScale),
        mass: totalMass
    };
}

/** Engagement trigger distance is derived from the longest weapon in the fleet. */
export function deriveEngagementRange(ships: Ship[]): number {
    let longest = 0;
    for (const ship of ships) {
        if (ship.state === 'destroyed') continue;
        for (const weapon of ship.weapons) longest = Math.max(longest, weapon.range);
    }
    if (longest <= 0) return FLIGHT_BALANCE.engagementRangeDefault;
    return clamp(
        longest * FLIGHT_BALANCE.engagementRangeFraction,
        FLIGHT_BALANCE.minimumEngagementRange,
        FLIGHT_BALANCE.maximumEngagementRange
    );
}

/** Warp is reserved for long journeys; short manoeuvres stay in impulse. */
export function chooseFlightMode(distance: number, manual: boolean, currentMode: FlightMode): FlightMode {
    if (manual) return 'warp';
    if (!Number.isFinite(distance)) return currentMode;
    if (distance > FLIGHT_BALANCE.warpEngageDistance) return 'warp';
    // Hysteresis keeps a fleet from flipping modes around the threshold.
    if (currentMode === 'warp' && distance > FLIGHT_BALANCE.warpEngageDistance * 0.5) return 'warp';
    return 'impulse';
}

/** Distance a fleet needs to shed `speed` with its retro thrusters. */
export function brakeDistance(speed: number, profile: FlightProfile, performance: number): number {
    const thrust = Math.max(1e-3, profile.acceleration * FLIGHT_BALANCE.brakeBoost * performance);
    return (Math.max(0, speed) * Math.max(0, speed)) / (2 * thrust);
}

/** Highest speed the fleet may reach right now, including mode and performance. */
export function speedCap(profile: FlightProfile, mode: FlightMode, performance: number): number {
    const modeFactor = mode === 'warp' ? FLIGHT_BALANCE.warpSpeedFactor : FLIGHT_BALANCE.impulseSpeedFactor;
    return profile.maxSpeed * modeFactor * Math.max(0, performance);
}

function spoolSeconds(state: FlightState): number {
    if (state.manual) return FLIGHT_BALANCE.manualSpoolSeconds;
    const base = state.mode === 'warp' ? FLIGHT_BALANCE.warpSpoolSeconds : FLIGHT_BALANCE.impulseSpoolSeconds;
    return base * FLIGHT_BALANCE.orderedSpoolFraction;
}

/**
 * One deterministic flight step. Everything scales linearly with
 * `performance`, so a limited fleet accelerates and brakes in the same
 * proportions in which it is allowed to travel.
 */
export function stepFlight(input: FlightStepInput): FlightStepResult {
    const { profile, intent, performance } = input;
    const dt = input.dt;
    const cap = speedCap(profile, input.state.mode, performance);
    const state: FlightState = { ...input.state };

    if (!(dt > 0)) {
        return { state, velocity: input.velocity, acceleration: new Vector2(0, 0), speedCap: cap };
    }

    // 1. Drive spool-up / cut-off. The average throttle over the step is
    //    integrated exactly, so the same manoeuvre does not depend on the
    //    frame rate even while the drive is still spooling up.
    const previousThrottle = clamp01(state.throttle);
    const targetThrottle = clamp01(intent.throttle);
    const spool = Math.max(0.05, spoolSeconds(state));
    const spoolRate = targetThrottle >= previousThrottle
        ? 1 / spool
        : 1 / Math.max(0.05, spool * FLIGHT_BALANCE.spoolDownFraction);
    const throttleDelta = targetThrottle - previousThrottle;
    let averageThrottle: number;

    if (throttleDelta === 0) {
        averageThrottle = previousThrottle;
        state.throttle = previousThrottle;
    } else {
        const rampTime = Math.abs(throttleDelta) / spoolRate;
        if (rampTime >= dt) {
            state.throttle = previousThrottle + Math.sign(throttleDelta) * spoolRate * dt;
            averageThrottle = (previousThrottle + state.throttle) / 2;
        } else {
            // The ramp finishes inside this step: linear part plus the plateau.
            state.throttle = targetThrottle;
            const rampFraction = rampTime / dt;
            averageThrottle = ((previousThrottle + targetThrottle) / 2) * rampFraction
                + targetThrottle * (1 - rampFraction);
        }
    }
    state.throttle = clamp01(state.throttle);

    // 2. Turn the nose towards the requested course with limited angular thrust.
    const course = intent.course.mag() > 1e-6
        ? intent.course.normalize()
        : new Vector2(Math.cos(state.heading), Math.sin(state.heading));
    const desiredHeading = Math.atan2(course.y, course.x);
    const error = angleDelta(state.heading, desiredHeading);
    const turnFactor = state.mode === 'warp' ? FLIGHT_BALANCE.warpTurnFactor : 1;
    const maxTurnRate = profile.maxTurnRate * turnFactor;
    const desiredAngular = clamp(error * FLIGHT_BALANCE.turnPursuitGain, -maxTurnRate, maxTurnRate);
    state.angularVelocity = moveTowards(state.angularVelocity, desiredAngular, profile.angularAcceleration * dt);
    state.heading = wrapAngle(state.heading + state.angularVelocity * dt);

    // 3. Drag and thrust are integrated as one exact exponential step, so the
    //    same manoeuvre produces the same result at any frame rate.
    const decay = Math.pow(1 - FLIGHT_BALANCE.spaceDragPerSecond, dt);
    const coastVelocity = input.velocity.scale(decay);
    const coastSpeed = coastVelocity.mag();
    const dragRate = Math.max(1e-6, -Math.log(Math.max(1e-6, decay)) / dt);
    let acceleration: Vector2;

    if (intent.brake) {
        // Retro thrusters ignore the nose direction but cannot overshoot zero.
        if (coastSpeed > 1e-9) {
            const magnitude = Math.min(profile.acceleration * FLIGHT_BALANCE.brakeBoost * performance, coastSpeed / dt);
            acceleration = coastVelocity.scale(-magnitude / coastSpeed);
        } else {
            acceleration = new Vector2(0, 0);
        }
    } else {
        const modeFactor = state.mode === 'warp' ? FLIGHT_BALANCE.warpAccelerationFactor : FLIGHT_BALANCE.impulseAccelerationFactor;
        const alignment = Math.max(FLIGHT_BALANCE.courseAlignmentFloor, Math.cos(error) ** 2);
        const magnitude = profile.acceleration * modeFactor * averageThrottle * Math.max(0, performance) * alignment;
        acceleration = course.scale(magnitude);
    }

    // v(t) = v0 * e^(-d t) + (a / d) * (1 - e^(-d t)) with constant a.
    const thrustGain = (1 - decay) / dragRate;
    let velocity = input.velocity.scale(decay).add(acceleration.scale(thrustGain));

    // 4. Enforce the speed cap. A hard cap keeps the promise of abilities such
    //    as the stasis bubble while staying frame-rate independent.
    const resultingSpeed = velocity.mag();
    if (resultingSpeed > cap) velocity = velocity.scale(cap / resultingSpeed);

    return { state, velocity, acceleration, speedCap: cap };
}

/**
 * Autopilot intent towards a waypoint. The fleet keeps accelerating while it
 * can still shed the speed before the waypoint and starts braking once the
 * remaining distance is no longer enough.
 */
export function autopilotIntent(
    position: Vector2,
    velocity: Vector2,
    waypoint: Vector2,
    profile: FlightProfile,
    performance: number
): FlightIntent {
    const toWaypoint = waypoint.sub(position);
    const distance = toWaypoint.mag();
    const speed = velocity.mag();
    const thrust = Math.max(1e-3, profile.acceleration * performance);

    // v = sqrt(2as) is the fastest speed that still allows a full stop.
    const allowedSpeed = Math.sqrt(Math.max(0, 2 * thrust * Math.max(0, distance - FLIGHT_BALANCE.stopRadius)));
    if (speed > allowedSpeed * FLIGHT_BALANCE.brakeTriggerMargin && speed > 1) {
        return { course: velocity.normalize(), throttle: 0, brake: true };
    }
    if (distance <= FLIGHT_BALANCE.stopRadius) {
        return { course: speed > 1e-4 ? velocity.normalize() : toWaypoint, throttle: 0, brake: true };
    }
    return { course: toWaypoint, throttle: 1, brake: false };
}

/**
 * Combat intent: close to stand-off range, then orbit the target instead of
 * ramming it. The orbit direction is stable per fleet.
 */
export function engagementIntent(
    position: Vector2,
    velocity: Vector2,
    target: Vector2,
    engagementRange: number,
    orbitDirection: number
): FlightIntent {
    const toTarget = target.sub(position);
    const distance = toTarget.mag();
    const standoff = Math.max(1, engagementRange * FLIGHT_BALANCE.combatStandoffFraction);
    const direction = distance > 1e-4 ? toTarget.normalize() : velocity.normalize();

    if (distance > engagementRange * FLIGHT_BALANCE.combatReengageFraction) {
        return { course: direction, throttle: 1, brake: false };
    }

    const tangent = new Vector2(-direction.y, direction.x).scale(Math.sign(orbitDirection) || 1);
    if (distance > standoff) {
        return { course: direction.add(tangent.scale(FLIGHT_BALANCE.combatOrbitBlend)), throttle: 1, brake: false };
    }
    if (distance < standoff * 0.55) {
        // Too close: slide outward and around while bleeding speed.
        return { course: direction.scale(-1).add(tangent.scale(FLIGHT_BALANCE.combatOrbitBlend)), throttle: 0.6, brake: true };
    }
    return { course: tangent.add(direction.scale(0.25)), throttle: 0.7, brake: false };
}

export interface FlightPreviewInput {
    state: FlightState;
    position: Vector2;
    velocity: Vector2;
    profile: FlightProfile;
    performance: number;
    /** `null` previews the station-keeping brake instead of a waypoint run. */
    waypoint: Vector2 | null;
    seconds: number;
    step: number;
}

/**
 * Rolls the very same flight model forward without touching the world. The
 * returned points are the predicted positions, which the renderer uses to show
 * the planned path and the braking point of the autopilot.
 */
export function previewFlightPath(input: FlightPreviewInput): Vector2[] {
    const step = Math.max(0.01, input.step);
    const steps = clamp(Math.round(input.seconds / step), 1, 240);
    let state: FlightState = { ...input.state };
    let position = input.position.clone();
    let velocity = input.velocity.clone();
    const points: Vector2[] = [];

    for (let index = 0; index < steps; index++) {
        const intent = input.waypoint
            ? autopilotIntent(position, velocity, input.waypoint, input.profile, input.performance)
            : { course: velocity.normalize(), throttle: 0, brake: true };
        const result = stepFlight({ state, profile: input.profile, performance: input.performance, intent, velocity, dt: step });
        state = result.state;
        velocity = result.velocity;
        position = position.add(velocity.scale(step));
        points.push(position);
    }

    return points;
}
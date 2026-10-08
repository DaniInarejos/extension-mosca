import type {
  BodyBehavior,
  BodyMotorOutput,
  BodyPose,
  BodyMemory,
  FlyState,
  GroomingTarget,
  MotorOutput,
  SensoryInput,
} from '../protocol/index';
import { BOUNDS, supportAt } from '../world/index';
import type { WorldObject } from '../protocol/index';
import { ageBodyMemory } from './memory';
import { personalityOf } from './personality';
import { NEEDS_POLICY, needsOf, wantsFood } from './needs';

const unit = (v: number) => Math.max(0, Math.min(1, v));
const signed = (v: number) => Math.max(-1, Math.min(1, v));
// Longer endurance increases airborne time and traveled path without raising speed limits.
export const FLIGHT_DURATION_MULTIPLIER = 4;
export const behaviorLabels: Record<BodyBehavior, string> = {
  WALK: 'Explorando',
  IDLE: 'Descansando',
  GROOM: 'Limpiándose',
  FEED: 'Alimentándose',
  ALERT: 'Reaccionando al entorno',
  TAKEOFF: 'Preparando el vuelo',
  FLIGHT: 'Volando',
  LAND: 'Aterrizando',
};
export function restingPose(): BodyPose {
  return {
    behavior: 'IDLE',
    flight: 'ground',
    phase: 0,
    intensity: 0,
    groomingTarget: 'legs',
    legs: 0,
    wings: 0,
    headYaw: 0,
    headPitch: 0,
    antennaLeft: 0,
    antennaRight: 0,
    proboscis: 0,
    pitch: 0,
    roll: 0,
  };
}

/** Engineering motor interpretation, never a goal/path planner. No random scheduler.
 * FlyWire remains the source of locomotion, feeding and stimulation. Accumulators
 * model body load and refractory intervals; maneuvers only execute motor primitives.
 */
export class MotorBehavior {
  private time = 0;
  private fatigue = 0;
  private dust = 0.35;
  private satiety = 0;
  private foodFraction = 1;
  private flightLoad = 0;
  private wingFatigue = 0;
  private refractory = 0;
  private maneuver: 'none' | 'groom' | 'idle' | 'takeoff' | 'flight' | 'land' = 'none';
  private elapsed = 0;
  private duration = 0;
  private sequence = 0;
  private target: GroomingTarget = 'legs';
  private lastArousal = 0;
  private socialRefractory = 0;
  private greeting = false;
  private phaseOffset: number;
  private pose = restingPose();
  private counts: Partial<Record<BodyBehavior, number>> = {};
  private seconds: Partial<Record<BodyBehavior, number>> = {};
  private history: { behavior: BodyBehavior; at: number }[] = [];
  debug = false;
  constructor(identity = '', memory?: BodyMemory) {
    // Identity offsets gait phases, not behavior probabilities or destinations.
    let hash = 0;
    for (const c of identity) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    this.phaseOffset = (hash % 628) / 100;
    // Persistence and network input are validated by the server before owner delivery.
    if (memory?.version === 1) {
      const value = memory;
      this.time = value.time;
      this.fatigue = value.fatigue;
      this.dust = value.dust;
      this.satiety = value.satiety;
      this.flightLoad = value.flightLoad;
      this.wingFatigue = value.wingFatigue;
      this.refractory = value.refractory;
      this.sequence = value.sequence;
      this.counts = { ...value.counts };
      this.seconds = { ...value.seconds };
    }
  }
  modulateSensory(input: SensoryInput): SensoryInput {
    const adaptation = this.satiety * (1 - (input.hunger ?? 0));
    const food = (input.foodTaste ?? input.taste) * Math.pow(1 - adaptation, 3);
    const water = input.waterTaste ?? 0;
    this.foodFraction = food + water > 0 ? food / (food + water) : 0;
    return {
      ...input,
      // Explicit peripheral/body adaptation, upstream of the neural simulation.
      taste: Math.max(food, water),
      foodTaste: food,
      waterTaste: water,
      touch: Math.max(input.touch, (input.foodTaste ?? input.taste) * adaptation * 0.6),
    };
  }
  /** Reattach to authoritative geometry after a connection gap without erasing body history. */
  reconcile(fly: FlyState, objects: WorldObject[], offlineSeconds = 0) {
    if (offlineSeconds > 0) {
      const aged = ageBodyMemory(this.checkpoint(), offlineSeconds);
      this.fatigue = aged.fatigue;
      this.satiety = aged.satiety;
      this.wingFatigue = aged.wingFatigue;
      this.flightLoad = aged.flightLoad;
      this.refractory = aged.refractory;
    }
    const grounded = fly.position[1] <= supportAt(fly.position, objects).height + 0.025;
    this.begin(grounded ? 'none' : 'land');
    this.greeting = false;
    this.refractory = Math.max(this.refractory, 3);
    this.pose = restingPose();
    if (!grounded) {
      this.pose.behavior = 'LAND';
      this.pose.flight = 'landing';
    }
    fly.body = structuredClone(this.pose);
  }
  diagnostics() {
    return {
      currentBehavior: this.pose.behavior,
      flightState: this.pose.flight,
      grooming: {
        active: this.maneuver === 'groom',
        target: this.target,
        elapsed: this.elapsed,
        duration: this.duration,
      },
      bodyLoad: {
        fatigue: this.fatigue,
        dust: this.dust,
        satiety: this.satiety,
        flightLoad: this.flightLoad,
        wingFatigue: this.wingFatigue,
      },
      posture: structuredClone(this.pose),
      counts: { ...this.counts },
      seconds: { ...this.seconds },
      history: [...this.history],
    };
  }
  checkpoint(): BodyMemory {
    return {
      version: 1,
      time: this.time,
      fatigue: unit(this.fatigue),
      dust: unit(this.dust),
      satiety: unit(this.satiety),
      flightLoad: unit(this.flightLoad),
      wingFatigue: unit(this.wingFatigue),
      refractory: this.refractory,
      sequence: this.sequence,
      counts: { ...this.counts },
      seconds: { ...this.seconds },
    };
  }
  private begin(maneuver: typeof this.maneuver, duration = 0) {
    this.maneuver = maneuver;
    this.duration = duration;
    this.elapsed = 0;
  }
  step(neural: MotorOutput, fly: FlyState, dt: number, objects: WorldObject[]): BodyMotorOutput {
    dt = Math.max(0, Math.min(0.1, dt));
    this.time += dt;
    this.elapsed += dt;
    this.refractory = Math.max(0, this.refractory - dt);
    this.socialRefractory = Math.max(0, this.socialRefractory - dt);
    const n = neural.neural;
    const drive = n?.drive ?? 0;
    const threat = n?.threat ?? 0;
    const startle = n?.startle ?? 0;
    const sleepPressure = n?.sleepPressure ?? 0;
    const arousal = Math.max(n?.arousal ?? 0, threat, startle * 0.85);
    const tactile = n?.tactile ?? 0;
    const difference = (n?.odorRight ?? 0) - (n?.odorLeft ?? 0);
    const novelty = Math.max(0, arousal - this.lastArousal);
    this.lastArousal = arousal;
    const active = drive > 0.0001;
    const ground = supportAt(fly.position, objects);
    const grounded = fly.position[1] <= ground.height + 0.025 && Math.abs(fly.velocity[1]) < 0.15;
    const moving = Math.hypot(fly.velocity[0], fly.velocity[2]);
    const feed = neural.feed * Math.pow(1 - threat, 3);
    const criticalEnergy = fly.energy <= 0;
    const socialDifference = (n?.socialRight ?? 0) - (n?.socialLeft ?? 0);
    const personality = personalityOf(fly);
    const survivalFocused =
      criticalEnergy || wantsFood(fly) || needsOf(fly).hydration <= NEEDS_POLICY.drinkThreshold;
    const flightAffinity = survivalFocused ? 0.5 : personality.flightAffinity;
    this.satiety = unit(
      this.satiety +
        dt * (feed > 0.2 && this.foodFraction > 0 ? feed * this.foodFraction * 0.075 : -0.004),
    );
    this.fatigue = unit(this.fatigue + dt * (moving > 0.08 ? 0.018 * (0.5 + moving) : -0.12));
    this.dust = unit(this.dust + dt * (moving * 0.015 + tactile * 0.012));
    if (active && this.maneuver !== 'flight' && this.maneuver !== 'land')
      this.flightLoad = unit(
        this.flightLoad +
          dt * (drive * 0.012 + tactile * 0.025 + novelty * 0.12) * (0.8 + flightAffinity * 0.4),
      );

    // Interruptible finite motor bouts, with strong neural stimulation taking precedence.
    if (
      (this.maneuver === 'groom' || this.maneuver === 'idle') &&
      (criticalEnergy || arousal > 0.88 || threat > 0.35 || startle > 0.5 || feed > 0.2)
    ) {
      this.begin('none');
      this.greeting = false;
      this.refractory = threat > 0.45 ? 0 : 3;
    }
    if (this.maneuver === 'groom' && this.elapsed >= this.duration) {
      this.dust = 0.12;
      this.begin('none');
      this.refractory = 6;
    }
    if (this.maneuver === 'idle' && this.elapsed >= this.duration) {
      this.begin('none');
      this.greeting = false;
    }
    if (this.maneuver === 'takeoff' && (!active || feed > 0.2)) this.begin('none');
    if (this.maneuver === 'takeoff' && this.elapsed >= 0.65) {
      this.begin('flight');
      this.wingFatigue = 0;
    }
    if (this.maneuver === 'flight') {
      this.wingFatigue += (dt * (0.12 + 0.04 * (n?.wind ?? 0))) / FLIGHT_DURATION_MULTIPLIER;
      if (!active || this.wingFatigue > 1 || fly.energy < 12 || feed > 0.25) this.begin('land');
      else if (this.wingFatigue > 0.85 && ground.id !== 'ground' && threat < 0.2)
        this.begin('land');
    }
    if (this.maneuver === 'land' && grounded && this.elapsed > 0.25) {
      this.begin(ground.id !== 'ground' && threat < 0.2 && feed < 0.15 ? 'idle' : 'none', 3.5);
      this.flightLoad = 0;
      this.refractory = 12;
    }
    if (
      !grounded &&
      this.maneuver !== 'flight' &&
      this.maneuver !== 'land' &&
      this.maneuver !== 'takeoff'
    )
      this.begin('land');

    if (this.maneuver === 'none' && grounded && active && feed < 0.15 && this.refractory === 0) {
      if (
        (this.flightLoad >= 0.99 - flightAffinity * 0.06 || threat > 0.45 || startle > 0.65) &&
        fly.energy > 18
      )
        this.begin('takeoff');
      else if (!criticalEnergy && this.dust > 0.82 && arousal < 0.88) {
        // Flies clean the sensory organs first, then legs, wings and abdomen.
        const targets: GroomingTarget[] = ['head', 'antennae', 'legs', 'wings', 'abdomen'];
        this.target = targets[this.sequence++ % targets.length];
        this.begin('groom', 3 + drive * 2.5 + Math.abs(difference) * 2 + tactile);
      } else if (
        !criticalEnergy &&
        (this.fatigue > 0.78 || fly.energy < 12 || sleepPressure > 0.42)
      )
        this.begin('idle', 2.5 + (1 - drive) * 3.5 + sleepPressure * 5);
      else if (
        !criticalEnergy &&
        (n?.socialContact ?? 0) > 0.12 &&
        this.socialRefractory === 0 &&
        threat < 0.2
      ) {
        this.begin('idle', 1.1 + (n?.socialContact ?? 0) * 0.6);
        this.greeting = true;
        this.socialRefractory = 10;
      }
    }
    let behavior: BodyBehavior = moving > 0.06 || neural.forward > 0.08 ? 'WALK' : 'IDLE';
    if (this.maneuver === 'groom') behavior = 'GROOM';
    else if (this.maneuver === 'idle') behavior = 'IDLE';
    else if (this.maneuver === 'takeoff') behavior = 'TAKEOFF';
    else if (this.maneuver === 'flight') behavior = 'FLIGHT';
    else if (this.maneuver === 'land') behavior = 'LAND';
    else if (feed > 0.2 && grounded) behavior = 'FEED';
    else if ((arousal > 0.72 || threat > 0.2 || startle > 0.35) && active) behavior = 'ALERT';
    const brake = ['GROOM', 'IDLE', 'TAKEOFF'].includes(behavior)
      ? 1
      : behavior === 'ALERT'
        ? 0.3
        : 0;
    const phase = this.time * (2.2 + drive * 2) + this.phaseOffset;
    const antenna = Math.sin(phase) * (0.08 + drive * 0.14);
    const flight =
      behavior === 'TAKEOFF'
        ? 'preparing'
        : behavior === 'FLIGHT'
          ? 'airborne'
          : behavior === 'LAND'
            ? 'landing'
            : 'ground';
    const pose: BodyPose = {
      behavior,
      flight,
      phase:
        behavior === 'GROOM' ? unit(this.elapsed / this.duration) : (phase / (Math.PI * 2)) % 1,
      intensity: behavior === 'GROOM' ? 0.5 + drive * 0.5 : unit(Math.max(drive, feed, arousal)),
      groomingTarget: this.target,
      legs: unit(moving * 0.8 + (behavior === 'GROOM' ? 0.8 : active ? 0.06 : 0)),
      wings:
        behavior === 'FLIGHT'
          ? 0.85
          : behavior === 'LAND'
            ? 0.5
            : behavior === 'TAKEOFF'
              ? unit(this.elapsed / 0.65)
              : 0.04 * drive + (this.greeting ? 0.12 : 0),
      headYaw: signed(difference * 2 + neural.turn * 0.2 + socialDifference * 1.6),
      headPitch:
        behavior === 'FEED' ? -0.35 : Math.sin(phase * 0.6) * drive * (this.greeting ? 0.3 : 0.1),
      antennaLeft: signed(
        antenna +
          (n?.odorLeft ?? 0) * 0.3 +
          (n?.socialLeft ?? 0) * 0.4 +
          (behavior === 'GROOM' && this.target === 'antennae' ? Math.sin(phase * 3) * 0.35 : 0),
      ),
      antennaRight: signed(
        Math.sin(phase + 1.2) * (0.08 + drive * 0.14) +
          (n?.odorRight ?? 0) * 0.3 +
          (n?.socialRight ?? 0) * 0.4,
      ),
      proboscis: unit(feed * (0.93 + Math.sin(phase * 1.2) * 0.07)),
      pitch:
        flight === 'airborne' ? signed(neural.forward * 0.3) : flight === 'preparing' ? -0.15 : 0,
      roll:
        flight === 'airborne'
          ? signed(-neural.turn * 0.45 + (n?.wind ?? 0) * Math.sin(phase) * 0.08)
          : 0,
    };
    const height = Math.min(
      BOUNDS.ceiling - 0.5,
      ground.height + 1.15 + drive * 1.1 + (n?.heightPreference ?? 0) * 1.5,
    );
    const lift =
      behavior === 'FLIGHT'
        ? signed((height - fly.position[1]) * 1.1)
        : behavior === 'LAND'
          ? -0.55
          : 0;
    const output: BodyMotorOutput = {
      ...neural,
      feed,
      forward:
        behavior === 'LAND'
          ? neural.forward * (ground.id === 'ground' ? 0.3 : 0.12)
          : neural.forward,
      turn: neural.turn + (behavior === 'ALERT' ? Math.sin(phase) * tactile * 0.4 : 0),
      lift,
      lateral: flight === 'airborne' ? (n?.wind ?? 0) * Math.sin(phase) * 0.06 : 0,
      brake,
      pose,
    };
    if (this.pose.behavior !== behavior) {
      this.counts[behavior] = (this.counts[behavior] ?? 0) + 1;
      this.history.push({ behavior, at: this.time });
      if (this.history.length > 100) this.history.shift();
      if (this.debug) console.debug('[BEHAVIOR]', behavior, this.target);
    }
    this.seconds[behavior] = (this.seconds[behavior] ?? 0) + dt;
    this.pose = pose;
    fly.body = pose;
    return output;
  }
}

// Palm Harbor — side jobs: taxi fares and delivery runs.
// Free-roam work between story jobs. Walk into a taxi stand and a passenger
// is waiting: pick them up, drop them across town before the meter runs out.
// The delivery depot by the harbor hands out three drops a run. Fares surge
// when it rains. No fail penalty beyond the lost fare — the city forgives.
// Pure logic: no DOM. The renderer reads marker() and hud().
import { CITY, LANDMARK } from './config.js';

export const TAXI_STANDS = [
  { x: -74, z: 74, name: 'Plaza' },
  { x: 74, z: 148, name: 'Marina' },
  { x: 0, z: 20, name: 'Bank' },
  { x: -148, z: 148, name: 'Hospital' },
];
export const TAXI_PICKUP_R = 6;
export const TAXI_DROP_R = 9;
export const TAXI_BASE_FARE = 40;
export const TAXI_PER_METRE = 2;
export const TAXI_SURGE_RAIN = 0.4;
export const TAXI_SURGE_MULT = 1.5;
export const DELIVERY_DEPOT = { x: 0, z: 210, name: 'Harbor Depot' };
export const DELIVERY_DROPS = [
  { x: -148, z: 0, name: 'West Row' },
  { x: 74, z: -74, name: 'North Shops' },
  { x: 111, z: 111, name: 'East Blocks' },
];
export const DELIVERY_PER_DROP = 60;
export const DELIVERY_BONUS = 100;
export const DELIVERY_DROP_R = 8;
export const DELIVERY_TIME_PER_DROP = 75;
export const JOB_COOLDOWN = 10;

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}
function pickOther(rnd, arr, excludeIdx) {
  let i = Math.floor(rnd() * arr.length);
  if (arr.length > 1 && i === excludeIdx) i = (i + 1) % arr.length;
  return { item: arr[i], index: i };
}

export function createSideJobs(world, weather) {
  const st = {
    active: null,
    cooldown: 0,
    jobsDone: 0,
    earned: 0,
    rng: Math.random,
  };

  function surge() {
    const rain = weather && typeof weather.rain === 'number' ? weather.rain : 0;
    return rain > TAXI_SURGE_RAIN ? TAXI_SURGE_MULT : 1;
  }
  function taxiFare(d) {
    return Math.round((TAXI_BASE_FARE + d * TAXI_PER_METRE) * surge());
  }

  function startTaxi(standIdx) {
    const stand = TAXI_STANDS[standIdx];
    const { item: dest, index: destIdx } = pickOther(st.rng, TAXI_STANDS, standIdx);
    const d = dist(stand.x, stand.z, dest.x, dest.z);
    st.active = {
      kind: 'taxi',
      phase: 'pickup',
      standIdx,
      destIdx,
      px: stand.x,
      pz: stand.z,
      dx: dest.x,
      dz: dest.z,
      timeLeft: 0,
      fare: taxiFare(d),
      label: `Pick up the fare at ${stand.name}`,
    };
    return { started: true, kind: 'taxi', message: `Taxi job: pick up at ${stand.name}, drop at ${dest.name}.` };
  }

  function startDelivery() {
    st.active = {
      kind: 'delivery',
      phase: 'drop',
      dropIdx: 0,
      dx: DELIVERY_DROPS[0].x,
      dz: DELIVERY_DROPS[0].z,
      timeLeft: DELIVERY_TIME_PER_DROP,
      fare: 0,
      label: `Deliver the package to ${DELIVERY_DROPS[0].name}`,
    };
    return { started: true, kind: 'delivery', message: 'Delivery run: three drops, first one at West Row.' };
  }

  function nearStand() {
    const p = world.state.player;
    for (let i = 0; i < TAXI_STANDS.length; i += 1) {
      if (dist(p.x, p.z, TAXI_STANDS[i].x, TAXI_STANDS[i].z) < TAXI_PICKUP_R) return i;
    }
    return -1;
  }
  function nearDepot() {
    const p = world.state.player;
    return dist(p.x, p.z, DELIVERY_DEPOT.x, DELIVERY_DEPOT.z) < TAXI_PICKUP_R;
  }

  function finishJob(fare, message) {
    world.state.money += fare;
    st.earned += fare;
    st.jobsDone += 1;
    st.active = null;
    st.cooldown = JOB_COOLDOWN;
    return { completed: true, fare, message };
  }
  function failJob(message) {
    st.active = null;
    st.cooldown = JOB_COOLDOWN;
    return { failed: true, message };
  }

  function update(dt) {
    if (st.cooldown > 0) st.cooldown -= dt;
    const p = world.state.player;
    if (!st.active) {
      if (st.cooldown > 0) return {};
      const stand = nearStand();
      if (stand >= 0) return startTaxi(stand);
      if (nearDepot()) return startDelivery();
      return {};
    }
    const job = st.active;
    if (job.kind === 'taxi') {
      if (job.phase === 'pickup') {
        if (dist(p.x, p.z, job.px, job.pz) < TAXI_PICKUP_R) {
          const d = dist(job.px, job.pz, job.dx, job.dz);
          job.phase = 'drop';
          job.timeLeft = d / 10 + 25;
          job.label = `Drop the fare at ${TAXI_STANDS[job.destIdx].name} — $${job.fare}`;
          return { stepDone: true, message: `Passenger aboard. Drop at ${TAXI_STANDS[job.destIdx].name} — $${job.fare} on the meter.` };
        }
        return {};
      }
      job.timeLeft -= dt;
      if (dist(p.x, p.z, job.dx, job.dz) < TAXI_DROP_R) {
        return finishJob(job.fare, `Fare paid: $${job.fare}.`);
      }
      if (job.timeLeft <= 0) return failJob('The fare gave up and walked away.');
      return {};
    }
    // Delivery run: three drops in order, a clock on each.
    job.timeLeft -= dt;
    if (dist(p.x, p.z, job.dx, job.dz) < DELIVERY_DROP_R) {
      world.state.money += DELIVERY_PER_DROP;
      st.earned += DELIVERY_PER_DROP;
      job.fare += DELIVERY_PER_DROP;
      job.dropIdx += 1;
      if (job.dropIdx >= DELIVERY_DROPS.length) {
        return finishJob(DELIVERY_BONUS, `All drops done: $${DELIVERY_PER_DROP * DELIVERY_DROPS.length + DELIVERY_BONUS} total.`);
      }
      const next = DELIVERY_DROPS[job.dropIdx];
      job.dx = next.x;
      job.dz = next.z;
      job.timeLeft = DELIVERY_TIME_PER_DROP;
      job.label = `Deliver the package to ${next.name}`;
      return { stepDone: true, message: `Drop ${job.dropIdx}/${DELIVERY_DROPS.length} done (+$${DELIVERY_PER_DROP}). Next: ${next.name}.` };
    }
    if (job.timeLeft <= 0) return failJob('The delivery window closed.');
    return {};
  }

  function marker() {
    const job = st.active;
    if (!job) return null;
    if (job.kind === 'taxi') {
      if (job.phase === 'pickup') return { x: job.px, z: job.pz, label: job.label };
      return { x: job.dx, z: job.dz, label: job.label, moving: false };
    }
    return { x: job.dx, z: job.dz, label: job.label };
  }
  function stands() {
    return TAXI_STANDS.map((s) => ({ x: s.x, z: s.z, name: s.name }));
  }
  function depot() {
    return { x: DELIVERY_DEPOT.x, z: DELIVERY_DEPOT.z, name: DELIVERY_DEPOT.name };
  }

  function hud() {
    const job = st.active;
    if (!job) {
      return { active: false, jobsDone: st.jobsDone, earned: st.earned };
    }
    const progress = job.kind === 'delivery'
      ? job.dropIdx / DELIVERY_DROPS.length
      : job.phase === 'pickup' ? 0 : 0.5;
    return {
      active: true,
      kind: job.kind,
      label: job.label,
      timeLeft: Math.max(0, Math.ceil(job.timeLeft || 0)),
      fare: job.fare,
      progress,
      jobsDone: st.jobsDone,
      earned: st.earned,
    };
  }

  function reset() {
    st.active = null;
    st.cooldown = 0;
    st.jobsDone = 0;
    st.earned = 0;
  }
  function getSave() {
    return { jobsDone: st.jobsDone, earned: st.earned };
  }
  function loadSave(s) {
    if (!s) return;
    st.jobsDone = s.jobsDone || 0;
    st.earned = s.earned || 0;
  }

  return {
    update,
    marker,
    stands,
    depot,
    hud,
    reset,
    getSave,
    loadSave,
    get active() {
      return st.active;
    },
    get jobsDone() {
      return st.jobsDone;
    },
    get earned() {
      return st.earned;
    },
  };
}

// One line for the job board on the title screen.
export function jobBoardLine(jobs) {
  if (!jobs) return 'Taxi stands and delivery runs pay between story jobs.';
  if (jobs.jobsDone === 0) return 'Taxi stands and delivery runs pay between story jobs.';
  return `${jobs.jobsDone} side job${jobs.jobsDone === 1 ? '' : 's'} done — $${jobs.earned} earned on the side.`;
}
export { CITY, LANDMARK };

// Palm Harbor — story jobs 9–11: the second act.
// After the big score the crew is not done with Rex. Night Run smuggles
// drops under cover of dark, Storm Chase tails a courier through a storm,
// and Harbor Heist ends with a boat escape out to sea. Same step language
// as the first eight jobs (goto / driveTo / collect / deliver / wait / tail
// / escape / boardBoat) with its own compact engine — the first engine
// stops at job 8, this one starts at job 9 and unlocks when job 8 is done.
// Pure logic: no DOM. The world hooks (target car, crates, wanted) are the
// same ones the first engine uses.
import { LANDMARK } from './config.js';

export const MISSIONS2 = [
  {
    title: 'Night Run',
    reward: 800,
    brief: 'Two drops are stashed around town and the crew only moves at night. Wait for dark, grab them, bring them home.',
    steps: [
      { t: 'wait', x: 148, z: -128, r: 8, secs: 5, label: 'Wait for nightfall at the safehouse' },
      { t: 'driveTo', x: 74, z: 148, r: 12, label: 'Drive to the marina under cover of dark' },
      { t: 'collect', points: [[-74, 0], [111, 74]], r: 5, label: 'Collect the drops (0/2)' },
      { t: 'deliver', x: 148, z: -128, r: 8, label: 'Bring it all home' },
    ],
  },
  {
    title: 'Storm Chase',
    reward: 1100,
    brief: 'A courier is running papers through the storm. Tail him without being seen, then shake the heat.',
    steps: [
      { t: 'tail', secs: 60, label: 'Tail the courier through the storm (12–30 m)' },
      { t: 'escape', label: 'Lose the heat completely' },
      { t: 'driveTo', x: -148, z: -74, r: 16, label: 'Get the car resprayed' },
    ],
  },
  {
    title: 'Harbor Heist',
    reward: 1800,
    brief: 'Three crates on the east dock yard, the pier as the handoff — and the only way out is by boat.',
    steps: [
      { t: 'goto', x: 60, z: 210, r: 8, label: 'Get to the east dock yard' },
      { t: 'collect', points: [[60, 205], [86, 205], [134, 202]], r: 5, label: 'Grab the crates (0/3)' },
      { t: 'deliver', x: 0, z: 200, r: 8, label: 'Bring the crates to the pier' },
      { t: 'boardBoat', label: 'Board a boat and get out to sea' },
    ],
  },
];

export function createStory2(world, boats, weather) {
  let idx = 0;
  let stepIdx = 0;
  let stepState = newStepState();
  let done = false;
  // Standby until the first eight jobs are done: main.js arms job 9 then.
  // An unarmed engine answers nothing and stages no sky.
  let armed = false;

  function newStepState() {
    return { t: 0, progress: 0, spottedT: 0, waitT: 0 };
  }
  function activeMission() {
    return MISSIONS2[idx] || null;
  }
  function activeStep() {
    const m = activeMission();
    return m ? m.steps[stepIdx] : null;
  }
  function stageSky() {
    // Each job stages its own sky when it starts.
    if (!weather) return;
    if (idx === 0 && stepIdx === 0) weather.forceNight();
    else if (idx === 1 && stepIdx === 0) weather.forceStorm();
  }
  function armStep() {
    stepState = newStepState();
    const s = activeStep();
    if (!s) return;
    stageSky();
    if (s.t === 'tail') world.spawnTargetCar();
    else if (s.t === 'escape') world.setWanted(3);
    else if (s.t === 'collect') world.setCrates(s.points);
  }

  function startMission(i) {
    armed = true;
    idx = i;
    stepIdx = 0;
    done = idx >= MISSIONS2.length;
    armStep();
  }
  function retryMission() {
    stepIdx = 0;
    armStep();
  }

  function distTo(x, z) {
    const p = world.state.player;
    return Math.hypot(p.x - x, p.z - z);
  }

  function marker() {
    if (!armed) return null;
    const s = activeStep();
    if (!s) return null;
    if (s.t === 'goto' || s.t === 'driveTo' || s.t === 'deliver' || s.t === 'wait') {
      return { x: s.x, z: s.z, label: s.label };
    }
    if (s.t === 'collect') {
      const c = world.state.crates.find((k) => !k.taken);
      return c ? { x: c.x, z: c.z, label: s.label } : null;
    }
    if (s.t === 'tail') {
      const t = world.state.targetCar;
      return t ? { x: t.x, z: t.z, label: s.label, moving: true } : null;
    }
    if (s.t === 'boardBoat') {
      const b = boats && boats.nearestDocked ? boats.nearestDocked() : null;
      return b ? { x: b.x, z: b.z, label: s.label } : { x: 12, z: 248, label: s.label };
    }
    return null;
  }

  function current() {
    if (!armed) return null;
    const m = activeMission();
    if (!m) return null;
    const s = activeStep();
    return {
      mission: m,
      missionIndex: 8 + idx,
      step: s,
      stepIndex: stepIdx,
      progress: stepState.progress,
      objective: s ? s.label : '',
      title: m.title,
    };
  }

  // Advance one frame. Returns { completed, failed, reward, title } when they happen.
  function update(dt) {
    if (!armed) return {};
    const m = activeMission();
    if (!m) return {};
    const s = activeStep();
    if (!s) return {};
    const p = world.state.player;
    stepState.t += dt;
    const out = {};

    const completeStep = () => {
      stepIdx += 1;
      if (stepIdx >= m.steps.length) {
        const reward = m.reward;
        world.state.money += reward;
        idx += 1;
        stepIdx = 0;
        done = idx >= MISSIONS2.length;
        if (weather) weather.release();
        if (!done) armStep();
        out.completed = true;
        out.reward = reward;
        out.title = m.title;
      } else {
        armStep();
        out.stepDone = true;
      }
    };
    const fail = (why) => {
      out.failed = true;
      out.why = why;
      retryMission();
    };

    if (s.t === 'goto' || s.t === 'driveTo' || s.t === 'deliver') {
      if (distTo(s.x, s.z) < s.r) completeStep();
    } else if (s.t === 'enterCar') {
      if (!p.onFoot) completeStep();
    } else if (s.t === 'collect') {
      const taken = world.state.crates.filter((k) => k.taken).length;
      stepState.progress = taken / s.points.length;
      if (taken >= s.points.length) completeStep();
    } else if (s.t === 'wait') {
      if (distTo(s.x, s.z) < s.r) {
        stepState.waitT += dt;
        stepState.progress = Math.min(1, stepState.waitT / s.secs);
        if (stepState.waitT >= s.secs) completeStep();
      } else {
        stepState.waitT = Math.max(0, stepState.waitT - dt * 0.5);
        stepState.progress = Math.min(1, stepState.waitT / s.secs);
      }
    } else if (s.t === 'tail') {
      const t = world.state.targetCar;
      if (!t) {
        fail('The courier is gone.');
        return out;
      }
      const d = distTo(t.x, t.z);
      if (d > 45) {
        fail('You lost the courier.');
        return out;
      }
      if (d < 8) {
        stepState.spottedT += dt;
        if (stepState.spottedT > 2) {
          fail('Spotted! The courier made you.');
          return out;
        }
      } else {
        stepState.spottedT = 0;
      }
      if (d >= 12 && d <= 30) stepState.progress += dt / s.secs;
      if (stepState.progress >= 1) completeStep();
    } else if (s.t === 'escape') {
      stepState.progress = 1 - world.state.wanted / 5;
      if (world.state.wanted === 0) completeStep();
    } else if (s.t === 'boardBoat') {
      const onBoat = boats && boats.isPlayerOnBoat();
      const outToSea = p.z > 240;
      stepState.progress = onBoat ? (outToSea ? 1 : 0.5) : 0;
      if (onBoat && outToSea) completeStep();
    }
    return out;
  }

  return {
    update,
    marker,
    current,
    startMission,
    retryMission,
    get index() {
      return idx;
    },
    get done() {
      return done;
    },
    get armed() {
      return armed;
    },
    getSave() {
      return { mission2: idx, armed };
    },
    loadSave(s) {
      if (s && s.armed) startMission(Math.min(s.mission2 || 0, MISSIONS2.length - 1));
    },
  };
}

// Title-screen line once the first eight jobs are done.
export function story2Line(story2) {
  if (!story2 || story2.done) return 'Free roam — the city stays open.';
  const cur = story2.current();
  return cur ? `Job ${cur.missionIndex + 1}/11: ${cur.title} — ${cur.objective}` : 'Three more jobs wait at the harbor.';
}
export { LANDMARK };

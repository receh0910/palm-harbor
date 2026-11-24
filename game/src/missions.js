// The story engine: eight jobs for Rex Dalton, each a list of steps. Steps are
// data (see config.js): goto / driveTo / pickup / deliver reach a point;
// enterCar gets in a car (or the armored van); collect grabs crates; wait
// holds a spot; tail shadows a courier; escape loses the heat; race runs
// checkpoints against rivals. Completing a job pays cash and saves.
import { MISSIONS } from './config.js';

export function createMissions(world) {
  let idx = 0;
  let stepIdx = 0;
  let stepState = newStepState();
  let done = false;

  function newStepState() {
    return { t: 0, progress: 0, spottedT: 0, waitT: 0 };
  }
  function activeMission() {
    return MISSIONS[idx] || null;
  }
  function activeStep() {
    const m = activeMission();
    return m ? m.steps[stepIdx] : null;
  }

  function armStep() {
    stepState = newStepState();
    const s = activeStep();
    if (!s) return;
    if (s.t === 'tail') world.spawnTargetCar();
    else if (s.t === 'escape') world.setWanted(3);
    else if (s.t === 'race') world.spawnRivals(s.checkpoints);
    else if (s.t === 'collect') world.setCrates(s.points);
    else if (s.t === 'enterCar' && s.van) world.spawnVan();
  }

  function startMission(i) {
    idx = i;
    stepIdx = 0;
    done = idx >= MISSIONS.length;
    armStep();
  }

  function retryMission() {
    stepIdx = 0;
    armStep();
  }

  function marker() {
    const s = activeStep();
    if (!s) return null;
    if (s.t === 'goto' || s.t === 'driveTo' || s.t === 'pickup' || s.t === 'deliver' || s.t === 'wait') {
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
    if (s.t === 'race') {
      const cp = s.checkpoints[stepState.raceCp || 0];
      return cp ? { x: cp[0], z: cp[1], label: s.label } : null;
    }
    if (s.t === 'enterCar' && s.van) {
      const v = world.state.van;
      return v ? { x: v.x, z: v.z, label: s.label } : null;
    }
    if (s.t === 'enterCar') {
      const p = world.state.player;
      return { x: p.x, z: p.z, label: s.label };
    }
    return null;
  }

  function current() {
    const m = activeMission();
    if (!m) return null;
    const s = activeStep();
    return {
      mission: m,
      missionIndex: idx,
      step: s,
      stepIndex: stepIdx,
      progress: stepState.progress,
      objective: s ? s.label : '',
      title: m.title,
    };
  }

  function distTo(x, z) {
    const p = world.state.player;
    return Math.hypot(p.x - x, p.z - z);
  }

  // Advance one frame. Returns { completed, failed, reward, title } (fields set when they happen).
  function update(dt) {
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
        done = idx >= MISSIONS.length;
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

    if (s.t === 'goto' || s.t === 'driveTo' || s.t === 'pickup' || s.t === 'deliver') {
      if (distTo(s.x, s.z) < s.r) completeStep();
    } else if (s.t === 'enterCar') {
      if (!p.onFoot && (!s.van || (world.playerCar() && world.playerCar().kind === 'van'))) completeStep();
    } else if (s.t === 'collect') {
      const taken = world.state.crates.filter((k) => k.taken).length;
      stepState.progress = taken / s.points.length;
      if (taken >= s.points.length) completeStep();
    } else if (s.t === 'wait') {
      if (distTo(s.x, s.z) < s.r) {
        stepState.waitT += dt;
        stepState.progress = Math.min(1, stepState.waitT / s.secs);
        if (stepState.waitT >= s.secs) {
          if (m.title === 'The Getaway') world.setWanted(4);
          completeStep();
        }
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
    } else if (s.t === 'race') {
      const cp = s.checkpoints[stepState.raceCp || 0];
      if (cp && distTo(cp[0], cp[1]) < 10) {
        stepState.raceCp = (stepState.raceCp || 0) + 1;
        stepState.progress = stepState.raceCp / s.checkpoints.length;
        if (stepState.raceCp >= s.checkpoints.length) {
          completeStep();
          return out;
        }
      }
      if (stepState.t > s.par) {
        fail('Out of time — the Vultures took the pot.');
        return out;
      }
      for (const r of world.state.rivals) {
        if ((r.checkpoints || 0) >= s.checkpoints.length) {
          fail('A Vulture finished first.');
          return out;
        }
      }
    }
    return out;
  }

  startMission(0);
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
    getSave() {
      return { mission: idx };
    },
    loadSave(s) {
      startMission(Math.min(s.mission || 0, MISSIONS.length - 1));
    },
  };
}

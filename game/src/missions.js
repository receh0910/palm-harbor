// The story engine: eight jobs for Rex Dalton, each a list of steps. Steps are data (see
// config.js): goto / driveTo / pickup / deliver reach a point; enterCar gets in a car (or the
// armored van); collect grabs crates; wait holds a spot; tail shadows a courier; escape loses
// the heat; race runs checkpoints against rivals. Completing a mission pays cash and saves.
import { MISSIONS } from './config.js';

export function createMissions(world) {
  let missionIndex = 0;
  let stepIndex = 0;
  let st = freshStep();
  let done = false;

  function freshStep() { return { t: 0, progress: 0, spottedT: 0, waitT: 0 }; }
  function mission() { return MISSIONS[missionIndex] || null; }
  function step() { const m = mission(); return m ? m.steps[stepIndex] : null; }

  function setupStep() {
    st = freshStep();
    const s = step();
    if (!s) return;
    if (s.t === 'tail') world.spawnTargetCar();
    else if (s.t === 'escape') world.setWanted(3);
    else if (s.t === 'race') world.spawnRivals(s.checkpoints);
    else if (s.t === 'collect') world.setCrates(s.points);
    else if (s.t === 'enterCar' && s.van) world.spawnVan();
  }

  function startMission(i) {
    missionIndex = i;
    stepIndex = 0;
    done = missionIndex >= MISSIONS.length;
    setupStep();
  }

  function retryMission() { stepIndex = 0; setupStep(); }

  function marker() {
    const s = step();
    if (!s) return null;
    if (s.t === 'goto' || s.t === 'driveTo' || s.t === 'pickup' || s.t === 'deliver' || s.t === 'wait') return { x: s.x, z: s.z, label: s.label };
    if (s.t === 'collect') {
      const c = world.state.crates.find((k) => !k.taken);
      return c ? { x: c.x, z: c.z, label: s.label } : null;
    }
    if (s.t === 'tail') {
      const t = world.state.targetCar;
      return t ? { x: t.x, z: t.z, label: s.label, moving: true } : null;
    }
    if (s.t === 'race') {
      const cp = s.checkpoints[st.raceCp || 0];
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
    const m = mission();
    if (!m) return null;
    const s = step();
    return { mission: m, missionIndex, step: s, stepIndex, progress: st.progress, objective: s ? s.label : '', title: m.title };
  }

  function distTo(x, z) {
    const p = world.state.player;
    return Math.hypot(p.x - x, p.z - z);
  }

  // Advance one frame. Returns { completed, failed, reward, title } (fields set when they happen).
  function update(dt) {
    const m = mission();
    if (!m) return {};
    const s = step();
    if (!s) return {};
    const p = world.state.player;
    st.t += dt;
    const out = {};

    const completeStep = () => {
      stepIndex += 1;
      if (stepIndex >= m.steps.length) {
        const reward = m.reward;
        world.state.money += reward;
        missionIndex += 1;
        stepIndex = 0;
        done = missionIndex >= MISSIONS.length;
        if (!done) setupStep();
        out.completed = true; out.reward = reward; out.title = m.title;
      } else {
        setupStep();
        out.stepDone = true;
      }
    };
    const fail = (why) => { out.failed = true; out.why = why; retryMission(); };

    if (s.t === 'goto' || s.t === 'driveTo' || s.t === 'pickup' || s.t === 'deliver') {
      if (distTo(s.x, s.z) < s.r) completeStep();
    } else if (s.t === 'enterCar') {
      if (!p.onFoot && (!s.van || (world.playerCar() && world.playerCar().kind === 'van'))) completeStep();
    } else if (s.t === 'collect') {
      const taken = world.state.crates.filter((k) => k.taken).length;
      st.progress = taken / s.points.length;
      if (taken >= s.points.length) completeStep();
    } else if (s.t === 'wait') {
      if (distTo(s.x, s.z) < s.r) {
        st.waitT += dt;
        st.progress = Math.min(1, st.waitT / s.secs);
        if (st.waitT >= s.secs) {
          if (m.title === 'The Getaway') world.setWanted(4);
          completeStep();
        }
      } else {
        st.waitT = Math.max(0, st.waitT - dt * 0.5);
        st.progress = Math.min(1, st.waitT / s.secs);
      }
    } else if (s.t === 'tail') {
      const t = world.state.targetCar;
      if (!t) { fail('The courier is gone.'); return out; }
      const d = distTo(t.x, t.z);
      if (d > 45) { fail('You lost the courier.'); return out; }
      if (d < 8) {
        st.spottedT += dt;
        if (st.spottedT > 2) { fail('Spotted! The courier made you.'); return out; }
      } else st.spottedT = 0;
      if (d >= 12 && d <= 30) st.progress += dt / s.secs;
      if (st.progress >= 1) completeStep();
    } else if (s.t === 'escape') {
      st.progress = 1 - world.state.wanted / 5;
      if (world.state.wanted === 0) completeStep();
    } else if (s.t === 'race') {
      const cp = s.checkpoints[st.raceCp || 0];
      if (cp && distTo(cp[0], cp[1]) < 10) {
        st.raceCp = (st.raceCp || 0) + 1;
        st.progress = st.raceCp / s.checkpoints.length;
        if (st.raceCp >= s.checkpoints.length) { completeStep(); return out; }
      }
      if (st.t > s.par) { fail('Out of time — the Vultures took the pot.'); return out; }
      for (const r of world.state.rivals) {
        if ((r.checkpoints || 0) >= s.checkpoints.length) { fail('A Vulture finished first.'); return out; }
      }
    }
    return out;
  }

  startMission(0);
  return {
    update, marker, current, startMission, retryMission,
    get index() { return missionIndex; },
    get done() { return done; },
    getSave() { return { mission: missionIndex }; },
    loadSave(s) { startMission(Math.min(s.mission || 0, MISSIONS.length - 1)); },
  };
}

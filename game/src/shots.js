// Screenshot staging: each named shot resets the world, puts the player in a real game
// state, and runs the simulation forward so the frame is a genuine moment of play — never
// a composed mockup. The screenshots are rendered by the same code path as the live game
// (main.js runShot). Driving uses the world's own autopilot (ctl.auto); entering a car
// uses the world's tryEnterCar, exactly as a player would.
import { SCREEN_TITLE, SCREEN_PLAY } from './render.js';
import { LANDMARK } from './config.js';

const STEP = 1 / 60;
// From the safehouse onto the outer ring road, then around the city.
const RING = [[185, -128], [185, 185], [-185, 185], [-185, -185], [185, -185]];

function run(world, missions, seconds, ctl) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    world.step(STEP, ctl || {});
    // The mission only advances when its update runs, just like in the live game.
    if (missions) missions.update(STEP);
  }
}

function driveOff(world, missions, seconds) {
  // The parked car by the safehouse is mission 1's car; get in and drive the ring.
  const st = world.state;
  let car = null, bd = 1e9;
  for (const c of st.cars) {
    if (c.kind !== 'parked' || c.hp <= 0) continue;
    const d = Math.hypot(c.x - 148, c.z + 128);
    if (d < bd) { bd = d; car = c; }
  }
  if (car) {
    st.player.x = car.x - 2.5;
    st.player.z = car.z;
    st.player.angle = Math.atan2(car.x - st.player.x, car.z - st.player.z);
    world.tryEnterCar();
  }
  run(world, missions, seconds, { auto: { type: 'drive', points: RING, idx: 0 } });
}

export function stageShot(name, world, missions) {
  const st = world.state;
  if (name === 'start') {
    world.reset();
    // On the beach road, city ahead, a car parked beside the player.
    st.player.x = 2; st.player.z = 208; st.player.angle = Math.PI;
    const car = st.cars.find((c) => c.kind === 'parked' && c.hp > 0);
    if (car) { car.x = 10; car.z = 204; car.angle = Math.PI; }
    run(world, missions, 3, {});
    return {
      screen: SCREEN_TITLE,
      pose: { pos: [28, 18, 232], look: [0, 8, 60] },
    };
  }
  if (name === 'drive') {
    world.reset();
    driveOff(world, missions, 8);
    return { screen: SCREEN_PLAY, pose: null };
  }
  if (name === 'chase') {
    world.reset();
    driveOff(world, missions, 2);
    world.setWanted(3);
    run(world, missions, 6, { auto: { type: 'drive', points: RING, idx: 0 } });
    return { screen: SCREEN_PLAY, pose: null };
  }
  if (name === 'mission') {
    world.reset();
    missions.startMission(5); // The Getaway: the bank job, beacon by the bank door.
    const bank = LANDMARK.bank;
    st.player.x = bank.x + 4; st.player.z = 26;
    st.player.angle = Math.atan2(bank.x - st.player.x, bank.z - st.player.z);
    run(world, missions, 5, {});
    return { screen: SCREEN_PLAY, pose: null };
  }
  throw new Error(`unknown shot: ${name}`);
}

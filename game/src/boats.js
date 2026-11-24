// Palm Harbor — boats: the harbor fleet you can actually drive.
// Three boats ride at the pier and the east docks. Walk up to a moored boat
// and press E to board; W/S is throttle, A/D steers, and the sea is yours
// from the beach out to z = 410. Boarding only works on foot near a moored
// boat, and leaving drops you back on the nearest pier or dock. The Harbor
// Heist ends with a boat escape, and the world clamps the player to the sea
// while a boat is under them (see world.js, boat guard).
// Pure logic: no DOM. The renderer draws the boats and their bob.
import { CITY, PALETTE } from './config.js';

export const BOAT_DEFS = [
  { x: 12, z: 248, angle: Math.PI, color: 0xe8e8e8, kind: 'speedboat', name: 'Pier Runner' },
  { x: 60, z: 258, angle: Math.PI / 2, color: 0x2e7fa8, kind: 'trawler', name: 'Dock Trawler' },
  { x: 110, z: 252, angle: -Math.PI / 2, color: 0xf1c40f, kind: 'speedboat', name: 'Yellowfin' },
];
export const BOAT_ACCEL = 10;
export const BOAT_MAX_SPEED = 26;
export const BOAT_REVERSE = 6;
export const BOAT_STEER = 0.5;
export const BOAT_TURN = 0.55;
export const BOAT_BOARD_R = 4.5;
export const BOAT_SEA = { x0: -190, x1: 190, z0: 226, z1: 410 };
export const DOCK_STRIPS = [
  { cx: 0, hw: 8 },
  { cx: 60, hw: 8 },
  { cx: 110, hw: 8 },
];

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function createBoats(world) {
  let boats = [];
  let playerBoat = -1;

  function spawnBoats() {
    boats = BOAT_DEFS.map((d, i) => ({
      id: i,
      x: d.x,
      z: d.z,
      angle: d.angle,
      speed: 0,
      hp: 100,
      color: d.color,
      kind: d.kind,
      name: d.name,
      docked: true,
      bob: Math.random() * Math.PI * 2,
    }));
    playerBoat = -1;
  }

  function nearestBoat(x, z, maxD) {
    let best = null;
    let bd = maxD;
    for (const b of boats) {
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  function tryBoard() {
    const p = world.state.player;
    if (!p.onFoot || playerBoat >= 0) return false;
    const b = nearestBoat(p.x, p.z, BOAT_BOARD_R);
    if (!b || !b.docked) return false;
    b.docked = false;
    playerBoat = b.id;
    p.boatId = b.id;
    p.onFoot = false;
    p.carId = -1;
    p.driving = false;
    p.x = b.x;
    p.z = b.z;
    p.angle = b.angle;
    return true;
  }

  function nearestStrip(x) {
    let best = DOCK_STRIPS[0];
    let bd = 1e9;
    for (const s of DOCK_STRIPS) {
      const d = Math.abs(x - s.cx);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  function exitBoat() {
    if (playerBoat < 0) return false;
    const b = boats[playerBoat];
    const p = world.state.player;
    const strip = nearestStrip(b.x);
    // The pier ends at z = 282, the east docks at z = 296: never drop the
    // player past the end of the timber, or the world's bounds clamp yanks
    // them back to the beach on the next step.
    const zMax = strip.cx === 0 ? 280 : 292;
    p.x = clampNum(b.x, strip.cx - strip.hw + 2, strip.cx + strip.hw - 2);
    p.z = clampNum(b.z, 200, zMax);
    p.y = 0;
    p.vy = 0;
    p.onFoot = true;
    p.boatId = -1;
    p.carId = -1;
    p.driving = false;
    b.speed = 0;
    b.docked = true;
    playerBoat = -1;
    return true;
  }

  function isPlayerOnBoat() {
    return playerBoat >= 0;
  }
  function playerBoatObj() {
    return playerBoat >= 0 ? boats[playerBoat] : null;
  }
  function nearestDocked() {
    const p = world.state.player;
    let best = null;
    let bd = 1e9;
    for (const b of boats) {
      if (!b.docked) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }
  function list() {
    return boats;
  }

  function update(dt, ctl) {
    const p = world.state.player;
    for (const b of boats) {
      b.bob += dt * (b.docked ? 0.8 : 1.6);
    }
    if (playerBoat < 0) return;
    const b = boats[playerBoat];
    const throttle = (ctl && ctl.throttle) || 0;
    const steer = (ctl && ctl.steer) || 0;
    const brake = ctl && ctl.brake;
    // A boat handles like a heavy car with no brakes that bite: throttle
    // pushes, drag bleeds speed, steering only turns while moving.
    if (throttle > 0) b.speed += BOAT_ACCEL * throttle * dt;
    else if (throttle < 0) b.speed -= BOAT_ACCEL * 0.6 * dt;
    else b.speed -= Math.sign(b.speed) * 3 * dt;
    if (brake) b.speed -= Math.sign(b.speed) * 8 * dt;
    b.speed = clampNum(b.speed, -BOAT_REVERSE, BOAT_MAX_SPEED);
    if (Math.abs(b.speed) < 0.05 && throttle === 0) b.speed = 0;
    b.angle += steer * BOAT_TURN * dt * Math.min(1, Math.abs(b.speed) / 8) * Math.sign(b.speed || 1);
    b.x += Math.sin(b.angle) * b.speed * dt;
    b.z += Math.cos(b.angle) * b.speed * dt;
    // The sea is bounded: beach at z = 226, open water out to z = 410.
    b.x = clampNum(b.x, BOAT_SEA.x0, BOAT_SEA.x1);
    b.z = clampNum(b.z, BOAT_SEA.z0, BOAT_SEA.z1);
    if (b.z <= BOAT_SEA.z0 + 0.5 && b.speed < 0) b.speed = 0;
    p.x = b.x;
    p.z = b.z;
    p.angle = b.angle;
    p.speed = Math.abs(b.speed);
  }

  function reset() {
    spawnBoats();
    const p = world.state.player;
    p.boatId = -1;
  }
  function getSave() {
    return {
      playerBoat,
      boats: boats.map((b) => ({ x: b.x, z: b.z, angle: b.angle, docked: b.docked })),
    };
  }
  function loadSave(s) {
    if (!s || !Array.isArray(s.boats)) return;
    spawnBoats();
    s.boats.forEach((saved, i) => {
      if (!boats[i] || !saved) return;
      boats[i].x = saved.x;
      boats[i].z = saved.z;
      boats[i].angle = saved.angle;
      boats[i].docked = saved.docked !== false;
    });
    playerBoat = typeof s.playerBoat === 'number' ? s.playerBoat : -1;
    world.state.player.boatId = playerBoat;
  }

  spawnBoats();
  return {
    update,
    tryBoard,
    exitBoat,
    isPlayerOnBoat,
    playerBoatObj,
    nearestDocked,
    list,
    reset,
    getSave,
    loadSave,
    get playerBoat() {
      return playerBoat;
    },
  };
}

// One line for the HUD when the player is afloat.
export function boatHudLine(boats) {
  if (!boats || !boats.isPlayerOnBoat()) return '';
  const b = boats.playerBoatObj();
  if (!b) return '';
  const kmh = Math.round(Math.abs(b.speed) * 3.6);
  return `${b.name} — ${kmh} kn · E to dock`;
}
export { CITY, PALETTE };

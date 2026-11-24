// Palm Harbor's rules and state, with no drawing and no browser in it: the
// city, the player on foot and in a car, traffic, pedestrians, police, wanted
// level, combat, mission hooks and the save. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react without the
// world knowing about screens or sound. Positions are plain {x, z} on the
// ground (y is up); the renderer turns them into meshes.
import {
  CAR, CITY, LANDMARK, LOOPS, MISSIONS, PALETTE, PEDS, PLAYER, STEP, TRAFFIC, WANTED,
} from './config.js';

export const EVENT_HIT = 1;
export const EVENT_BUSTED = 2;
export const EVENT_CRASH = 4;
export const EVENT_SHOT = 8;
export const EVENT_PICKUP = 16;
export const EVENT_CRIME = 32;
export const EVENT_ENTER = 64;
export const EVENT_EXIT = 128;

const TAU = Math.PI * 2;

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function distance2d(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}
function angleDelta(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function pickRandom(rnd, arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

export function createWorld(random) {
  const city = { buildings: [], colliders: [], palms: [], lamps: [], parks: [], docks: [], cranes: [], containers: [] };
  const state = {
    time: 0,
    money: 0,
    wanted: 0,
    lastCrimeT: -999,
    crimeCd: 0,
    shake: 0,
    player: {
      x: 148, z: -128, y: 0, vy: 0, angle: Math.PI, vx: 0, vz: 0, speed: 0,
      health: PLAYER.health, ammo: PLAYER.magSize, reloading: 0, shootCd: 0, meleeCd: 0,
      invuln: 0, lastHurtT: -999, onFoot: true, carId: -1, walkPhase: 0, driving: false,
    },
    cars: [],
    peds: [],
    cops: [],
    crates: [],
    targetCar: null,
    rivals: [],
    van: null,
    mission: 0,
  };
  let carSeq = 0;

  // ---- city generation (deterministic from the seed) ----
  function placeBuilding(x, z, w, d, h, color, kind) {
    city.buildings.push({ x, z, w, d, h, color, kind: kind || 'normal' });
    city.colliders.push({ x, z, hw: w / 2, hd: d / 2 });
  }
  function buildCity() {
    city.buildings.length = 0;
    city.colliders.length = 0;
    city.palms.length = 0;
    city.lamps.length = 0;
    city.parks.length = 0;
    city.docks.length = 0;
    city.cranes.length = 0;
    city.containers.length = 0;
    const C = CITY.centres;
    for (const bx of C) {
      for (const bz of C) {
        if (bx === -74 && bz === 74) {
          city.parks.push({ x: bx, z: bz });
          continue;
        } // plaza park
        if (bx === 0 && bz === 0) {
          placeBuilding(0, 0, 40, 26, 46, '#e8dcc8', 'bank');
          continue;
        }
        if (bx === -148 && bz === 148) {
          placeBuilding(-148, 148, 36, 24, 22, '#f2f2f2', 'hospital');
          continue;
        }
        if (bx === 148 && bz === -148) {
          placeBuilding(148, -148, 30, 20, 10, '#7a8a9a', 'garage');
          continue;
        }
        if (bx === -148 && bz === -74) {
          placeBuilding(-148, -74, 26, 18, 9, '#e07b39', 'spray');
          continue;
        }
        // 2 x 2 sub-plots per block.
        for (const ox of [-15, 15]) {
          for (const oz of [-15, 15]) {
            if (random() < 0.45) continue;
            const w = 18 + random() * 10;
            const d = 18 + random() * 10;
            const h = 10 + random() * 30;
            placeBuilding(bx + ox, bz + oz, w, d, h, pickRandom(random, PALETTE.building), 'normal');
          }
        }
      }
    }
    // Palms along sidewalks and the beach.
    for (let i = 0; i < 46; i += 1) {
      const road = pickRandom(random, CITY.roads);
      const along = -180 + random() * 360;
      const side = random() < 0.5 ? -1 : 1;
      if (random() < 0.5) city.palms.push({ x: road + side * 8.5, z: along, s: 0.9 + random() * 0.5 });
      else city.palms.push({ x: along, z: road + side * 8.5, s: 0.9 + random() * 0.5 });
    }
    for (let x = -180; x <= 180; x += 24) {
      city.palms.push({ x, z: 206 + random() * 10, s: 1 + random() * 0.4 });
    }
    // Lamps at intersections.
    for (const rx of CITY.roads) {
      for (const rz of CITY.roads) {
        if (random() < 0.6) city.lamps.push({ x: rx + 8, z: rz + 8 });
      }
    }
    // East dock yard: container stacks on the beach, three cranes, and two
    // timber docks reaching into the sea. The aisles between the stacks
    // (x 52–68 and 102–118) stay open so the heist crates can be reached,
    // and the docks are walkable (see advancePlayer's dock strips) so the
    // moored boats can be boarded.
    const CONTAINER_COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0xe67e22, 0x8e44ad];
    for (const cx of [44, 72, 100, 128]) {
      for (const cz of [198, 212]) {
        if (random() < 0.25) continue;
        const h = 2.6 + random() * 2.6;
        const color = CONTAINER_COLORS[Math.floor(random() * CONTAINER_COLORS.length)];
        city.containers.push({ x: cx, z: cz, w: 12, d: 6, h, color });
        city.colliders.push({ x: cx, z: cz, hw: 6, hd: 3 });
      }
    }
    for (const cx of [40, 84, 128]) {
      city.cranes.push({ x: cx, z: 226, h: 34 + random() * 8, arm: 26 });
      city.colliders.push({ x: cx, z: 226, hw: 2.5, hd: 2.5 });
    }
    for (const dx of [60, 110]) {
      city.docks.push({ x: dx, z0: 224, z1: 296, w: 10 });
    }
  }

  function nearestRoadPoint(x, z) {
    // Nearest point on a road centreline.
    let best = null;
    let bd = 1e9;
    for (const rx of CITY.roads) {
      const d = Math.abs(x - rx);
      if (d < bd) {
        bd = d;
        best = { x: rx, z };
      }
    }
    for (const rz of CITY.roads) {
      const d = Math.abs(z - rz);
      if (d < bd) {
        bd = d;
        best = { x, z: rz };
      }
    }
    return best;
  }

  function pushOutOfBuildings(x, z, r) {
    // Push a circle out of building AABBs. Returns corrected {x, z} and whether it hit.
    let hit = false;
    for (const c of city.colliders) {
      const cx = clampNum(x, c.x - c.hw, c.x + c.hw);
      const cz = clampNum(z, c.z - c.hd, c.z + c.hd);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // Centre inside the box: push out along the smallest penetration axis.
          const px = c.hw + r - Math.abs(x - c.x);
          const pz = c.hd + r - Math.abs(z - c.z);
          if (px < pz) x = c.x + (x >= c.x ? c.hw + r : -(c.hw + r));
          else z = c.z + (z >= c.z ? c.hd + r : -(c.hd + r));
        }
      }
    }
    return { x, z, hit };
  }

  function newCar(kind, x, z, angle, color, driver) {
    const car = {
      id: carSeq++,
      kind,
      x,
      z,
      angle,
      speed: 0,
      steer: 0,
      color,
      hp: CAR.hp,
      route: null,
      routeIdx: 0,
      routeDir: 1,
      driver: driver || 'traffic',
      targetSpeed: TRAFFIC.speed,
      stuckT: 0,
      smoke: 0,
      honkT: 0,
      ramCd: 0,
    };
    state.cars.push(car);
    return car;
  }

  function populateTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const loop = LOOPS[i % LOOPS.length];
      const pt = loop[Math.floor(random() * loop.length)];
      const car = newCar('traffic', pt[0] + (random() - 0.5) * 4, pt[1] + (random() - 0.5) * 4, random() * TAU, pickRandom(random, PALETTE.car), 'traffic');
      car.route = loop;
      car.routeIdx = Math.floor(random() * loop.length);
      car.routeDir = random() < 0.5 ? 1 : -1;
      car.targetSpeed = TRAFFIC.speed * (0.85 + random() * 0.3);
    }
    // Parked cars along curbs.
    for (let i = 0; i < 10; i += 1) {
      const road = pickRandom(random, CITY.roads);
      const along = -170 + random() * 340;
      const horizontal = random() < 0.5;
      const x = horizontal ? along : road + (random() < 0.5 ? -5.5 : 5.5);
      const z = horizontal ? road + (random() < 0.5 ? -5.5 : 5.5) : along;
      const car = newCar('parked', x, z, horizontal ? 0 : Math.PI / 2, pickRandom(random, PALETTE.car), 'parked');
      car.parked = true;
    }
    // One car right by the safehouse for mission 1.
    newCar('parked', 148, -128, Math.PI / 2, 0xc0392b, 'parked').parked = true;
  }

  function populatePeds() {
    for (let i = 0; i < PEDS.count; i += 1) {
      const road = pickRandom(random, CITY.roads);
      const along = -180 + random() * 360;
      const horizontal = random() < 0.5;
      state.peds.push({
        x: horizontal ? along : road + (random() < 0.5 ? -8 : 8),
        z: horizontal ? road + (random() < 0.5 ? -8 : 8) : along,
        angle: random() * TAU,
        speed: 0,
        state: 'walk',
        hp: 30,
        wx: 0,
        wz: 0,
        waitT: 0,
        color: pickRandom(random, PALETTE.pedCloth),
        skin: pickRandom(random, PALETTE.pedSkin),
        fleeT: 0,
        downT: 0,
        phase: random() * TAU,
      });
      const p = state.peds[state.peds.length - 1];
      const t = nearestRoadPoint(p.x + (random() - 0.5) * 80, p.z + (random() - 0.5) * 80);
      p.wx = t.x;
      p.wz = t.z;
    }
  }

  function resetState() {
    state.time = 0;
    state.money = 0;
    state.wanted = 0;
    state.lastCrimeT = -999;
    state.crimeCd = 0;
    state.shake = 0;
    state.cars.length = 0;
    state.peds.length = 0;
    state.cops.length = 0;
    state.crates.length = 0;
    state.targetCar = null;
    state.rivals.length = 0;
    state.van = null;
    state.mission = 0;
    state.weather = null;
    carSeq = 0;
    const p = state.player;
    p.x = 148;
    p.z = -128;
    p.y = 0;
    p.vy = 0;
    p.angle = Math.PI;
    p.vx = 0;
    p.vz = 0;
    p.speed = 0;
    p.health = PLAYER.health;
    p.ammo = PLAYER.magSize;
    p.reloading = 0;
    p.shootCd = 0;
    p.meleeCd = 0;
    p.invuln = 0;
    p.lastHurtT = -999;
    p.onFoot = true;
    p.carId = -1;
    p.walkPhase = 0;
    p.driving = false;
    p.boatId = -1;
    populateTraffic();
    populatePeds();
  }

  // ---- crimes / wanted ----
  function commitCrime(kind) {
    if (state.crimeCd > 0) return;
    state.crimeCd = 3;
    state.wanted = Math.min(WANTED.max, state.wanted + (WANTED.crime[kind] || 1));
    state.lastCrimeT = state.time;
  }
  function setHeat(n) {
    state.wanted = clampNum(n, 0, WANTED.max);
    state.lastCrimeT = state.time;
  }

  // ---- car enter / exit ----
  function closestCar(maxD, kinds) {
    const p = state.player;
    let best = null;
    let bd = maxD;
    for (const car of state.cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      if (car.driver === 'police') continue;
      if (car.hp <= 0) continue;
      const d = distance2d(p.x, p.z, car.x, car.z);
      if (d < bd) {
        bd = d;
        best = car;
      }
    }
    return best;
  }
  function tryEnterCar() {
    const p = state.player;
    if (!p.onFoot) return 0;
    const car = closestCar(4.5);
    if (!car) return 0;
    if (car.driver === 'traffic') {
      // The driver bails and runs.
      const d = car;
      state.peds.push({
        x: d.x + 2, z: d.z + 2, angle: random() * TAU, speed: 0, state: 'flee', hp: 30,
        wx: d.x + 30, wz: d.z + 30, waitT: 0, color: 0xdddddd, skin: 0xe8b88a,
        fleeT: 4, downT: 0, phase: 0,
      });
    }
    car.driver = 'player';
    car.parked = false;
    car.speed = 0;
    p.onFoot = false;
    p.carId = car.id;
    p.driving = true;
    commitCrime('steal');
    return EVENT_ENTER;
  }
  function exitCar() {
    const p = state.player;
    if (p.onFoot) return 0;
    const car = state.cars.find((c) => c.id === p.carId);
    if (car) {
      car.driver = 'parked';
      car.parked = true;
      car.speed = 0;
    }
    p.onFoot = true;
    p.carId = -1;
    p.driving = false;
    if (car) {
      p.x = car.x + Math.sin(car.angle + Math.PI / 2) * 3;
      p.z = car.z + Math.cos(car.angle + Math.PI / 2) * 3;
    }
    return EVENT_EXIT;
  }
  function playerCar() {
    return state.cars.find((c) => c.id === state.player.carId) || null;
  }

  // ---- combat ----
  function shoot(dirX, dirZ) {
    const p = state.player;
    if (!p.onFoot || p.ammo <= 0 || p.reloading > 0 || p.shootCd > 0) return 0;
    p.ammo -= 1;
    p.shootCd = PLAYER.shootCd;
    const range = 60;
    let best = null;
    let bd = range;
    const hitList = [];
    for (const ped of state.peds) {
      if (ped.state !== 'down') hitList.push({ kind: 'ped', e: ped, x: ped.x, z: ped.z, r: 1 });
    }
    for (const cop of state.cops) hitList.push({ kind: 'cop', e: cop, x: cop.x, z: cop.z, r: 1 });
    for (const car of state.cars) {
      if (car.hp > 0 && car.id !== p.carId) hitList.push({ kind: 'car', e: car, x: car.x, z: car.z, r: 2.4 });
    }
    for (const h of hitList) {
      const dx = h.x - p.x;
      const dz = h.z - p.z;
      const along = dx * dirX + dz * dirZ;
      if (along < 0 || along > bd) continue;
      const perp = Math.abs(dx * dirZ - dz * dirX);
      if (perp < h.r + 0.4) {
        bd = along;
        best = h;
      }
    }
    if (best) {
      if (best.kind === 'car') {
        best.e.hp -= PLAYER.pistolDmg;
        if (best.e.hp <= 0) {
          best.e.smoke = 1;
          if (best.e.driver === 'police') commitCrime('damageCopCar');
        }
      } else {
        best.e.hp -= PLAYER.pistolDmg;
        if (best.e.hp <= 0) {
          if (best.kind === 'ped') {
            best.e.state = 'down';
            best.e.downT = 15;
            commitCrime('shoot');
          } else {
            state.cops.splice(state.cops.indexOf(best.e), 1);
            commitCrime('killCop');
          }
        } else if (best.kind === 'ped') {
          best.e.state = 'flee';
          best.e.fleeT = 3;
        }
      }
    }
    commitCrime('shoot');
    return EVENT_SHOT;
  }
  function melee() {
    const p = state.player;
    if (!p.onFoot || p.meleeCd > 0) return 0;
    p.meleeCd = 0.5;
    const fx = Math.sin(p.angle);
    const fz = Math.cos(p.angle);
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      if (Math.hypot(dx, dz) < PLAYER.meleeRange && dx * fx + dz * fz > 0) {
        ped.hp -= PLAYER.meleeDmg;
        if (ped.hp <= 0) {
          ped.state = 'down';
          ped.downT = 15;
          commitCrime('shoot');
        } else {
          ped.state = 'flee';
          ped.fleeT = 3;
        }
        return EVENT_HIT;
      }
    }
    for (const cop of state.cops) {
      const dx = cop.x - p.x;
      const dz = cop.z - p.z;
      if (Math.hypot(dx, dz) < PLAYER.meleeRange && dx * fx + dz * fz > 0) {
        cop.hp -= PLAYER.meleeDmg;
        if (cop.hp <= 0) {
          state.cops.splice(state.cops.indexOf(cop), 1);
          commitCrime('killCop');
        }
        return EVENT_HIT;
      }
    }
    return 0;
  }
  function damagePlayer(n) {
    const p = state.player;
    if (p.invuln > 0) return 0;
    p.health -= n;
    p.invuln = PLAYER.invuln;
    p.lastHurtT = state.time;
    state.shake = Math.min(1, state.shake + 0.5);
    return p.health <= 0 ? EVENT_BUSTED : EVENT_HIT;
  }
  function respawn() {
    const p = state.player;
    p.health = PLAYER.health;
    state.money = Math.floor(state.money * 0.85);
    p.x = LANDMARK.hospital.x;
    p.z = LANDMARK.hospital.z + 20;
    p.y = 0;
    p.vy = 0;
    p.angle = 0;
    p.vx = 0;
    p.vz = 0;
    p.speed = 0;
    p.onFoot = true;
    p.carId = -1;
    p.driving = false;
    p.ammo = PLAYER.magSize;
    setHeat(0);
    state.cops.length = 0;
    for (const car of state.cars) if (car.driver === 'police') car.driver = 'parked';
  }

  // ---- mission hooks ----
  function setCrates(points) {
    state.crates = points.map(([x, z]) => ({ x, z, taken: false }));
  }
  function spawnTargetCar() {
    if (state.targetCar) return state.targetCar;
    const car = newCar('target', 37, 37, 0, 0xf39c12, 'target');
    car.route = LOOPS[0];
    car.routeIdx = 0;
    car.routeDir = 1;
    car.targetSpeed = 11;
    state.targetCar = car;
    return car;
  }
  function spawnRivals(checkpoints) {
    if (state.rivals.length) return state.rivals;
    const colors = [0x8e44ad, 0x16a085, 0xe67e22];
    for (let i = 0; i < 3; i += 1) {
      const car = newCar('rival', -111 + i * 3, -111, 0, colors[i], 'rival');
      car.route = checkpoints;
      car.routeIdx = 0;
      car.routeDir = 1;
      car.targetSpeed = 15 + i * 1.5;
      car.checkpoints = 0;
      state.rivals.push(car);
    }
    return state.rivals;
  }
  function spawnVan() {
    if (state.van) return state.van;
    const van = newCar('van', 0, -14, Math.PI, 0x5a6a7a, 'parked');
    van.parked = true;
    state.van = van;
    return van;
  }

  // ---- police ----
  function balancePolice() {
    const want = WANTED.policeCars[state.wanted] || 0;
    let have = 0;
    for (const car of state.cars) if (car.driver === 'police') have += 1;
    const p = state.player;
    if (have < want) {
      // Spawn on a road 60-90 units away.
      for (let tries = 0; tries < 12; tries += 1) {
        const a = random() * TAU;
        const d = 60 + random() * 30;
        const x = p.x + Math.sin(a) * d;
        const z = p.z + Math.cos(a) * d;
        const pt = nearestRoadPoint(clampNum(x, -185, 185), clampNum(z, -185, 185));
        if (distance2d(pt.x, pt.z, p.x, p.z) > 45) {
          const car = newCar('police', pt.x, pt.z, random() * TAU, PALETTE.police, 'police');
          car.targetSpeed = 26;
          break;
        }
      }
    } else if (have > want) {
      for (const car of state.cars) {
        if (car.driver === 'police' && distance2d(car.x, car.z, p.x, p.z) > 90) {
          car.driver = 'parked';
          car.speed = 0;
          break;
        }
      }
    }
  }

  // ---- per-step updates ----
  function advancePlayer(dt, ctl) {
    const p = state.player;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.shootCd > 0) p.shootCd -= dt;
    if (p.meleeCd > 0) p.meleeCd -= dt;
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) p.ammo = PLAYER.magSize;
    }
    if (state.crimeCd > 0) state.crimeCd -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2);
    if (state.time - p.lastHurtT > PLAYER.regenDelay && p.health > 0 && p.health < PLAYER.health) {
      p.health = Math.min(PLAYER.health, p.health + PLAYER.regen * dt);
    }
    if (p.onFoot) {
      const mx = ctl.mx || 0;
      const mz = ctl.mz || 0;
      const len = Math.hypot(mx, mz);
      const sp = ctl.run ? PLAYER.run : PLAYER.walk;
      if (len > 0.01) {
        const nx = mx / len;
        const nz = mz / len;
        p.vx += nx * PLAYER.accel * dt;
        p.vz += nz * PLAYER.accel * dt;
        p.angle = Math.atan2(nx, nz);
        p.walkPhase += dt * sp * 1.6;
      } else {
        const f = Math.max(0, 1 - PLAYER.friction * dt / 10);
        p.vx *= f;
        p.vz *= f;
      }
      const v = Math.hypot(p.vx, p.vz);
      if (v > sp) {
        p.vx *= sp / v;
        p.vz *= sp / v;
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.speed = Math.hypot(p.vx, p.vz);
      // Jump / gravity.
      if (ctl.jump && p.y === 0) p.vy = PLAYER.jump;
      p.vy -= PLAYER.gravity * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      if (p.y === 0) p.vy = 0;
      // World bounds (pier and the east docks let the player walk out over the sea).
      const onPier = p.x > -8 && p.x < 8 && p.z > CITY.beachZ0 && p.z < 282;
      const onDock = (p.x > 52 && p.x < 68 && p.z > CITY.beachZ0 && p.z < 300)
        || (p.x > 102 && p.x < 118 && p.z > CITY.beachZ0 && p.z < 300);
      p.x = clampNum(p.x, -CITY.half - 8, CITY.half + 8);
      p.z = clampNum(p.z, -CITY.half - 8, onPier ? 282 : onDock ? 300 : CITY.beachZ1);
      const c = pushOutOfBuildings(p.x, p.z, PLAYER.radius);
      p.x = c.x;
      p.z = c.z;
    } else {
      if (p.boatId !== undefined && p.boatId >= 0) return; // on a boat: the boat module moves the player
      const car = playerCar();
      if (!car) {
        p.onFoot = true;
        p.carId = -1;
        return;
      }
      advanceCar(car, dt, ctl.throttle || 0, ctl.steer || 0, ctl.brake || false, true);
      p.x = car.x;
      p.z = car.z;
      p.angle = car.angle;
      p.speed = Math.abs(car.speed);
    }
  }

  function advanceCar(car, dt, throttle, steer, brake, isPlayer) {
    const maxF = CAR.maxSpeed * (car.kind === 'police' ? 0.85 : 1) * (car.kind === 'rival' ? 0.75 : 1);
    // Rain makes the roads slick: the weather module publishes state.weather.rain.
    const wetMaxF = maxF * (state.weather && state.weather.rain ? 1 - 0.28 * state.weather.rain : 1);
    if (throttle > 0) car.speed += CAR.accel * throttle * dt;
    else if (throttle < 0) car.speed += (car.speed > 0.5 ? -CAR.brake : CAR.reverse) * dt;
    else car.speed -= Math.sign(car.speed) * CAR.drag * 4 * dt;
    if (brake) car.speed -= Math.sign(car.speed) * CAR.brake * dt;
    car.speed = clampNum(car.speed, -CAR.maxReverse, wetMaxF);
    if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
    const targetSteer = steer * CAR.steer;
    car.steer += clampNum(targetSteer - car.steer, -CAR.steerSpeed * dt, CAR.steerSpeed * dt);
    // Turn rate: tight at low speed (city corners) and stable at high speed.
    // A purely speed-proportional rate gives one fixed turn radius (~26 m), far
    // wider than the roads, so cars could never make a 90-degree corner.
    const turnRate = car.steer * (0.9 * Math.min(1, Math.abs(car.speed) / 6) + 0.05 * Math.abs(car.speed));
    car.angle += turnRate * dt * Math.sign(car.speed);
    // Keep the angle change proportional to speed so slow cars barely turn.
    const fx = Math.sin(car.angle);
    const fz = Math.cos(car.angle);
    // Lateral grip: bleed sideways velocity.
    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;
    car.x = clampNum(car.x, -CITY.half - 6, CITY.half + 6);
    car.z = clampNum(car.z, -CITY.half - 6, CITY.beachZ1);
    const c = pushOutOfBuildings(car.x, car.z, CAR.radius);
    if (c.hit) {
      if (isPlayer && Math.abs(car.speed) > 12) {
        car.hp -= 5;
        car.speed *= 0.4;
        return EVENT_CRASH;
      }
      car.speed *= 0.5;
      car.x = c.x;
      car.z = c.z;
    }
    return 0;
  }

  function advanceTraffic(dt) {
    for (const car of state.cars) {
      if (car.driver === 'player' || car.hp <= 0) continue;
      if (car.driver === 'parked') continue;
      if (car.driver === 'police') continue;
      if (!car.route) continue;
      const target = car.route[car.routeIdx];
      const dx = target[0] - car.x;
      const dz = target[1] - car.z;
      const d = Math.hypot(dx, dz);
      if (d < 7) {
        car.routeIdx = (car.routeIdx + car.routeDir + car.route.length) % car.route.length;
        continue;
      }
      const wantAngle = Math.atan2(dx, dz);
      const diff = angleDelta(wantAngle, car.angle);
      const steer = clampNum(diff * 1.5, -1, 1);
      // Slow for the car ahead.
      let slow = false;
      for (const other of state.cars) {
        if (other === car || other.hp <= 0) continue;
        const ox = other.x - car.x;
        const oz = other.z - car.z;
        const along = ox * Math.sin(car.angle) + oz * Math.cos(car.angle);
        const side = Math.abs(ox * Math.cos(car.angle) - oz * Math.sin(car.angle));
        if (along > 0 && along < TRAFFIC.minGap && side < 4) {
          slow = true;
          break;
        }
      }
      const throttle = slow ? 0 : 1;
      advanceCar(car, dt, throttle, steer, false, false);
      if (car.kind === 'rival' && car.route) {
        // Rivals race through checkpoints: route points are the checkpoints.
        const cp = car.route[car.routeIdx];
        if (cp && distance2d(car.x, car.z, cp[0], cp[1]) < 9) {
          car.checkpoints = (car.checkpoints || 0) + 1;
          car.routeIdx += 1;
        }
      }
    }
  }

  function advancePolice(dt) {
    const p = state.player;
    for (const car of state.cars) {
      if (car.driver !== 'police' || car.hp <= 0) continue;
      const dx = p.x - car.x;
      const dz = p.z - car.z;
      const d = Math.hypot(dx, dz);
      const wantAngle = Math.atan2(dx, dz);
      const diff = angleDelta(wantAngle, car.angle);
      const steer = clampNum(diff * 1.8, -1, 1);
      advanceCar(car, dt, d > 6 ? 1 : 0, steer, false, false);
      car.stuckT = Math.abs(car.speed) < 1 ? car.stuckT + dt : 0;
      if (car.stuckT > 3) {
        const pt = nearestRoadPoint(p.x + (random() - 0.5) * 60, p.z + (random() - 0.5) * 60);
        car.x = pt.x;
        car.z = pt.z;
        car.stuckT = 0;
      }
      // Ram the player's car or the player. A ram has a cooldown: without one
      // the check runs every step while the cars touch, and 12 damage per step
      // wrecks the player's car in under a second.
      if (car.ramCd > 0) car.ramCd -= dt;
      if (d < 4.5) {
        if (!p.onFoot) {
          const pc = playerCar();
          if (pc && pc.hp > 0 && car.ramCd <= 0) {
            pc.hp -= 12;
            car.speed *= 0.4;
            car.ramCd = 1.0;
            if (pc.hp <= 0) pc.smoke = 1;
          }
        } else if (p.invuln === 0) {
          damagePlayer(10);
        }
      }
      // A cop gets out when the player is on foot and the cruiser is close.
      if (p.onFoot && d < 9 && state.cops.length < 2) {
        state.cops.push({ x: car.x + 2, z: car.z + 2, angle: car.angle, speed: 0, hp: 100, punchCd: 0 });
        car.speed = 0;
      }
    }
    // Cops on foot chase and punch.
    for (let i = state.cops.length - 1; i >= 0; i -= 1) {
      const cop = state.cops[i];
      const dx = p.x - cop.x;
      const dz = p.z - cop.z;
      const d = Math.hypot(dx, dz);
      if (d > 60 || state.wanted === 0) {
        state.cops.splice(i, 1);
        continue;
      }
      cop.angle = Math.atan2(dx, dz);
      const sp = 7.5;
      cop.x += Math.sin(cop.angle) * sp * dt;
      cop.z += Math.cos(cop.angle) * sp * dt;
      const c = pushOutOfBuildings(cop.x, cop.z, 0.9);
      cop.x = c.x;
      cop.z = c.z;
      if (cop.punchCd > 0) cop.punchCd -= dt;
      if (d < 1.8 && cop.punchCd <= 0) {
        cop.punchCd = 1;
        damagePlayer(8);
      }
    }
  }

  function advancePeds(dt) {
    const p = state.player;
    const pc = p.onFoot ? null : playerCar();
    for (let i = state.peds.length - 1; i >= 0; i -= 1) {
      const ped = state.peds[i];
      if (ped.state === 'down') {
        ped.downT -= dt;
        if (ped.downT <= 0) state.peds.splice(i, 1);
        continue;
      }
      // Flee from gunfire or a fast car.
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        if (ped.fleeT <= 0) ped.state = 'walk';
      }
      let tx = ped.wx;
      let tz = ped.wz;
      let sp = PEDS.speed;
      if (ped.state === 'flee') {
        sp = PEDS.fleeSpeed;
        tx = ped.x * 2 - p.x;
        tz = ped.z * 2 - p.z;
      }
      const dx = tx - ped.x;
      const dz = tz - ped.z;
      const d = Math.hypot(dx, dz);
      if (d < 2) {
        if (ped.state === 'walk') {
          ped.waitT = 1 + random() * 3;
          const t = nearestRoadPoint(ped.x + (random() - 0.5) * 120, ped.z + (random() - 0.5) * 120);
          ped.wx = t.x;
          ped.wz = t.z;
        }
      } else if (ped.waitT > 0) {
        ped.waitT -= dt;
      } else {
        ped.angle = Math.atan2(dx, dz);
        ped.x += Math.sin(ped.angle) * sp * dt;
        ped.z += Math.cos(ped.angle) * sp * dt;
        ped.phase += dt * sp * 2;
      }
      ped.x = clampNum(ped.x, -CITY.half - 6, CITY.half + 6);
      ped.z = clampNum(ped.z, -CITY.half - 6, CITY.beachZ1);
      const c = pushOutOfBuildings(ped.x, ped.z, 0.8);
      ped.x = c.x;
      ped.z = c.z;
      // Run over by a car.
      if (pc && Math.abs(pc.speed) > 3 && distance2d(ped.x, ped.z, pc.x, pc.z) < 2.6) {
        ped.state = 'down';
        ped.downT = 15;
        ped.hp = 0;
        commitCrime('hitPed');
      }
      // Scared by a fast car nearby.
      if (pc && Math.abs(pc.speed) > 8 && distance2d(ped.x, ped.z, pc.x, pc.z) < 6) {
        ped.state = 'flee';
        ped.fleeT = 2;
      }
    }
    // Keep the crowd topped up. A fresh ped gets a real road waypoint at
    // once, like the opening crowd does — (0, 0) would march it to the bank.
    if (state.peds.length < PEDS.count) {
      const road = pickRandom(random, CITY.roads);
      const along = -180 + random() * 360;
      const horizontal = random() < 0.5;
      const fresh = {
        x: horizontal ? along : road + 8,
        z: horizontal ? road + 8 : along,
        angle: random() * TAU,
        speed: 0,
        state: 'walk',
        hp: 30,
        wx: 0,
        wz: 0,
        waitT: 0,
        color: pickRandom(random, PALETTE.pedCloth),
        skin: pickRandom(random, PALETTE.pedSkin),
        fleeT: 0,
        downT: 0,
        phase: random() * TAU,
      };
      const waypoint = nearestRoadPoint(
        fresh.x + (random() - 0.5) * 80,
        fresh.z + (random() - 0.5) * 80,
      );
      fresh.wx = waypoint.x;
      fresh.wz = waypoint.z;
      state.peds.push(fresh);
    }
  }

  function separateCars() {
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        if (a.hp <= 0 || b.hp <= 0) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = CAR.radius * 2 - 0.6;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          a.x -= nx * push;
          a.z -= nz * push;
          b.x += nx * push;
          b.z += nz * push;
          const rel = Math.abs(a.speed - b.speed);
          if (rel > 10) {
            a.speed *= 0.6;
            b.speed *= 0.6;
          }
        }
      }
    }
    // Wrecked player car: the player is forced out.
    const pc = playerCar();
    if (pc && pc.hp <= 0 && !state.player.onFoot) {
      pc.smoke = 1;
      exitCar();
    }
  }

  function decayWanted(dt) {
    if (state.wanted > 0 && state.time - state.lastCrimeT > WANTED.decaySecs) {
      let near = false;
      for (const car of state.cars) {
        if (car.driver === 'police' && distance2d(car.x, car.z, state.player.x, state.player.z) < WANTED.clearDist) {
          near = true;
          break;
        }
      }
      if (!near && state.cops.length === 0) {
        state.wanted -= 1;
        state.lastCrimeT = state.time;
      }
    }
    balancePolice();
  }

  function collectCrates() {
    const p = state.player;
    let events = 0;
    for (const crate of state.crates) {
      if (!crate.taken && distance2d(p.x, p.z, crate.x, crate.z) < 4) {
        crate.taken = true;
        events |= EVENT_PICKUP;
      }
    }
    return events;
  }

  function step(dt, ctl) {
    state.time += dt;
    let events = 0;
    // Shot autopilot: drive or walk toward a scripted target (used by ?shot=).
    if (ctl.auto) {
      const p = state.player;
      if (ctl.auto.type === 'drive' && !p.onFoot) {
        const car = playerCar();
        if (car) {
          const pts = ctl.auto.points;
          let idx = ctl.auto.idx || 0;
          let t = pts[idx];
          if (Math.hypot(t[0] - car.x, t[1] - car.z) < 12) {
            idx = (idx + 1) % pts.length;
            ctl.auto.idx = idx;
            t = pts[idx];
          }
          // Lookahead: as the car nears a waypoint, aim past it toward the next
          // one, so it starts the turn early instead of overshooting the corner
          // and ending up inside a block against a building.
          let aim = t;
          const d = Math.hypot(t[0] - car.x, t[1] - car.z);
          if (d < 20) {
            const nt = pts[(idx + 1) % pts.length];
            const w = 1 - d / 20;
            aim = [t[0] + (nt[0] - t[0]) * w, t[1] + (nt[1] - t[1]) * w];
          }
          const dx = aim[0] - car.x;
          const dz = aim[1] - car.z;
          const wantAngle = Math.atan2(dx, dz);
          const diff = angleDelta(wantAngle, car.angle);
          // Speed control: crawl through corners and near waypoints, faster on
          // straights. At 34 m/s the car cannot make a 90-degree city corner.
          const nearWp = Math.hypot(t[0] - car.x, t[1] - car.z) < 25;
          const targetSpeed = (Math.abs(diff) > 0.4 || nearWp) ? 8 : 30;
          ctl.throttle = car.speed < targetSpeed ? 1 : 0;
          ctl.brake = car.speed > targetSpeed + 4;
          ctl.steer = clampNum(diff * 2.2, -1, 1);
          // Stuck recovery: if the car is wedged against a building, back up
          // and turn away instead of grinding into the wall.
          if (Math.abs(car.speed) < 0.5) {
            car.stuckT = (car.stuckT || 0) + dt;
            if (car.stuckT > 2) {
              ctl.throttle = -1;
              ctl.steer = -Math.sign(diff || 1);
              ctl.brake = false;
              if (car.stuckT > 3.5) car.stuckT = 0;
            }
          } else {
            car.stuckT = 0;
          }
        }
      } else if (ctl.auto.type === 'walk' && p.onFoot) {
        const dx = ctl.auto.x - p.x;
        const dz = ctl.auto.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.5) {
          ctl.mx = dx / d;
          ctl.mz = dz / d;
          ctl.run = false;
        } else {
          ctl.mx = 0;
          ctl.mz = 0;
        }
      }
    }
    advancePlayer(dt, ctl);
    advanceTraffic(dt);
    advancePolice(dt);
    advancePeds(dt);
    separateCars();
    decayWanted(dt);
    events |= collectCrates();
    const pc = playerCar();
    if (pc && pc.hp <= 0 && pc.smoke > 0) {
      // A wrecked car smokes for a while, then is towed away.
      pc.smoke += dt;
      if (pc.smoke > 12) {
        pc.hp = CAR.hp;
        pc.smoke = 0;
      }
    }
    return events;
  }

  function getSave() {
    const p = state.player;
    return { money: state.money, health: p.health, x: p.x, z: p.z, angle: p.angle };
  }
  function loadSave(s) {
    const p = state.player;
    state.money = s.money || 0;
    p.health = s.health || PLAYER.health;
    p.x = s.x ?? 148;
    p.z = s.z ?? -128;
    p.angle = s.angle ?? Math.PI;
  }

  buildCity();
  resetState();
  return {
    state,
    city,
    reset: resetState,
    step,
    tryEnterCar,
    exitCar,
    shoot,
    melee,
    reload() {
      const p = state.player;
      if (p.onFoot && p.ammo < PLAYER.magSize && p.reloading <= 0) p.reloading = PLAYER.reloadTime;
    },
    damagePlayer,
    addCrime: commitCrime,
    setWanted: setHeat,
    spawnTargetCar,
    spawnRivals,
    spawnVan,
    setCrates,
    respawn,
    getSave,
    loadSave,
    playerCar,
    nearestCar: closestCar,
    roadPoint: nearestRoadPoint,
    missionIndex: () => state.mission,
    setMissionIndex(i) { state.mission = i; },
  };
}

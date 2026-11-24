// Drawing only: the world's state in, pixels out. A three.js scene (sun-soaked
// coastal city), a follow camera with drag orbit, the HUD (health, money,
// wanted stars, objective, speed, ammo, minimap) and the marker beacon. The
// renderer owns the camera yaw, which main.js reads to turn keyboard input
// into world-space movement.
import { CITY, PALETTE } from './config.js';
import { fogFactor, weatherLabel } from './weather.js';
import { boatHudLine } from './boats.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';

const TAU = Math.PI * 2;

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeCanvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function paintGround() {
  // World x [-200,200] -> u, z [-200,240] -> v. Roads, sidewalks, lane dashes, crosswalks, beach, park.
  const S = 1024;
  const X0 = -200;
  const Z0 = -200;
  const X1 = 200;
  const Z1 = 240;
  const px = (x) => ((x - X0) / (X1 - X0)) * S;
  const pz = (z) => ((z - Z0) / (Z1 - Z0)) * S;
  return makeCanvasTexture(S, S, (g) => {
    g.fillStyle = PALETTE.sidewalk;
    g.fillRect(0, 0, S, S);
    // Beach sand and the park's grass.
    g.fillStyle = PALETTE.sand;
    g.fillRect(px(-200), pz(CITY.beachZ0), px(200) - px(-200), pz(CITY.beachZ1) - pz(CITY.beachZ0));
    g.fillStyle = PALETTE.grass;
    g.fillRect(px(-104), pz(44), px(-44) - px(-104), pz(104) - pz(44));
    // Asphalt roads.
    g.fillStyle = PALETTE.asphalt;
    for (const r of CITY.roads) {
      g.fillRect(px(r - 7), pz(-200), px(r + 7) - px(r - 7), pz(240) - pz(-200));
      g.fillRect(px(-200), pz(r - 7), px(200) - px(-200), pz(r + 7) - pz(r - 7));
    }
    // Lane dashes.
    g.fillStyle = PALETTE.asphaltLine;
    for (const r of CITY.roads) {
      for (let z = -190; z < 230; z += 16) {
        g.fillRect(px(r - 0.4), pz(z), px(r + 0.4) - px(r - 0.4), pz(z + 8) - pz(z));
      }
      for (let x = -190; x < 190; x += 16) {
        g.fillRect(px(x), pz(r - 0.4), px(x + 8) - px(x), pz(r + 0.4) - pz(r - 0.4));
      }
    }
    // Crosswalks at intersections.
    for (const rx of CITY.roads) {
      for (const rz of CITY.roads) {
        for (let i = -3; i <= 3; i += 1) {
          g.fillRect(px(rx + i * 1.8 - 0.7), pz(rz - 7), px(rx + i * 1.8 + 0.7) - px(rx + i * 1.8 - 0.7), pz(rz - 5.4) - pz(rz - 7));
          g.fillRect(px(rx + i * 1.8 - 0.7), pz(rz + 5.4), px(rx + i * 1.8 + 0.7) - px(rx + i * 1.8 - 0.7), pz(rz + 7) - pz(rz + 5.4));
        }
      }
    }
  });
}

function paintWindows() {
  return makeCanvasTexture(128, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        g.fillStyle = ((row * 7 + col * 3) % 11 === 0) ? '#ffd34d' : '#20242a';
        g.fillRect(8 + col * 18, 8 + row * 18, 10, 12);
      }
    }
  });
}

function paintSign(text, bg, fg) {
  return makeCanvasTexture(256, 64, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = fg;
    g.font = 'bold 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
  });
}

function buildPerson(shirt, pants, skin) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legGeo = new THREE.BoxGeometry(0.22, 0.55, 0.22);
  legGeo.translate(0, -0.27, 0);
  const armGeo = new THREE.BoxGeometry(0.18, 0.55, 0.18);
  armGeo.translate(0, -0.27, 0);
  const legL = new THREE.Mesh(legGeo, mat(pants));
  legL.position.set(-0.14, 0.55, 0);
  const legR = new THREE.Mesh(legGeo, mat(pants));
  legR.position.set(0.14, 0.55, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.78, 0.42), mat(shirt));
  torso.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), mat(skin));
  head.position.y = 1.62;
  const armL = new THREE.Mesh(armGeo, mat(shirt));
  armL.position.set(-0.46, 1.32, 0);
  const armR = new THREE.Mesh(armGeo, mat(shirt));
  armR.position.set(0.46, 1.32, 0);
  g.add(legL, legR, torso, head, armL, armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

function buildCarMesh(color, kind) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const glass = new THREE.MeshLambertMaterial({ color: 0x223344 });
  const bodyH = kind === 'van' ? 1.5 : 0.7;
  const bodyL = kind === 'van' ? 5.4 : 4.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, bodyH, bodyL), mat(color));
  body.position.y = kind === 'van' ? 1.0 : 0.6;
  body.castShadow = true;
  g.add(body);
  if (kind !== 'van') {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 2.2), glass);
    cabin.position.set(0, 1.22, -0.25);
    cabin.castShadow = true;
    g.add(cabin);
  } else {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.3, 5.0), mat(0xf2f2f2));
    stripe.position.y = 1.35;
    g.add(stripe);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = mat(0x181818);
  for (const [x, z] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.42, z);
    g.add(w);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0x554411 });
  for (const x of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    h.position.set(x, 0.62, bodyL / 2 + 0.01);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), mat(0xcc2222));
    t.position.set(x, 0.62, -bodyL / 2 - 0.01);
    g.add(t);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 0.5), mat(0x111111));
    bar.position.set(0, 1.62, -0.25);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.52), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 }));
    red.position.set(-0.33, 1.62, -0.25);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.52), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0000aa }));
    blue.position.set(0.33, 1.62, -0.25);
    g.add(blue);
    g.userData.policeLights = { red, blue };
  }
  return g;
}

  // Drivable boats: a speedboat hull with a windshield, a trawler with a
  // cabin and a mast. The two decorative boats by the pier use the local
  // boat() builder below; these are the ones the player can board.
  function buildBoatMesh(color, kind) {
    const g = new THREE.Group();
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 8.5), mat(color));
    hull.position.y = 0.5;
    hull.castShadow = true;
    g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.4, 4), mat(color));
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.5, 5.2);
    g.add(bow);
    if (kind === 'trawler') {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 3), mat(0xf2f2f2));
      cabin.position.set(0, 1.7, -1.2);
      cabin.castShadow = true;
      g.add(cabin);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6, 6), mat(0x8a6a42));
      mast.position.set(0, 4.2, 0.6);
      g.add(mast);
    } else {
      const shield = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.3), new THREE.MeshLambertMaterial({ color: 0x223344 }));
      shield.position.set(0, 1.4, 1.6);
      g.add(shield);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.6), mat(0x2c3e50));
      seat.position.set(0, 1.1, -0.6);
      g.add(seat);
    }
    return g;
  }

export function createRenderer(canvas, world, missions) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 160, 720);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.15);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 800;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.75));

  // ---- static city ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 440),
    new THREE.MeshLambertMaterial({ map: paintGround() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 20);
  ground.receiveShadow = true;
  scene.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 220),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.92 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, 224 + 110);
  scene.add(sea);

  const winTex = paintWindows();
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b5a4a });
  for (const b of world.city.buildings) {
    const tex = winTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(b.w / 9)), Math.max(1, Math.round(b.h / 9)));
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.h, b.d),
      new THREE.MeshLambertMaterial({ color: b.color, map: tex }),
    );
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.92, 0.6, b.d * 0.92), roofMat);
    roof.position.set(b.x, b.h + 0.3, b.z);
    scene.add(roof);
    if (b.kind === 'bank') {
      for (const cx of [-14, -5, 5, 14]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 12, 10), new THREE.MeshLambertMaterial({ color: 0xf2ede2 }));
        col.position.set(b.x + cx, 6, b.z + b.d / 2 + 1);
        scene.add(col);
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), new THREE.MeshLambertMaterial({ map: paintSign('BANK', '#1e3a5f', '#ffd34d') }));
      sign.position.set(b.x, b.h + 4, b.z + b.d / 2 + 0.2);
      scene.add(sign);
    } else if (b.kind === 'hospital') {
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshLambertMaterial({ map: paintSign('+', '#ffffff', '#cc2222') }));
      cross.position.set(b.x, b.h + 2, b.z + b.d / 2 + 0.2);
      scene.add(cross);
    } else if (b.kind === 'garage') {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshLambertMaterial({ map: paintSign('GARAGE', '#2c3e50', '#ffd34d') }));
      sign.position.set(b.x, 6, b.z + b.d / 2 + 0.2);
      scene.add(sign);
    } else if (b.kind === 'spray') {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshLambertMaterial({ map: paintSign('SPRAY', '#e07b39', '#ffffff') }));
      sign.position.set(b.x, 5, b.z + b.d / 2 + 0.2);
      scene.add(sign);
    }
  }

  // Palms, lamps, pier, boats, clouds.
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
  const leafGeo = new THREE.ConeGeometry(2.6, 3.4, 6);
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  for (const p of world.city.palms) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(p.x, 3.5 * p.s, p.z);
    trunk.scale.setScalar(p.s);
    trunk.castShadow = true;
    const crown = new THREE.Mesh(leafGeo, leafMat);
    crown.position.set(p.x, (7 + 1.2) * p.s, p.z);
    crown.scale.set(p.s, p.s * 0.7, p.s);
    crown.castShadow = true;
    scene.add(trunk, crown);
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: PALETTE.lampPole });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0x332200 });
  for (const l of world.city.lamps) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(l.x, 3, l.z);
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), lampMat);
    head.position.set(l.x, 6.1, l.z);
    scene.add(head);
  }
  // Pier: wooden deck into the sea + posts + two boats.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  for (let z = 196; z < 280; z += 4) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 3.6), pierMat);
    plank.position.set(0, 0.4, z);
    plank.receiveShadow = true;
    scene.add(plank);
  }
  for (const [x, z] of [[-7, 200], [7, 200], [-7, 240], [7, 240], [-7, 276], [7, 276]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4, 8), pierMat);
    post.position.set(x, 0.5, z);
    scene.add(post);
  }
  // East dock yard: container stacks, cranes and two timber docks.
  for (const c of world.city.containers) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), new THREE.MeshLambertMaterial({ color: c.color }));
    box.position.set(c.x, c.h / 2, c.z);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
  }
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
  const craneDark = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  for (const cr of world.city.cranes) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2, cr.h, 2), craneDark);
    leg.position.set(cr.x, cr.h / 2, cr.z);
    leg.castShadow = true;
    scene.add(leg);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(cr.arm, 1.2, 1.2), craneMat);
    jib.position.set(cr.x + cr.arm / 2 - 4, cr.h, cr.z);
    scene.add(jib);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), craneMat);
    cab.position.set(cr.x, cr.h - 1.5, cr.z);
    scene.add(cab);
  }
  for (const d of world.city.docks) {
    for (let z = d.z0; z < d.z1; z += 4) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(d.w, 0.5, 3.6), pierMat);
      plank.position.set(d.x, 0.4, z);
      plank.receiveShadow = true;
      scene.add(plank);
    }
  }
  function boat(x, z, color) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 10), new THREE.MeshLambertMaterial({ color }));
    hull.position.y = 0.4;
    g.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 3), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    cabin.position.set(0, 1.6, -1);
    g.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 7, 6), pierMat);
    mast.position.set(0, 4.5, 0.5);
    g.add(mast);
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }
  const boats = [boat(-22, 250, 0xe8e8e8), boat(24, 262, 0x2e7fa8)];
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 6; i += 1) {
    const c = new THREE.Group();
    for (let j = 0; j < 3; j += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(6 + j * 2, 8, 6), cloudMat);
      s.position.set(j * 7 - 7, j * 0.8, j * 2 - 2);
      s.scale.y = 0.45;
      c.add(s);
    }
    c.position.set(-240 + i * 90, 90 + (i % 3) * 14, -180 + (i % 2) * 120);
    scene.add(c);
    clouds.push(c);
  }
  // Rain: a sheet of falling drops around the player, shown only while the
  // weather module reports rain. Positions recycle from the top.
  const RAIN_DROPS = 500;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_DROPS * 3);
  for (let i = 0; i < RAIN_DROPS; i += 1) {
    rainPos[i * 3] = (Math.random() - 0.5) * 120;
    rainPos[i * 3 + 1] = Math.random() * 40;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xaaccee, size: 0.35, transparent: true, opacity: 0.5 }));
  rain.visible = false;
  rain.frustumCulled = false;
  scene.add(rain);

  // ---- dynamic entities ----
  const playerFig = buildPerson(PALETTE.playerShirt, PALETTE.playerPants, 0xe8b88a);
  playerFig.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  scene.add(playerFig);
  const carMeshes = new Map();
  const pedMeshes = new Map();
  const copMeshes = new Map();
  const crateMeshes = new Map();
  const boatMeshes = new Map();

  const beaconMat = new THREE.MeshBasicMaterial({ color: PALETTE.beacon, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 34, 12, 1, true), beaconMat);
  scene.add(beacon);
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), new THREE.MeshLambertMaterial({ color: PALETTE.marker, emissive: 0x664400 }));
  scene.add(diamond);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 24), new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);

  // ---- HUD ----
  const el = (id) => document.getElementById(id);
  const hud = {
    healthFill: el('health-fill'),
    healthText: el('health-text'),
    money: el('money'),
    stars: el('stars'),
    objTitle: el('obj-title'),
    objText: el('obj-text'),
    objFill: el('obj-fill'),
    speed: el('speed'),
    ammo: el('ammo'),
    crosshair: el('crosshair'),
    vignette: el('vignette'),
    toast: el('toast'),
    minimap: el('minimap'),
    weatherText: el('weather-text'),
    jobPanel: el('job-panel'),
    jobText: el('job-text'),
    jobFill: el('job-fill'),
    boatInfo: el('boat-info'),
  };
  const mm = hud.minimap ? hud.minimap.getContext('2d') : null;
  let lastHud = { hp: -1, money: -1, stars: -1, obj: '', ammo: -1, speed: -1 };

  // ---- camera ----
  let camYaw = Math.PI;
  let yawOffset = 0;
  let pitchOffset = 0;
  let camDist = 10;
  const camPos = new THREE.Vector3(148, 30, -90);
  let titleAngle = 0;
  // Optional live systems the game wires in after creation (weather, side
  // jobs, story part 2, boats). Null until main.js calls setExtras().
  let extras = null;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function applyLook(dx, dy) {
    yawOffset -= dx * 0.004;
    pitchOffset = clampNum(pitchOffset + dy * 0.003, -0.25, 0.5);
  }
  function applyZoom(d) {
    camDist = clampNum(camDist + d * 0.01, 6, 17);
  }

  function drawMinimap() {
    if (!mm) return;
    const S = 200;
    const s = S / 480;
    const ox = 200;
    const oz = 200;
    const mx = (x) => (x + ox) * s;
    const mz = (z) => (z + oz) * s;
    mm.fillStyle = '#10141a';
    mm.fillRect(0, 0, S, S);
    mm.fillStyle = '#1e5f86';
    mm.fillRect(0, mz(CITY.beachZ0), S, S - mz(CITY.beachZ0));
    mm.fillStyle = '#e8d29a';
    mm.fillRect(0, mz(CITY.beachZ0), S, mz(CITY.beachZ1) - mz(CITY.beachZ0));
    mm.fillStyle = '#3a3f46';
    for (const r of CITY.roads) {
      mm.fillRect(mx(r - 7), 0, 14 * s, S);
      mm.fillRect(0, mz(r - 7), S, 14 * s);
    }
    const st = world.state;
    const p = st.player;
    // Mission marker (pulsing).
    const mk = missions.marker();
    if (mk) {
      const pulse = 3 + Math.sin(st.time * 5) * 1.2;
      mm.fillStyle = '#ffd34d';
      mm.beginPath();
      mm.arc(mx(mk.x), mz(mk.z), pulse + 2, 0, TAU);
      mm.fill();
    }
    for (const c of st.crates) {
      if (!c.taken) {
        mm.fillStyle = '#a06a2c';
        mm.fillRect(mx(c.x) - 2, mz(c.z) - 2, 4, 4);
      }
    }
    for (const car of st.cars) {
      if (car.driver === 'police') mm.fillStyle = '#ff4444';
      else if (car.kind === 'target' || car.kind === 'rival') mm.fillStyle = '#ff9f1c';
      else mm.fillStyle = '#c8c8c8';
      mm.fillRect(mx(car.x) - 2, mz(car.z) - 2, 4, 4);
    }
    for (const cop of st.cops) {
      mm.fillStyle = '#ff4444';
      mm.fillRect(mx(cop.x) - 2, mz(cop.z) - 2, 3, 3);
    }
    // Side-job target and taxi stands, drivable boats, story part 2 marker.
    if (extras && extras.sideJobs) {
      const jm = extras.sideJobs.marker();
      if (jm) {
        mm.fillStyle = '#2ecc71';
        mm.beginPath();
        mm.arc(mx(jm.x), mz(jm.z), 5, 0, TAU);
        mm.fill();
      }
      mm.fillStyle = '#f1c40f';
      for (const s of extras.sideJobs.stands()) {
        mm.fillRect(mx(s.x) - 2, mz(s.z) - 2, 4, 4);
      }
    }
    if (extras && extras.boats) {
      mm.fillStyle = '#7fd3ff';
      for (const b of extras.boats.list()) {
        mm.fillRect(mx(b.x) - 2, mz(b.z) - 2, 5, 5);
      }
    }
    if (extras && extras.story2) {
      const mk2 = extras.story2.marker();
      if (mk2) {
        mm.fillStyle = '#ff9f1c';
        mm.beginPath();
        mm.arc(mx(mk2.x), mz(mk2.z), 5, 0, TAU);
        mm.fill();
      }
    }
    // Player arrow.
    mm.save();
    mm.translate(mx(p.x), mz(p.z));
    mm.rotate(Math.atan2(Math.sin(p.angle), -Math.cos(p.angle)));
    mm.fillStyle = '#ffffff';
    mm.beginPath();
    mm.moveTo(0, -6);
    mm.lineTo(4.5, 5);
    mm.lineTo(-4.5, 5);
    mm.closePath();
    mm.fill();
    mm.restore();
  }

  function drawHud(screen) {
    const st = world.state;
    const p = st.player;
    const hp = Math.max(0, Math.round(p.health));
    if (hp !== lastHud.hp) {
      hud.healthFill.style.width = `${hp}%`;
      hud.healthText.textContent = `${hp}`;
      lastHud.hp = hp;
    }
    if (st.money !== lastHud.money) {
      hud.money.textContent = `$${st.money.toLocaleString('en-US')}`;
      lastHud.money = st.money;
    }
    if (st.wanted !== lastHud.stars) {
      hud.stars.textContent = '★'.repeat(st.wanted) + '☆'.repeat(5 - st.wanted);
      hud.stars.classList.toggle('hot', st.wanted > 0);
      lastHud.stars = st.wanted;
    }
    const cur = missions.current();
    const obj = cur ? `${cur.title} — ${cur.objective}` : 'Free roam — the city is yours';
    if (obj !== lastHud.obj) {
      hud.objTitle.textContent = cur ? `Job ${cur.missionIndex + 1}/8: ${cur.title}` : 'Palm Harbor — Free Roam';
      hud.objText.textContent = obj;
      lastHud.obj = obj;
    }
    const prog = cur && cur.progress ? Math.round(cur.progress * 100) : 0;
    hud.objFill.style.width = `${prog}%`;
    const spd = p.onFoot ? Math.round(p.speed * 3.6) : Math.round(Math.abs((world.playerCar() || { speed: 0 }).speed) * 3.6);
    if (spd !== lastHud.speed) {
      hud.speed.textContent = p.onFoot ? '' : `${spd} km/h`;
      lastHud.speed = spd;
    }
    if (p.ammo !== lastHud.ammo) {
      hud.ammo.textContent = p.onFoot ? `Ammo ${p.ammo}/12${p.reloading > 0 ? ' …' : ''}` : '';
      lastHud.ammo = p.ammo;
    }
    hud.crosshair.style.display = (screen === SCREEN_PLAY && p.onFoot) ? 'block' : 'none';
    const hurt = clampNum(1 - (st.time - p.lastHurtT) * 1.2, 0, 1);
    hud.vignette.style.opacity = String(hurt * 0.55);
    // New-system HUD: weather clock, side-job panel, boat speed.
    if (extras && extras.weather && hud.weatherText) {
      hud.weatherText.textContent = weatherLabel(extras.weather.hud());
    }
    if (hud.jobPanel) {
      const job = extras && extras.sideJobs ? extras.sideJobs.hud() : null;
      if (job && job.active) {
        hud.jobPanel.style.display = 'block';
        hud.jobText.textContent = `${job.label}${job.timeLeft ? ` — ${job.timeLeft}s` : ''}`;
        if (hud.jobFill) hud.jobFill.style.width = `${Math.round((job.progress || 0) * 100)}%`;
      } else {
        hud.jobPanel.style.display = 'none';
      }
    }
    if (hud.boatInfo) {
      hud.boatInfo.textContent = extras && extras.boats ? boatHudLine(extras.boats) : '';
    }
  }

  function syncMeshes(t, dt, screen) {
    const st = world.state;
    const p = st.player;
    // Player figure: hidden while driving a boat (the boat carries them).
    playerFig.visible = p.onFoot && !(extras && extras.boats && extras.boats.isPlayerOnBoat());
    if (p.onFoot) {
      playerFig.position.set(p.x, p.y, p.z);
      playerFig.rotation.y = p.angle;
      const swing = Math.sin(p.walkPhase) * (p.speed > 0.5 ? 0.55 : 0);
      playerFig.userData.legL.rotation.x = swing;
      playerFig.userData.legR.rotation.x = -swing;
      playerFig.userData.armL.rotation.x = -swing * 0.8;
      playerFig.userData.armR.rotation.x = swing * 0.8;
    }
    // Cars.
    const seenCars = new Set();
    for (const car of st.cars) {
      seenCars.add(car.id);
      let mesh = carMeshes.get(car.id);
      if (!mesh) {
        mesh = buildCarMesh(car.kind === 'police' ? PALETTE.police : car.kind === 'van' ? 0x5a6a7a : car.color, car.kind);
        carMeshes.set(car.id, mesh);
        scene.add(mesh);
      }
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.angle;
      mesh.visible = car.hp > 0 || car.smoke > 0;
      if (car.kind === 'police' && mesh.userData.policeLights) {
        const flash = Math.floor(t * 4) % 2 === 0;
        mesh.userData.policeLights.red.material.emissive.setHex(flash ? 0xff0000 : 0x330000);
        mesh.userData.policeLights.blue.material.emissive.setHex(flash ? 0x000033 : 0x0000ff);
      }
      if (car.smoke > 0) {
        mesh.position.y = Math.sin(t * 9) * 0.06;
      }
    }
    for (const [id, mesh] of carMeshes) {
      if (!seenCars.has(id)) {
        scene.remove(mesh);
        carMeshes.delete(id);
      }
    }
    // Peds.
    const seenPeds = new Set();
    for (const ped of st.peds) {
      seenPeds.add(ped);
      let mesh = pedMeshes.get(ped);
      if (!mesh) {
        mesh = buildPerson(ped.color, 0x2c3e50, ped.skin);
        mesh.scale.setScalar(0.92);
        pedMeshes.set(ped, mesh);
        scene.add(mesh);
      }
      mesh.position.set(ped.x, 0, ped.z);
      if (ped.state === 'down') {
        mesh.rotation.set(-Math.PI / 2, 0, ped.angle);
      } else {
        mesh.rotation.set(0, ped.angle, 0);
        const swing = Math.sin(ped.phase) * 0.5;
        mesh.userData.legL.rotation.x = swing;
        mesh.userData.legR.rotation.x = -swing;
        mesh.userData.armL.rotation.x = -swing * 0.7;
        mesh.userData.armR.rotation.x = swing * 0.7;
      }
    }
    for (const [ped, mesh] of pedMeshes) {
      if (!seenPeds.has(ped)) {
        scene.remove(mesh);
        pedMeshes.delete(ped);
      }
    }
    // Cops on foot.
    const seenCops = new Set();
    for (const cop of st.cops) {
      seenCops.add(cop);
      let mesh = copMeshes.get(cop);
      if (!mesh) {
        mesh = buildPerson(PALETTE.cop, 0x1a1a22, 0xe8b88a);
        copMeshes.set(cop, mesh);
        scene.add(mesh);
      }
      mesh.position.set(cop.x, 0, cop.z);
      mesh.rotation.y = cop.angle;
    }
    for (const [cop, mesh] of copMeshes) {
      if (!seenCops.has(cop)) {
        scene.remove(mesh);
        copMeshes.delete(cop);
      }
    }
    // Crates.
    const seenCrates = new Set();
    for (const crate of st.crates) {
      if (crate.taken) continue;
      seenCrates.add(crate);
      let mesh = crateMeshes.get(crate);
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshLambertMaterial({ color: 0xa06a2c }));
        mesh.position.set(crate.x, 0.55, crate.z);
        mesh.castShadow = true;
        crateMeshes.set(crate, mesh);
        scene.add(mesh);
      }
    }
    for (const [crate, mesh] of crateMeshes) {
      if (!seenCrates.has(crate)) {
        scene.remove(mesh);
        crateMeshes.delete(crate);
      }
    }
    // Drivable boats (extras.boats): moored boats bob gently, the player's
    // boat heels a little with speed.
    if (extras && extras.boats) {
      const seenBoats = new Set();
      for (const b of extras.boats.list()) {
        seenBoats.add(b.id);
        let mesh = boatMeshes.get(b.id);
        if (!mesh) {
          mesh = buildBoatMesh(b.color, b.kind);
          boatMeshes.set(b.id, mesh);
          scene.add(mesh);
        }
        mesh.position.set(b.x, Math.sin(b.bob) * 0.12, b.z);
        mesh.rotation.y = b.angle;
        mesh.rotation.z = Math.sin(b.bob * 0.7) * 0.02;
        mesh.visible = true;
      }
      for (const [id, mesh] of boatMeshes) {
        if (!seenBoats.has(id)) {
          scene.remove(mesh);
          boatMeshes.delete(id);
        }
      }
    }
    // Marker beacon + diamond.
    const mk = missions.marker();
    const showBeacon = !!mk && screen === SCREEN_PLAY;
    beacon.visible = showBeacon;
    diamond.visible = showBeacon;
    ring.visible = showBeacon;
    if (showBeacon) {
      beacon.position.set(mk.x, 17, mk.z);
      diamond.position.set(mk.x, 7 + Math.sin(t * 2.2) * 0.7, mk.z);
      diamond.rotation.y = t * 1.4;
      ring.position.set(mk.x, 0.15, mk.z);
      const s = 1 + Math.sin(t * 3) * 0.12;
      ring.scale.set(s, s, 1);
    }
    // Clouds drift. Frame-rate independent now: 0.672 world units a second,
    // the same speed as the old per-frame step at 60 fps.
    for (const c of clouds) {
      c.position.x += 0.672 * dt;
      if (c.position.x > 300) c.position.x = -300;
    }
    for (const b of boats) b.position.y = Math.sin(t * 0.8 + b.position.x) * 0.15 - 0.2;
    // Rain falls around the player and recycles from the top of its box.
    if (extras && extras.weather) {
      const w = extras.weather.hud();
      rain.visible = w.rain > 0.05;
      if (rain.visible) {
        rain.position.set(p.x, 0, p.z);
        const fall = 55 * dt;
        for (let i = 0; i < RAIN_DROPS; i += 1) {
          rainPos[i * 3 + 1] -= fall;
          if (rainPos[i * 3 + 1] < 0) {
            rainPos[i * 3 + 1] = 40;
            rainPos[i * 3] = (Math.random() - 0.5) * 120;
            rainPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
          }
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
    } else {
      rain.visible = false;
    }
  }

  function draw(screen, shotPose, dt) {
    const st = world.state;
    const p = st.player;
    const t = st.time;
    syncMeshes(t, dt, screen);
    if (shotPose) {
      camera.position.set(shotPose.pos[0], shotPose.pos[1], shotPose.pos[2]);
      camera.lookAt(shotPose.look[0], shotPose.look[1], shotPose.look[2]);
    } else if (screen === SCREEN_TITLE) {
      titleAngle += dt * 0.045;
      const r = 250;
      const h = 110;
      camera.position.set(Math.sin(titleAngle) * r, h, Math.cos(titleAngle) * r * 0.6 + 40);
      camera.lookAt(0, 8, 0);
      camYaw = Math.atan2(camera.position.x * -1, camera.position.z * -1);
    } else {
      const pc = world.playerCar();
      const tx = p.x;
      const tz = p.z;
      const baseAngle = p.onFoot ? p.angle : (pc ? pc.angle : p.angle);
      yawOffset *= Math.max(0, 1 - dt * 1.4);
      camYaw = baseAngle + Math.PI + yawOffset;
      const dist = p.onFoot ? camDist : camDist + 3;
      const height = p.onFoot ? 3.6 + pitchOffset * 4 : 4.6 + pitchOffset * 4;
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      const wantX = tx + fx * dist;
      const wantZ = tz + fz * dist;
      const wantY = height;
      const k = 1 - Math.exp(-dt * 7);
      camPos.set(lerp(camPos.x, wantX, k), lerp(camPos.y, wantY, k), lerp(camPos.z, wantZ, k));
      const shake = st.shake * 0.5;
      camera.position.set(
        camPos.x + (Math.random() - 0.5) * shake,
        camPos.y + (Math.random() - 0.5) * shake,
        camPos.z + (Math.random() - 0.5) * shake,
      );
      camera.lookAt(tx, 1.6, tz);
    }
    // Weather paints the sky: night darkens it, rain greys it, and the fog
    // closes in with both. The sun dims after dark.
    if (extras && extras.weather) {
      const w = extras.weather.hud();
      const sky = new THREE.Color(PALETTE.sky).lerp(new THREE.Color(0x0e1420), w.night).lerp(new THREE.Color(0x6a7a8a), w.rain * 0.6);
      scene.background.copy(sky);
      scene.fog.color.copy(sky);
      scene.fog.far = 720 * fogFactor(w);
      scene.fog.near = 160 * fogFactor(w);
      sun.intensity = 1.15 * (1 - w.night * 0.75) * (1 - w.rain * 0.35);
    }
    renderer.render(scene, camera);
    drawHud(screen);
    drawMinimap();
  }

  return {
    draw, resize, applyLook, applyZoom, getYaw: () => camYaw - Math.PI,
    setExtras(e) { extras = e; },
    getExtras: () => extras,
  };
}

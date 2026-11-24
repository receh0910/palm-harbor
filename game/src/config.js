// Palm Harbor — one home for every number the game runs on.
// The city grid, the landmarks, how the player and the cars move, what the
// police do, the colours, and all eight jobs with their steps. Nothing here
// talks to the browser: it is plain data, and world.js, render.js and the
// other modules read it. The tuning numbers are load-bearing — the headless
// tests exercise them — so change a value only with a test beside it.
export const STEP = 1 / 60;

export const SAVE_KEY = 'palm-harbor.save.v1';
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// The city is a 5 by 5 grid of 60-metre blocks, roads 14 wide between them.
// Roads run along x = -185, -111, -37, 37, 111, 185 (and the same on z).
// The beach starts at z = 192 and the sea at z = 224, south of the grid.
export const CITY = {
  block: 60,
  road: 14,
  blocks: 5,
  pitch: 74,
  span: 384,
  half: 192,
  roads: [-185, -111, -37, 37, 111, 185],
  centres: [-148, -74, 0, 74, 148],
  beachZ0: 192,
  beachZ1: 224,
  seaZ0: 224,
  seaZ1: 420,
};

export const LANDMARK = {
  garage: { x: 148, z: -148, label: 'Safehouse' },
  bank: { x: 0, z: 0, label: 'Bank' },
  hospital: { x: -148, z: 148, label: 'Hospital' },
  spray: { x: -148, z: -74, label: 'Spray Shop' },
  harbor: { x: 0, z: 268, label: 'Harbor Pier' },
  marina: { x: 74, z: 148, label: 'Marina' },
  plaza: { x: -74, z: 74, label: 'Plaza' },
};

export const PLAYER = {
  walk: 6.5,
  run: 10.5,
  accel: 40,
  friction: 30,
  jump: 9,
  gravity: 26,
  radius: 0.9,
  health: 100,
  regen: 5,
  regenDelay: 8,
  meleeRange: 2.4,
  meleeDmg: 25,
  pistolDmg: 34,
  magSize: 12,
  reloadTime: 1.4,
  shootCd: 0.22,
  invuln: 0.6,
};

export const CAR = {
  accel: 14,
  brake: 26,
  reverse: 8,
  maxSpeed: 34,
  maxReverse: 10,
  steer: 0.55,
  steerSpeed: 2.2,
  drag: 0.35,
  grip: 6,
  radius: 2.3,
  hp: 100,
};

export const TRAFFIC = {
  count: 12,
  speed: 9,
  minGap: 9,
};

export const PEDS = {
  count: 18,
  speed: 1.6,
  fleeSpeed: 3.4,
};

export const WANTED = {
  max: 5,
  decaySecs: 20,
  clearDist: 45,
  // Cruisers on the road for each star count, index = stars.
  policeCars: [0, 1, 2, 3, 4, 5],
  crime: {
    steal: 1,
    hitPed: 1,
    shoot: 1,
    killCop: 1,
    damageCopCar: 1,
  },
};

export const PALETTE = {
  sky: 0x9fd3e8,
  fog: 0xbcd9e8,
  sun: 0xffe3b3,
  hemiSky: 0xbfd9e8,
  hemiGround: 0x8a7a5a,
  asphalt: '#3a3f46',
  asphaltLine: '#c9c9c9',
  sidewalk: '#9aa0a3',
  sand: '#e8d29a',
  sea: 0x2e7fa8,
  seaDeep: 0x1e5f86,
  grass: '#7fae62',
  building: ['#e8dcc8', '#d9a06b', '#7fb3a8', '#c97b6b', '#a8b8c8', '#e0c078', '#8fa8bf', '#d8b4a0'],
  roof: ['#6b5a4a', '#7a6a5a', '#5a6a7a'],
  palmTrunk: 0x8a6a42,
  palmLeaf: 0x3f8f4f,
  lampPole: 0x3a3f46,
  car: [0xc0392b, 0x2980b9, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0x95a5a6, 0x1a1a1a, 0xecf0f1, 0x16a085],
  police: 0x1a1a22,
  policeWhite: 0xf2f2f2,
  taxi: 0xf1c40f,
  pedSkin: [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0],
  pedCloth: [0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0x95a5a6],
  cop: 0x1e3a5f,
  playerShirt: 0xd94f3d,
  playerPants: 0x2c3e50,
  beacon: 0xffd34d,
  marker: 0xffd34d,
  health: '#58d158',
  money: '#ffd34d',
};

// Traffic loops: rectangles along road centrelines, driven either way round.
export const LOOPS = [
  [[37, 37], [37, -37], [-37, -37], [-37, 37]],
  [[111, 111], [111, -111], [-111, -111], [-111, 111]],
  [[185, 185], [185, -185], [-185, -185], [-185, 185]],
  [[-111, 37], [-111, -111], [111, -111], [111, 37]],
];

// The eight jobs. A step is one of: goto | enterCar | driveTo | pickup |
// collect | wait | tail | escape | race | deliver. x/z are world positions,
// r is how close counts as there. All story text is invented.
export const MISSIONS = [
  {
    title: 'First Wheels',
    reward: 150,
    brief: 'Mara needs a wheelman. Take the car parked by the safehouse and bring it to the spray shop.',
    steps: [
      { t: 'goto', x: 148, z: -128, r: 6, label: 'Get to the parked car' },
      { t: 'enterCar', label: 'Take the car with E' },
      { t: 'driveTo', x: -148, z: -74, r: 16, label: 'Drive it to the spray shop' },
    ],
  },
  {
    title: 'The Pickup',
    reward: 250,
    brief: 'Maya is waiting at the plaza. Pick her up and drop her at the marina — no cops, no fuss.',
    steps: [
      { t: 'driveTo', x: -74, z: 74, r: 8, label: 'Drive to the plaza' },
      { t: 'pickup', x: -74, z: 74, r: 5, label: 'Pick up Maya' },
      { t: 'driveTo', x: 74, z: 148, r: 12, label: 'Drop Maya at the marina' },
    ],
  },
  {
    title: 'Hot Cargo',
    reward: 400,
    brief: 'Three crates are stashed around town. Grab them all and bring them to the harbor pier.',
    steps: [
      { t: 'collect', points: [[-148, 0], [74, -74], [0, 148]], r: 5, label: 'Collect the crates (0/3)' },
      { t: 'deliver', x: 0, z: 200, r: 8, label: 'Deliver to the harbor pier' },
    ],
  },
  {
    title: 'Tail the Mark',
    reward: 500,
    brief: 'A courier is driving a loop around the bank block. Stay behind him — close enough to watch, far enough not to be seen.',
    steps: [
      { t: 'tail', secs: 45, label: 'Tail the courier (stay 12–30 m behind)' },
      { t: 'driveTo', x: 148, z: -148, r: 16, label: 'Report back at the safehouse' },
    ],
  },
  {
    title: 'Shake the Heat',
    reward: 600,
    brief: 'The cops are onto you. Lose them — all of them — then get the car resprayed.',
    steps: [
      { t: 'escape', label: 'Lose the wanted level completely' },
      { t: 'driveTo', x: -148, z: -74, r: 16, label: 'Get to the spray shop' },
    ],
  },
  {
    title: 'The Getaway',
    reward: 900,
    brief: 'The bank job. Walk in, grab the bag, and drive to the safehouse while the whole city chases you.',
    steps: [
      { t: 'wait', x: 0, z: 20, r: 8, secs: 6, label: 'Grab the bag (stay by the bank door)' },
      { t: 'deliver', x: 148, z: -128, r: 8, label: 'Escape to the safehouse' },
    ],
  },
  {
    title: 'Harbor Run',
    reward: 1200,
    brief: 'A race across Palm Harbor against three Vulture drivers. Five checkpoints — fastest crew takes the pot.',
    steps: [
      { t: 'race', checkpoints: [[-111, -111], [111, -111], [111, 111], [-111, 111], [0, 185]], par: 150, label: 'Race the checkpoints (0/5)' },
    ],
  },
  {
    title: 'The Big Score',
    reward: 2500,
    brief: 'One last job: the armored van at the bank. Take it, and bring it to the pier. The whole force will be out.',
    steps: [
      { t: 'enterCar', van: true, label: 'Steal the armored van at the bank' },
      { t: 'deliver', x: 0, z: 200, r: 9, label: 'Deliver the van to the harbor' },
    ],
  },
];

export const STORY = {
  intro: 'Palm Harbor. Sun, salt, and everybody owes somebody. Mara Voss runs the crew — and she just hired you, Rex Dalton, wheelman. Eight jobs stand between you and the big score.',
  outro: 'The van is gone, the money is clean, and Palm Harbor is yours, Rex. Free roam — the city stays open.',
};

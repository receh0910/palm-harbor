// Palm Harbor — vehicle customization system.
// A back-alley mod shop where money turns a stock car into a statement.
// Paint changes the look, wheels change the grip and the ride, and nitro
// kits change how hard the car launches. Every choice has a price and an
// effect, and every vehicle keeps its own set of mods. This module owns
// only its own records and reads the plain game object it is handed.

export const PAINTS = [
  { id: "abyss", name: "Midnight Abyss", hex: "#0a0a14", price: 300 },
  { id: "crimson-tide", name: "Crimson Tide", hex: "#a31621", price: 450 },
  { id: "coral", name: "Sunset Coral", hex: "#ff6b4a", price: 500 },
  { id: "lagoon", name: "Lagoon Teal", hex: "#0e7c7b", price: 550 },
  { id: "solar", name: "Solar Gold", hex: "#f2b705", price: 700 },
  { id: "pearl", name: "Ghost Pearl", hex: "#e8e8e8", price: 900 },
  { id: "violet-haze", name: "Violet Haze", hex: "#6c2bd9", price: 650 },
  { id: "arctic-frost", name: "Arctic Frost", hex: "#cfe8ef", price: 750 },
  { id: "ember-orange", name: "Ember Orange", hex: "#e85d04", price: 600 },
];

export const WHEELS = [
  {
    id: "street-lite",
    name: "Street Lite",
    price: 500,
    speed: 0,
    grip: 0.06,
    accel: 0.02,
    blurb: "Light alloys that bite a little harder in the dry.",
  },
  {
    id: "track-slick",
    name: "Track Slick",
    price: 1200,
    speed: 0.08,
    grip: 0.1,
    accel: -0.02,
    blurb: "Full slicks. Fast on smooth tarmac, nervous everywhere else.",
  },
  {
    id: "knobby",
    name: "Off-Road Knobby",
    price: 900,
    speed: -0.04,
    grip: 0.12,
    accel: 0.0,
    blurb: "Deep tread that holds on wet streets and loose gravel.",
  },
  {
    id: "chrome-spinner",
    name: "Chrome Spinners",
    price: 1500,
    speed: 0,
    grip: 0,
    accel: 0,
    blurb: "Pure shine. No speed, no grip, all attention.",
  },
];

export const NITRO_KITS = [
  {
    id: "street-kit",
    name: "Street Kit",
    price: 800,
    speed: 0.05,
    grip: 0,
    accel: 0.12,
    blurb: "A modest bottle for a harder launch off the lights.",
  },
  {
    id: "pro-kit",
    name: "Pro Kit",
    price: 1800,
    speed: 0.1,
    grip: -0.02,
    accel: 0.22,
    blurb: "A serious bottle. Respect the pedal or meet the wall.",
  },
  {
    id: "drag-monster",
    name: "Drag Monster",
    price: 3000,
    speed: 0.16,
    grip: -0.05,
    accel: 0.35,
    blurb: "A drag-strip bottle in a street car. Hold on tight.",
  },
];

let customsState = null;

export function createCustomsState() {
  return { vehicles: {} };
}

export function initCustoms(game) {
  customsState = createCustomsState();
  if (game) game.customs = customsState;
  return customsState;
}

export function getCustomsState() {
  if (!customsState) customsState = createCustomsState();
  return customsState;
}

export function getVehicleMods(vehicleId) {
  const state = getCustomsState();
  if (!state.vehicles[vehicleId]) {
    state.vehicles[vehicleId] = { paint: null, wheels: null, nitro: null, spent: 0 };
  }
  return state.vehicles[vehicleId];
}

export function listPaints() {
  return PAINTS.map((item) => ({ ...item }));
}

export function listWheels() {
  return WHEELS.map((item) => ({ ...item }));
}

export function listNitroKits() {
  return NITRO_KITS.map((item) => ({ ...item }));
}

function charge(game, price) {
  if (!game || typeof game.money !== "number") return { ok: false, reason: "no wallet" };
  if (game.money < price) return { ok: false, reason: "not enough money" };
  game.money -= price;
  return { ok: true };
}

export function buyPaint(vehicleId, paintId, game) {
  const paint = PAINTS.find((item) => item.id === paintId);
  if (!paint) return { ok: false, reason: "unknown paint" };
  const paid = charge(game, paint.price);
  if (!paid.ok) return paid;
  const mods = getVehicleMods(vehicleId);
  mods.paint = paint.id;
  mods.spent += paint.price;
  return { ok: true, vehicle: vehicleId, paint: paint.name, paid: paint.price };
}

export function buyWheels(vehicleId, wheelsId, game) {
  const wheels = WHEELS.find((item) => item.id === wheelsId);
  if (!wheels) return { ok: false, reason: "unknown wheels" };
  const paid = charge(game, wheels.price);
  if (!paid.ok) return paid;
  const mods = getVehicleMods(vehicleId);
  mods.wheels = wheels.id;
  mods.spent += wheels.price;
  return { ok: true, vehicle: vehicleId, wheels: wheels.name, paid: wheels.price };
}

export function buyNitro(vehicleId, kitId, game) {
  const kit = NITRO_KITS.find((item) => item.id === kitId);
  if (!kit) return { ok: false, reason: "unknown nitro kit" };
  const paid = charge(game, kit.price);
  if (!paid.ok) return paid;
  const mods = getVehicleMods(vehicleId);
  mods.nitro = kit.id;
  mods.spent += kit.price;
  return { ok: true, vehicle: vehicleId, nitro: kit.name, paid: kit.price };
}

export function computeVehicleStats(vehicleId, base) {
  const mods = getVehicleMods(vehicleId);
  const safe = base || { speed: 100, grip: 1.0, accel: 1.0 };
  let speed = safe.speed;
  let grip = safe.grip;
  let accel = safe.accel;
  if (mods.wheels) {
    const wheels = WHEELS.find((item) => item.id === mods.wheels);
    if (wheels) {
      speed *= 1 + wheels.speed;
      grip += wheels.grip;
      accel += wheels.accel;
    }
  }
  if (mods.nitro) {
    const kit = NITRO_KITS.find((item) => item.id === mods.nitro);
    if (kit) {
      speed *= 1 + kit.speed;
      grip += kit.grip;
      accel += kit.accel;
    }
  }
  return {
    speed: Math.round(speed * 10) / 10,
    grip: Math.round(grip * 100) / 100,
    accel: Math.round(accel * 100) / 100,
    paint: mods.paint,
    wheels: mods.wheels,
    nitro: mods.nitro,
  };
}

export function describeVehicle(vehicleId, base) {
  const mods = getVehicleMods(vehicleId);
  const stats = computeVehicleStats(vehicleId, base);
  const paint = mods.paint ? PAINTS.find((item) => item.id === mods.paint) : null;
  const wheels = mods.wheels ? WHEELS.find((item) => item.id === mods.wheels) : null;
  const nitro = mods.nitro ? NITRO_KITS.find((item) => item.id === mods.nitro) : null;
  return {
    vehicle: vehicleId,
    paint: paint ? paint.name : "Factory paint",
    wheels: wheels ? wheels.name : "Factory wheels",
    nitro: nitro ? nitro.name : "No nitro",
    speed: stats.speed,
    grip: stats.grip,
    accel: stats.accel,
    spent: mods.spent,
  };
}

export function totalSpent() {
  const state = getCustomsState();
  let total = 0;
  for (const key of Object.keys(state.vehicles)) {
    total += state.vehicles[key].spent || 0;
  }
  return total;
}

export function serializeCustoms() {
  const state = getCustomsState();
  return JSON.parse(JSON.stringify(state));
}

export function deserializeCustoms(data) {
  if (!data || typeof data !== "object") return getCustomsState();
  customsState = createCustomsState();
  if (data.vehicles) {
    for (const key of Object.keys(data.vehicles)) {
      const entry = data.vehicles[key];
      customsState.vehicles[key] = {
        paint: entry.paint || null,
        wheels: entry.wheels || null,
        nitro: entry.nitro || null,
        spent: typeof entry.spent === "number" ? entry.spent : 0,
      };
    }
  }
  return customsState;
}

export function updateCustoms(game, dt) {
  const state = getCustomsState();
  const ids = Object.keys(state.vehicles);
  if (ids.length === 0) return null;
  const latest = ids[ids.length - 1];
  const mods = state.vehicles[latest];
  return {
    vehicle: latest,
    paint: mods.paint,
    wheels: mods.wheels,
    nitro: mods.nitro,
    spent: mods.spent,
  };
}

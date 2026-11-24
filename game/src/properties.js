// Palm Harbor — property system.
// The player buys corners of the city and they pay rent while the player
// drives elsewhere. Each property has a district, a price, a passive
// income per collection period, and room to park vehicles. Upgrades raise
// the income and the prestige of the place. Nothing here reaches into
// other systems: the game passes a plain game object when it wants work.

export const PROPERTIES = [
  {
    id: "seabreeze",
    name: "Seabreeze Safehouse",
    kind: "Safehouse",
    district: "Beachfront",
    price: 12000,
    income: 180,
    slots: 2,
    blurb: "A salt-worn cottage with a view of the morning ferries.",
  },
  {
    id: "rustbucket",
    name: "Rustbucket Garage",
    kind: "Garage",
    district: "The Docks",
    price: 25000,
    income: 320,
    slots: 4,
    blurb: "Oil on the floor, a lift that mostly works, and honest shade.",
  },
  {
    id: "noodle",
    name: "Neon Noodle Shop",
    kind: "Shop",
    district: "Market Quarter",
    price: 40000,
    income: 520,
    slots: 1,
    blurb: "Steam, neon, and a queue that never quite ends.",
  },
  {
    id: "warehouse",
    name: "Harbor Warehouse",
    kind: "Warehouse",
    district: "The Docks",
    price: 75000,
    income: 900,
    slots: 6,
    blurb: "High ceilings, wide doors, and room for a small fleet.",
  },
  {
    id: "penthouse",
    name: "Skyline Penthouse",
    kind: "Safehouse",
    district: "North Hills",
    price: 150000,
    income: 1400,
    slots: 3,
    blurb: "Glass, silence, and the whole city blinking below.",
  },
  {
    id: "piercafe",
    name: "Pierlight Cafe",
    kind: "Shop",
    district: "Marina Row",
    price: 55000,
    income: 640,
    slots: 1,
    blurb: "Coffee at dawn, gossip at noon, and the tide as background music.",
  },
  {
    id: "lighthouse",
    name: "Lighthouse Loft",
    kind: "Safehouse",
    district: "Beachfront",
    price: 95000,
    income: 1050,
    slots: 2,
    blurb: "A converted keeper's quarters with a lamp room for a bedroom.",
  },
];

const MAX_LEVEL = 3;
const UPGRADE_FRACTION = [0, 0.5, 1.0];
const INCOME_MULTIPLIER = [1, 1.5, 2.2];

let propertyState = null;

export function createPropertyState() {
  const owned = {};
  for (const property of PROPERTIES) {
    owned[property.id] = { owned: false, level: 0 };
  }
  return { owned, collected: 0, totalEarned: 0 };
}

export function initProperties(game) {
  propertyState = createPropertyState();
  if (game) game.properties = propertyState;
  return propertyState;
}

export function getPropertyState() {
  if (!propertyState) propertyState = createPropertyState();
  return propertyState;
}

export function getProperty(propertyId) {
  return PROPERTIES.find((item) => item.id === propertyId) || null;
}

export function isOwned(propertyId) {
  const state = getPropertyState();
  return !!state.owned[propertyId]?.owned;
}

export function propertyLevel(propertyId) {
  const state = getPropertyState();
  return state.owned[propertyId]?.level || 0;
}

export function propertyPrice(propertyId) {
  const property = getProperty(propertyId);
  return property ? property.price : null;
}

export function upgradeCost(propertyId) {
  const state = getPropertyState();
  const property = getProperty(propertyId);
  if (!property) return null;
  const level = state.owned[propertyId]?.level || 0;
  if (level >= MAX_LEVEL) return null;
  return Math.round(property.price * UPGRADE_FRACTION[level]);
}

export function incomePerPeriod(propertyId) {
  const state = getPropertyState();
  const property = getProperty(propertyId);
  if (!property) return 0;
  const level = state.owned[propertyId]?.level || 0;
  if (!state.owned[propertyId]?.owned) return 0;
  return Math.round(property.income * INCOME_MULTIPLIER[level - 1]);
}

export function buyProperty(propertyId, game) {
  const state = getPropertyState();
  const property = getProperty(propertyId);
  if (!property) return { ok: false, reason: "unknown property" };
  if (state.owned[propertyId].owned) return { ok: false, reason: "already owned" };
  if (!game || typeof game.money !== "number") return { ok: false, reason: "no wallet" };
  if (game.money < property.price) return { ok: false, reason: "not enough money" };
  game.money -= property.price;
  state.owned[propertyId] = { owned: true, level: 1 };
  return { ok: true, property: property.name, paid: property.price };
}

export function upgradeProperty(propertyId, game) {
  const state = getPropertyState();
  const property = getProperty(propertyId);
  if (!property) return { ok: false, reason: "unknown property" };
  if (!state.owned[propertyId].owned) return { ok: false, reason: "not owned yet" };
  const cost = upgradeCost(propertyId);
  if (cost === null) return { ok: false, reason: "already at max level" };
  if (!game || typeof game.money !== "number") return { ok: false, reason: "no wallet" };
  if (game.money < cost) return { ok: false, reason: "not enough money" };
  game.money -= cost;
  state.owned[propertyId].level += 1;
  return {
    ok: true,
    property: property.name,
    level: state.owned[propertyId].level,
    paid: cost,
    income: incomePerPeriod(propertyId),
  };
}

export function listOwnedProperties() {
  const state = getPropertyState();
  return PROPERTIES.filter((item) => state.owned[item.id].owned).map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    district: item.district,
    level: state.owned[item.id].level,
    income: incomePerPeriod(item.id),
    slots: item.slots,
  }));
}

export function listAvailableProperties(game) {
  const state = getPropertyState();
  const money = game && typeof game.money === "number" ? game.money : 0;
  return PROPERTIES.filter((item) => !state.owned[item.id].owned).map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    district: item.district,
    price: item.price,
    income: item.income,
    slots: item.slots,
    affordable: money >= item.price,
    blurb: item.blurb,
  }));
}

export function collectIncome(game) {
  const state = getPropertyState();
  let total = 0;
  for (const item of PROPERTIES) {
    total += incomePerPeriod(item.id);
  }
  if (total > 0 && game && typeof game.money === "number") {
    game.money += total;
    state.collected += 1;
    state.totalEarned += total;
  }
  return { collected: total, periods: state.collected, totalEarned: state.totalEarned };
}

export function totalVehicleSlots() {
  const state = getPropertyState();
  let slots = 0;
  for (const item of PROPERTIES) {
    if (state.owned[item.id].owned) slots += item.slots;
  }
  return slots;
}

export function serializeProperties() {
  const state = getPropertyState();
  return JSON.parse(JSON.stringify(state));
}

export function deserializeProperties(data) {
  if (!data || typeof data !== "object") return getPropertyState();
  propertyState = createPropertyState();
  if (data.owned) {
    for (const key of Object.keys(data.owned)) {
      if (key in propertyState.owned) {
        propertyState.owned[key] = {
          owned: !!data.owned[key].owned,
          level: Math.max(0, Math.min(MAX_LEVEL, data.owned[key].level || 0)),
        };
      }
    }
  }
  if (typeof data.collected === "number") propertyState.collected = data.collected;
  if (typeof data.totalEarned === "number") propertyState.totalEarned = data.totalEarned;
  return propertyState;
}

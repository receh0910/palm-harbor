// Palm Harbor — gang system.
// Three fictional crews carve the city into turf. The player builds a
// separate reputation with each crew, and turf wars periodically redraw
// the map. Reputation opens doors; a bad reputation opens trouble.
// This module owns only its own state. It never touches other systems
// directly: the game hands it a plain game object when it wants work done.

export const GANGS = [
  {
    id: "crimson",
    name: "Crimson Harbor Syndicate",
    short: "Crimson",
    color: "#c1121f",
    motto: "The tide pays its debts.",
    leader: "Vera 'Red Tide' Anselm",
    home: "The Docks",
    members: ["Silas Crane", "Marta Voss", "Dario Flint"],
    rivals: ["violet"],
  },
  {
    id: "violet",
    name: "Violet Vipers",
    short: "Vipers",
    color: "#7b2cbf",
    motto: "Quiet streets, loud fangs.",
    leader: "Kito 'Needle' Marrow",
    home: "Old Town",
    members: ["Yuna Park", "Felix Aram", "Nadia Cole"],
    rivals: ["crimson"],
  },
  {
    id: "golden",
    name: "Golden Tide Crew",
    short: "Golden Tide",
    color: "#e09f3e",
    motto: "Gold flows where the river bends.",
    leader: "Aurelia 'Gilt' Fontaine",
    home: "Marina Row",
    members: ["Theo Brant", "Cleo Marsh", "Hugo Delacroix"],
    rivals: [],
  },
];

export const DISTRICTS = [
  { id: "docks", name: "The Docks", owner: "crimson" },
  { id: "oldtown", name: "Old Town", owner: "violet" },
  { id: "marina", name: "Marina Row", owner: "golden" },
  { id: "market", name: "Market Quarter", owner: "violet" },
  { id: "beach", name: "Beachfront", owner: "golden" },
  { id: "hills", name: "North Hills", owner: "crimson" },
];

const REP_MIN = -100;
const REP_MAX = 100;
const WAR_DURATION = 240;

let gangState = null;

export function createGangState() {
  const reputation = {};
  const turf = {};
  for (const gang of GANGS) reputation[gang.id] = 0;
  for (const district of DISTRICTS) turf[district.id] = district.owner;
  return {
    reputation,
    turf,
    war: null,
    encounters: 0,
    warsWon: 0,
    warsLost: 0,
  };
}

export function initGangs(game) {
  gangState = createGangState();
  if (game) game.gangs = gangState;
  return gangState;
}

export function getGangState() {
  if (!gangState) gangState = createGangState();
  return gangState;
}

export function getGang(gangId) {
  return GANGS.find((gang) => gang.id === gangId) || null;
}

export function districtOwner(districtId) {
  const state = getGangState();
  return state.turf[districtId] || null;
}

export function districtName(districtId) {
  const district = DISTRICTS.find((item) => item.id === districtId);
  return district ? district.name : districtId;
}

export function gangColor(gangId) {
  const gang = getGang(gangId);
  return gang ? gang.color : "#888888";
}

export function reputationWith(gangId) {
  const state = getGangState();
  return state.reputation[gangId] ?? 0;
}

export function adjustReputation(gangId, delta, reason) {
  const state = getGangState();
  if (!(gangId in state.reputation)) return null;
  const before = state.reputation[gangId];
  const after = Math.max(REP_MIN, Math.min(REP_MAX, before + delta));
  state.reputation[gangId] = after;
  const gang = getGang(gangId);
  let note = `${gang.short} reputation ${before} -> ${after}`;
  if (reason) note += ` (${reason})`;
  return { gangId, before, after, note };
}

export function attitudeToward(gangId) {
  const rep = reputationWith(gangId);
  if (rep >= 40) return "friendly";
  if (rep >= 10) return "warm";
  if (rep <= -40) return "hostile";
  if (rep <= -10) return "cold";
  return "neutral";
}

export function gangDiscount(gangId) {
  const rep = reputationWith(gangId);
  if (rep >= 60) return 0.15;
  if (rep >= 30) return 0.1;
  if (rep >= 10) return 0.05;
  return 0;
}

export function offerTruce(gangId, game) {
  const state = getGangState();
  const gang = getGang(gangId);
  if (!gang) return { ok: false, reason: "unknown gang" };
  if (reputationWith(gangId) > -10) return { ok: false, reason: "no truce needed" };
  if (!game || typeof game.money !== "number") return { ok: false, reason: "no wallet" };
  if (game.money < 500) return { ok: false, reason: "not enough money" };
  game.money -= 500;
  const result = adjustReputation(gangId, 35, "truce offering");
  return { ok: true, gang: gang.name, paid: 500, reputation: result.after };
}

export function gangSummary(gangId) {
  const gang = getGang(gangId);
  if (!gang) return null;
  const state = getGangState();
  const turf = DISTRICTS.filter((item) => state.turf[item.id] === gangId).map(
    (item) => item.name
  );
  return {
    id: gang.id,
    name: gang.name,
    leader: gang.leader,
    motto: gang.motto,
    color: gang.color,
    reputation: state.reputation[gangId],
    attitude: attitudeToward(gangId),
    turf,
  };
}

export function startTurfWar(attackerId, districtId) {
  const state = getGangState();
  const defenderId = state.turf[districtId];
  if (!defenderId || defenderId === attackerId) return null;
  if (state.war) return null;
  state.war = {
    attacker: attackerId,
    defender: defenderId,
    district: districtId,
    timer: WAR_DURATION,
  };
  return state.war;
}

export function maybeStartWar(randomValue) {
  const state = getGangState();
  if (state.war) return null;
  const roll = randomValue !== undefined ? randomValue : Math.random();
  if (roll > 0.12) return null;
  const attacker = GANGS[Math.floor(Math.random() * GANGS.length)];
  const targets = DISTRICTS.filter((item) => state.turf[item.id] !== attacker.id);
  if (targets.length === 0) return null;
  const target = targets[Math.floor(Math.random() * targets.length)];
  return startTurfWar(attacker.id, target.id);
}

export function resolveTurfWar(game) {
  const state = getGangState();
  const war = state.war;
  if (!war) return null;
  const attackerRep = reputationWith(war.attacker);
  const defenderRep = reputationWith(war.defender);
  const edge = (attackerRep - defenderRep) / 200;
  const chance = 0.5 + edge;
  const roll = Math.random();
  const winner = roll < chance ? war.attacker : war.defender;
  const loser = winner === war.attacker ? war.defender : war.attacker;
  state.turf[war.district] = winner;
  state.war = null;
  let reward = 0;
  if (game && typeof game.money === "number" && reputationWith(winner) >= 30) {
    reward = 600;
    game.money += reward;
    state.warsWon += 1;
  } else {
    state.warsLost += 1;
  }
  return {
    district: war.district,
    districtName: districtName(war.district),
    winner,
    loser,
    reward,
  };
}

export function updateGangs(game, dt) {
  const state = getGangState();
  if (state.war) {
    state.war.timer -= dt || 1;
    if (state.war.timer <= 0) return resolveTurfWar(game);
  } else {
    maybeStartWar();
  }
  return null;
}

export function randomEncounter() {
  const state = getGangState();
  const gang = GANGS[Math.floor(Math.random() * GANGS.length)];
  const member = gang.members[Math.floor(Math.random() * gang.members.length)];
  const attitude = attitudeToward(gang.id);
  state.encounters += 1;
  let demand = null;
  if (attitude === "hostile") demand = "Pay a 150 toll or walk away.";
  if (attitude === "cold") demand = "They watch you pass and say nothing.";
  if (attitude === "friendly") demand = "They wave you through and share a rumor.";
  if (attitude === "warm") demand = "They nod and offer a shortcut.";
  if (!demand) demand = "They size you up, then move along.";
  return { gang: gang.id, gangName: gang.name, member, attitude, demand };
}

export function serializeGangs() {
  const state = getGangState();
  return JSON.parse(JSON.stringify(state));
}

export function deserializeGangs(data) {
  if (!data || typeof data !== "object") return getGangState();
  gangState = createGangState();
  if (data.reputation) {
    for (const key of Object.keys(data.reputation)) {
      if (key in gangState.reputation) gangState.reputation[key] = data.reputation[key];
    }
  }
  if (data.turf) {
    for (const key of Object.keys(data.turf)) {
      if (key in gangState.turf) gangState.turf[key] = data.turf[key];
    }
  }
  if (typeof data.encounters === "number") gangState.encounters = data.encounters;
  if (typeof data.warsWon === "number") gangState.warsWon = data.warsWon;
  if (typeof data.warsLost === "number") gangState.warsLost = data.warsLost;
  return gangState;
}

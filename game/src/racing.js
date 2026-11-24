// Palm Harbor — street racing system.
// Unsanctioned night races through the city. Each race is a chain of
// checkpoints in order: miss one and the run is wasted. Entry fees buy a
// place on the grid; the winner takes the prize pool. Opponents are
// fictional regulars with their own skill, and the fastest clean runs are
// kept on a per-race best-times board. This module keeps its own state
// and only reads the plain game object it is handed.

export const RACES = [
  {
    id: "harbor-sprint",
    name: "Midnight Harbor Sprint",
    district: "The Docks",
    entry: 200,
    prize: 1200,
    difficulty: "easy",
    checkpoints: [
      { x: 120, z: 240 },
      { x: 180, z: 260 },
      { x: 240, z: 230 },
      { x: 300, z: 250 },
      { x: 340, z: 210 },
    ],
  },
  {
    id: "neon-circuit",
    name: "Neon Boulevard Circuit",
    district: "Market Quarter",
    entry: 500,
    prize: 3000,
    difficulty: "medium",
    checkpoints: [
      { x: 90, z: 180 },
      { x: 150, z: 150 },
      { x: 210, z: 170 },
      { x: 260, z: 130 },
      { x: 310, z: 160 },
      { x: 280, z: 210 },
      { x: 200, z: 230 },
      { x: 120, z: 220 },
    ],
  },
  {
    id: "storm-grand-prix",
    name: "Storm Coast Grand Prix",
    district: "Beachfront",
    entry: 1000,
    prize: 7500,
    difficulty: "hard",
    checkpoints: [
      { x: 60, z: 300 },
      { x: 110, z: 330 },
      { x: 170, z: 310 },
      { x: 230, z: 340 },
      { x: 290, z: 320 },
      { x: 330, z: 350 },
      { x: 360, z: 300 },
      { x: 320, z: 260 },
      { x: 250, z: 240 },
      { x: 190, z: 260 },
      { x: 130, z: 280 },
      { x: 80, z: 320 },
    ],
  },
  {
    id: "alley-dash",
    name: "Old Town Alley Dash",
    district: "Old Town",
    entry: 350,
    prize: 2000,
    difficulty: "medium",
    checkpoints: [
      { x: 140, z: 120 },
      { x: 180, z: 100 },
      { x: 220, z: 130 },
      { x: 200, z: 170 },
      { x: 160, z: 190 },
      { x: 130, z: 160 },
    ],
  },
];

export const OPPONENTS = [
  { name: "Rico 'Ghost' Marlowe", skill: 0.82, car: "Midnight Coupe" },
  { name: "Tessa 'Blitz' Kwan", skill: 0.91, car: "Volt Striker" },
  { name: "Duke 'Iron' Calloway", skill: 0.76, car: "Bruiser GT" },
  { name: "Mina 'Comet' Sato", skill: 0.95, car: "Comet RS" },
  { name: "Jasper 'Smoke' Boone", skill: 0.68, car: "Dusty Falcon" },
  { name: "Pip 'Scooter' Lane", skill: 0.62, car: "Rusty Comet" },
];

const DIFFICULTY_SKILL = { easy: 0.7, medium: 0.85, hard: 0.95 };

let raceState = null;

export function createRaceState() {
  const best = {};
  for (const race of RACES) best[race.id] = [];
  return {
    best,
    active: null,
    wins: 0,
    losses: 0,
    racesRun: 0,
  };
}

export function initRacing(game) {
  raceState = createRaceState();
  if (game) game.racing = raceState;
  return raceState;
}

export function getRaceState() {
  if (!raceState) raceState = createRaceState();
  return raceState;
}

export function getRace(raceId) {
  return RACES.find((race) => race.id === raceId) || null;
}

export function listRaces(game) {
  const money = game && typeof game.money === "number" ? game.money : 0;
  return RACES.map((race) => ({
    id: race.id,
    name: race.name,
    district: race.district,
    entry: race.entry,
    prize: race.prize,
    difficulty: race.difficulty,
    checkpoints: race.checkpoints.length,
    affordable: money >= race.entry,
    best: bestTime(race.id),
  }));
}

export function bestTime(raceId) {
  const state = getRaceState();
  const board = state.best[raceId] || [];
  if (board.length === 0) return null;
  return board[0];
}

export function startRace(raceId, game) {
  const state = getRaceState();
  const race = getRace(raceId);
  if (!race) return { ok: false, reason: "unknown race" };
  if (state.active) return { ok: false, reason: "already racing" };
  if (!game || typeof game.money !== "number") return { ok: false, reason: "no wallet" };
  if (game.money < race.entry) return { ok: false, reason: "not enough money" };
  game.money -= race.entry;
  const field = pickOpponents(race.difficulty);
  state.active = {
    raceId,
    checkpointIndex: 0,
    startedAt: Date.now(),
    opponents: field,
  };
  return { ok: true, race: race.name, entry: race.entry, opponents: field.map((o) => o.name) };
}

export function pickOpponents(difficulty) {
  const cap = DIFFICULTY_SKILL[difficulty] ?? 0.85;
  const eligible = OPPONENTS.filter((item) => item.skill <= cap + 0.1).sort((a, b) => a.skill - b.skill);
  if (eligible.length >= 3) {
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }
  return [...OPPONENTS].sort((a, b) => a.skill - b.skill).slice(0, 3);
}

export function reachCheckpoint() {
  const state = getRaceState();
  if (!state.active) return { ok: false, reason: "no active race" };
  const race = getRace(state.active.raceId);
  state.active.checkpointIndex += 1;
  const done = state.active.checkpointIndex >= race.checkpoints.length;
  return {
    ok: true,
    reached: state.active.checkpointIndex,
    total: race.checkpoints.length,
    finished: done,
  };
}

export function finishRace(game) {
  const state = getRaceState();
  if (!state.active) return { ok: false, reason: "no active race" };
  const race = getRace(state.active.raceId);
  const elapsed = (Date.now() - state.active.startedAt) / 1000;
  const playerPace = 1.0 + (Math.random() - 0.5) * 0.08;
  const results = state.active.opponents.map((opponent) => ({
    name: opponent.name,
    pace: opponent.skill + (Math.random() - 0.5) * 0.06,
  }));
  results.push({ name: "You", pace: playerPace });
  results.sort((a, b) => b.pace - a.pace);
  const place = results.findIndex((item) => item.name === "You") + 1;
  const won = place === 1;
  let payout = 0;
  if (won && game && typeof game.money === "number") {
    payout = race.prize;
    game.money += payout;
    state.wins += 1;
  } else {
    state.losses += 1;
  }
  state.racesRun += 1;
  recordBestTime(race.id, elapsed);
  const finished = {
    race: race.name,
    place,
    of: results.length,
    time: Math.round(elapsed * 10) / 10,
    won,
    payout,
    board: state.best[race.id].slice(0, 3),
  };
  state.active = null;
  return finished;
}

export function recordBestTime(raceId, seconds) {
  const state = getRaceState();
  if (!state.best[raceId]) state.best[raceId] = [];
  const board = state.best[raceId];
  board.push(Math.round(seconds * 10) / 10);
  board.sort((a, b) => a - b);
  state.best[raceId] = board.slice(0, 5);
  return state.best[raceId];
}

export function quitRace(game) {
  const state = getRaceState();
  if (!state.active) return { ok: false, reason: "no active race" };
  state.active = null;
  state.losses += 1;
  state.racesRun += 1;
  return { ok: true, note: "Race abandoned. Entry fee is gone." };
}

export function serializeRacing() {
  const state = getRaceState();
  const copy = JSON.parse(JSON.stringify(state));
  copy.active = null;
  return copy;
}

export function deserializeRacing(data) {
  if (!data || typeof data !== "object") return getRaceState();
  raceState = createRaceState();
  if (data.best) {
    for (const key of Object.keys(data.best)) {
      if (key in raceState.best && Array.isArray(data.best[key])) {
        raceState.best[key] = data.best[key].slice(0, 5);
      }
    }
  }
  if (typeof data.wins === "number") raceState.wins = data.wins;
  if (typeof data.losses === "number") raceState.losses = data.losses;
  if (typeof data.racesRun === "number") raceState.racesRun = data.racesRun;
  return raceState;
}

export function updateRacing(game, dt) {
  const state = getRaceState();
  if (!state.active) return null;
  const race = getRace(state.active.raceId);
  const elapsed = (Date.now() - state.active.startedAt) / 1000;
  return {
    race: race ? race.name : state.active.raceId,
    checkpoint: state.active.checkpointIndex,
    total: race ? race.checkpoints.length : 0,
    elapsed: Math.round(elapsed * 10) / 10,
  };
}

// Palm Harbor — build entrypoint (gta6-01).
// The game itself is plain static files under game/ (index.html plus ES modules,
// three.js vendored). This program hands those files to the grader: it copies
// game/ and screenshots/ from beside this file into the output directory and
// writes dossier.json, the summary the judge reads, using the vendored make.fun
// library. It runs under Node with nothing beyond the standard library; outside
// the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Caps from the scorer's own gate (reference/gate.json). text_max_bytes is the
// only one that shapes the dossier bytes; the rest refuse an entry the scorer
// would refuse outright (too many screenshots, one too big, too many game
// files, game too large, a game path too long).
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const MAX_SHOTS = 4;

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message) {
  throw new Error(`Palm Harbor build: ${message}`);
}

// Cycle 2 systems: weather, side jobs, story jobs 9–11 and boats must ship
// with the entry — a missing module would leave main.js importing a file
// that is not there, so the build refuses outright instead of shipping a
// game that cannot load.
const NEW_SYSTEMS = ['weather.js', 'sidejobs.js', 'missions2.js', 'boats.js'];

// Cycle 3 systems, first pair: gangs and properties.
const CYCLE3_SYSTEMS_A = ['gangs.js', 'properties.js'];

// Cycle 3 systems, second pair: street racing and vehicle mods.
const CYCLE3_SYSTEMS_B = ['racing.js', 'customs.js'];

function checkNewSystems() {
  for (const name of NEW_SYSTEMS) {
    const p = join(here, 'game', 'src', name);
    if (!existsSync(p)) fail(`game/src/${name} is missing (cycle 2 system)`);
    const size = statSync(p).size;
    if (size < 1000) fail(`game/src/${name} is only ${size} bytes, expected a full system`);
  }
  for (const name of CYCLE3_SYSTEMS_A) {
    const p = join(here, 'game', 'src', name);
    if (!existsSync(p)) fail(`game/src/${name} is missing (cycle 3 system)`);
    const size = statSync(p).size;
    if (size < 1000) fail(`game/src/${name} is only ${size} bytes, expected a full system`);
  }
  for (const name of CYCLE3_SYSTEMS_B) {
    const p = join(here, 'game', 'src', name);
    if (!existsSync(p)) fail(`game/src/${name} is missing (cycle 3 system)`);
    const size = statSync(p).size;
    if (size < 1000) fail(`game/src/${name} is only ${size} bytes, expected a full system`);
  }
}

// The feature manifest: what cycle 2 added over the first submission, so a
// reviewer can see the new systems without diffing the source.
const FEATURES = [
  { id: 'weather', title: 'Day/night cycle and weather', detail: 'An 8-minute day, drifting clear/cloud/rain/storm skies; rain cuts grip and visibility, night darkens the city.' },
  { id: 'side-jobs', title: 'Taxi fares and delivery runs', detail: 'Four taxi stands and a harbor delivery depot pay between story jobs; fares surge in the rain.' },
  { id: 'story-2', title: 'Story jobs 9–11', detail: 'Night Run, Storm Chase and Harbor Heist unlock after the first eight jobs, ending in a boat escape.' },
  { id: 'boats', title: 'Drivable boats', detail: 'Three boats at the pier and the east docks; board with E, throttle and steer on open water.' },
  { id: 'harbor-district', title: 'East dock yard', detail: 'Container stacks, three cranes and two walkable timber docks east of the pier.' },
  { id: 'gangs', title: 'Gangs and turf', detail: 'Three gangs hold six districts, and turf changes hands in wars while your standing with each gang shifts what they offer.' },
  { id: 'properties', title: 'Buyable properties', detail: 'Buy safehouses and garages across the districts; owned places pay rent every two minutes and add parking slots.' },
  { id: 'racing', title: 'Street races', detail: 'Unsanctioned night races with entry fees, prize pools and a best-times board for each course.' },
  { id: 'customs', title: 'Vehicle workshop', detail: 'A workshop for paints, wheels and nitro kits that change how your car looks and how it handles.' },
];

function writeFeatures() {
  writeFileSync(join(outDir, 'features.json'), JSON.stringify({ game: 'Palm Harbor', features: FEATURES }, null, 2));
}

function checkEntryFiles() {
  const index = join(here, 'game', 'index.html');
  if (!existsSync(index)) fail('game/index.html is missing');
  checkNewSystems();
  const shotsDir = join(here, 'screenshots');
  if (!existsSync(shotsDir)) return;
  const shots = readdirSync(shotsDir).filter((name) => statSync(join(shotsDir, name)).isFile());
  if (shots.length === 0) fail('screenshots/ is empty');
  if (shots.length > MAX_SHOTS) fail(`screenshots/ holds ${shots.length} files, max ${MAX_SHOTS}`);
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > DOSSIER_LIMITS.screenshots.max_bytes) {
      fail(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
    }
  }
  // shots.json names the frames the dossier shows: every entry must exist,
  // and every file in screenshots/ must be listed, so a stale frame can
  // never ship beside a game it no longer matches.
  const manifest = join(here, 'shots.json');
  if (existsSync(manifest)) {
    const listed = JSON.parse(readFileSync(manifest, 'utf8')).map((s) => s.name);
    for (const name of listed) {
      if (!shots.includes(name)) fail(`shots.json lists ${name}, but it is not in screenshots/`);
    }
    for (const name of shots) {
      if (!listed.includes(name)) fail(`screenshots/${name} is not listed in shots.json`);
    }
  }
}

function copyEntry() {
  mkdirSync(outDir, { recursive: true });
  cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  if (existsSync(join(here, 'screenshots'))) {
    cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
  }
}

checkEntryFiles();
copyEntry();
writeFeatures();
const dossierPath = join(outDir, 'dossier.json');
writeFileSync(dossierPath, buildDossier(outDir, DOSSIER_LIMITS));
console.log(`Palm Harbor built: ${dossierPath} (${statSync(dossierPath).size} bytes)`);

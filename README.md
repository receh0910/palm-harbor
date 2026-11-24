# Palm Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/receh0910/palm-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/receh0910/palm-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game, built for the [make.fun **gta6-01** bounty](https://make.fun/bounty/gta6-01)
("Make GTA 6"). A fictional sun-soaked coastal city you explore on foot and by
car: steal cars, dodge traffic and pedestrians, lose the Palm Harbor PD, and
work eight story jobs for Mara Voss's crew — from your first stolen wheels to
the big score at the harbor.

## Play

Serve the static files and open them in a desktop browser:

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network: `game/index.html` plus its ES modules, with
three.js vendored under `game/vendor/`. Keyboard and mouse.

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Shift | Run |
| Space | Jump / brake |
| E | Take / leave a car |
| F | Punch |
| Mouse | Aim & shoot (click), drag to orbit, wheel to zoom |
| R | Reload |
| P | Pause |
| M | Mute |

## The city

- A 5×5-block coastal city with a beach, a pier, a marina, a park, a bank,
  a hospital, a spray shop and a safehouse — all invented, all original.
- Traffic (12 cars on road loops), pedestrians (18), police cruisers and
  officers on foot, a 0–5 wanted level that decays when you are out of sight.
- Combat on foot (pistol, 12 rounds, reload; melee), car damage and smoke,
  health that regenerates out of trouble.
- HUD: health, cash, wanted stars, objective + progress, speed, ammo,
  minimap with the mission marker, traffic, police and the player arrow.
- Save: progress, cash and health persist in localStorage; resume from the
  title screen.

## The eight jobs

1. **First Wheels** ($150) — steal a car, take it to the spray shop.
2. **The Pickup** ($250) — collect Maya at the plaza, drop her at the marina.
3. **Hot Cargo** ($400) — collect three crates, deliver them to the harbor pier.
4. **Tail the Mark** ($500) — shadow the courier for 45 s without being seen.
5. **Shake the Heat** ($600) — lose a 3-star wanted level, then get the car resprayed.
6. **The Getaway** ($900) — grab the bag at the bank, escape to the safehouse.
7. **Harbor Run** ($1,200) — race three Vulture drivers through five checkpoints.
8. **The Big Score** ($2,500) — steal the armored van and bring it to the pier.

Finish all eight and the city stays open for free roam.

## Files

- `game/index.html` — the page, HUD and screens.
- `game/src/` — the game: `main.js` (loop, screens, save), `world.js` (rules,
  city, traffic, police, combat), `render.js` (three.js scene, camera, HUD,
  minimap), `missions.js` (the eight jobs), `input.js`, `audio.js`
  (synthesized WebAudio, no assets), `shots.js` (screenshot staging),
  `config.js` (tuning, city, mission data), `random.js` (seeded RNG).
- `game/vendor/three.min.js` — three.js r149, vendored.
- `screenshots/` — four real frames from the game (`?shot=…&seed=1`).
- `main.ts` — builds `/output/dossier.json` for the make.fun grader.
- `serve.ts` — a tiny static server for local play.

## Screenshots

Each frame is a real moment of play, staged by `game/src/shots.js` and
rendered by the same code path as the live game:

1. `1-start.jpg` — the city from the beach.
2. `2-drive.jpg` — driving the ring road.
3. `3-chase.jpg` — a 3-star police chase.
4. `4-mission.jpg` — the bank job, beacon over the door.

## License

MIT — see `LICENSE`. Every name, character, vehicle, story beat, piece of art
and sound in this game is an original invention. No Rockstar or GTA names,
logos, characters, maps or assets are used anywhere.

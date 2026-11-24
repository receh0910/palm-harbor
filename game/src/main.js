// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, busted (down)
// and over (all eight jobs done). On foot, movement is camera-relative; in a
// car, W/S is throttle and A/D is steering. ?seed=N fixes the city.
// ?shot=start|drive|chase|mission (with &seed=N) stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady.
import { CAR, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED, EVENT_CRASH, EVENT_ENTER, EVENT_EXIT,
  EVENT_HIT, EVENT_PICKUP, EVENT_SHOT, createWorld,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MELEE, ACTION_MUTE,
  ACTION_PAUSE, ACTION_RELOAD, createInput,
} from './input.js';
import {
  SCREEN_BUSTED, SCREEN_OVER, SCREEN_PAUSED,
  SCREEN_PLAY, SCREEN_TITLE, createRenderer,
} from './render.js';
import { createMissions } from './missions.js';
import { createAudio } from './audio.js';
import { createWeather } from './weather.js';
import { createSideJobs } from './sidejobs.js';
import { createStory2 } from './missions2.js';
import { createBoats } from './boats.js';
import { initGangs, updateGangs, serializeGangs, deserializeGangs, gangSummary } from './gangs.js';
import { initProperties, collectIncome, serializeProperties, deserializeProperties, listOwnedProperties } from './properties.js';
import { initRacing, updateRacing, serializeRacing, deserializeRacing, bestTime } from './racing.js';
import { initCustoms, updateCustoms, serializeCustoms, deserializeCustoms, totalSpent } from './customs.js';
import { GANGS } from './gangs.js';
import { listAvailableProperties, buyProperty } from './properties.js';
import { RACES, startRace } from './racing.js';
import { listPaints, listWheels, listNitroKits, buyPaint, buyWheels, buyNitro, getVehicleMods } from './customs.js';
import { initSystemMenu } from './menus.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const missions = createMissions(world);
const renderer = createRenderer(canvas, world, missions);
const audio = createAudio();
// Cycle 2 systems: weather and the clock, the drivable boats, side jobs,
// and story jobs 9–11 (standby until the first eight are done).
const weather = createWeather(world);
const boats = createBoats(world);
const sideJobs = createSideJobs(world, weather);
const story2 = createStory2(world, boats, weather);
renderer.setExtras({ weather, sideJobs, story2, boats });

// Cycle 3 systems: gangs, properties, street racing and vehicle mods.
// They share the world's wallet (world.state.money) and keep their own state.
initGangs(world.state);
initProperties(world.state);
initRacing(world.state);
initCustoms(world.state);

function runShot(name) {
  const scene = stageShot(name, world, missions);
  let painted = 0;
  function paint() {
    // dt=1 snaps the follow camera onto the player in a single frame.
    renderer.draw(scene.screen, scene.pose, 1);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const toastEl = document.getElementById('toast');
  const hudEl = document.getElementById('hud');
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let toastTimer = 0;
  let lastTitle = '';
  let boatCtl = {};
  let incomeClock = 0;

  function refreshTabTitle() {
    const cur = missions.done ? story2.current() : missions.current();
    const title = cur ? `Palm Harbor — Job ${cur.missionIndex + 1}/11: ${cur.title}` : 'Palm Harbor';
    if (title !== lastTitle) {
      document.title = title;
      lastTitle = title;
    }
  }

  function say(message) {
    status.textContent = message;
  }

  function refreshSystemsPanel() {
    const panel = document.getElementById('systems-text');
    if (!panel) return;
    const owned = listOwnedProperties();
    const income = owned.reduce((sum, item) => sum + item.income, 0);
    const crimson = gangSummary('crimson');
    const best = bestTime('harbor-sprint');
    const bestText = best === null ? '—' : `${best}s`;
    panel.textContent = `Turf: Crimson holds ${crimson.turf.length} districts · Properties: ${owned.length} owned ($${income}/period) · Best Harbor Sprint: ${bestText} · Mods spent: $${totalSpent()}`;
  }

  function toast(text, secs) {
    toastEl.textContent = text;
    toastEl.style.opacity = '1';
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.style.opacity = '0';
    }, (secs || 3.5) * 1000);
  }

  function showScreen(id) {
    for (const o of document.querySelectorAll('.overlay')) o.classList.remove('show');
    if (id) document.getElementById(id).classList.add('show');
    hudEl.style.display = screen === SCREEN_TITLE ? 'none' : 'block';
  }

  function saveGame() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        ...world.getSave(), ...missions.getSave(), ...weather.getSave(),
        ...boats.getSave(), ...sideJobs.getSave(), ...story2.getSave(),
        gangs: serializeGangs(), properties: serializeProperties(),
        racing: serializeRacing(), customs: serializeCustoms(),
      }));
    } catch {
      /* storage off: the save lasts this visit only */
    }
  }
  function readSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function startGame() {
    audio.unlock();
    world.reset();
    missions.startMission(0);
    weather.reset();
    boats.reset();
    sideJobs.reset();
    initGangs(world.state);
    initProperties(world.state);
    initRacing(world.state);
    initCustoms(world.state);
    accumulator = 0;
    screen = SCREEN_PLAY;
    showScreen(null);
    toast('Job 1: First Wheels — steal a car by the safehouse.', 4);
    say('Playing. Job 1: First Wheels.');
  }
  function continueGame() {
    const save = readSave();
    if (!save) {
      startGame();
      return;
    }
    audio.unlock();
    world.reset();
    world.loadSave(save);
    missions.loadSave(save);
    weather.loadSave(save);
    boats.loadSave(save);
    sideJobs.loadSave(save);
    story2.loadSave(save);
    deserializeGangs(save.gangs);
    deserializeProperties(save.properties);
    deserializeRacing(save.racing);
    deserializeCustoms(save.customs);
    accumulator = 0;
    screen = SCREEN_PLAY;
    showScreen(null);
    const cur = missions.current();
    toast(cur ? `Back to it: ${cur.title} — ${cur.objective}` : 'Free roam — the city is yours.', 4);
    say('Continuing.');
  }
  function respawn() {
    audio.unlock();
    world.respawn();
    screen = SCREEN_PLAY;
    showScreen(null);
    toast('You wake up at the hospital. The crew took 15% for the trouble.');
    say('Playing.');
  }
  function quitToTitle() {
    saveGame();
    screen = SCREEN_TITLE;
    showScreen('title-screen');
    refreshTitle();
    say('Palm Harbor. Press Enter to play.');
  }
  function refreshTitle() {
    const save = readSave();
    document.getElementById('btn-continue').style.display = save ? 'inline-block' : 'none';
  }

  function handleEvents(events) {
    if (!events) return;
    if (events & EVENT_SHOT) audio.gunshot();
    if (events & EVENT_HIT) audio.punch();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_ENTER) {
      audio.click();
      toast('You took the car.');
    }
    if (events & EVENT_EXIT) audio.click();
    if (events & EVENT_BUSTED) {
      screen = SCREEN_BUSTED;
      showScreen('busted-screen');
      audio.fail();
      say('You are down. Respawn at the hospital.');
    }
  }

  function handleMission(m) {
    if (!m) return;
    if (m.stepDone) audio.pickup();
    if (m.failed) {
      audio.fail();
      toast(`Job failed: ${m.why}`);
    }
    if (m.completed) {
      audio.chime();
      saveGame();
      toast(`Job complete: ${m.title}  +$${m.reward}${missions.done ? ' — three more jobs wait at the harbor.' : ''}`);
    }
  }

  function handleSideJob(j) {
    if (!j) return;
    if (j.started) toast(j.message, 4);
    if (j.stepDone) {
      audio.pickup();
      toast(j.message, 4);
    }
    if (j.completed) {
      audio.chime();
      saveGame();
      toast(j.message, 4);
    }
    if (j.failed) {
      audio.fail();
      toast(j.message, 4);
    }
  }

  function handleStory2(m) {
    if (!m) return;
    if (m.stepDone) audio.pickup();
    if (m.failed) {
      audio.fail();
      toast(`Job failed: ${m.why}`);
    }
    if (m.completed) {
      audio.chime();
      saveGame();
      if (story2.done) {
        screen = SCREEN_OVER;
        showScreen('end-screen');
        say('All eleven jobs done. Palm Harbor is yours.');
      } else {
        toast(`Job complete: ${m.title}  +$${m.reward}`);
      }
    }
  }

  function readCtl() {
    const move = input.move();
    const look = input.takeLook();
    renderer.applyLook(look.x, look.y);
    renderer.applyZoom(input.takeZoom());
    const p = world.state.player;
    const ctl = {};
    if (p.onFoot) {
      // Camera-relative movement; the pistol shoots where the camera looks.
      // A drag orbits the camera instead of firing.
      const yaw = renderer.getYaw();
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const rx = -Math.cos(yaw);
      const rz = Math.sin(yaw);
      ctl.mx = fx * move.z + rx * move.x;
      ctl.mz = fz * move.z + rz * move.x;
      ctl.run = input.run();
      ctl.jump = input.jump();
      if (input.firing() && Math.abs(look.x) < 2 && Math.abs(look.y) < 2) {
        p.angle = yaw;
        handleEvents(world.shoot(fx, fz));
      }
    } else if (boats.isPlayerOnBoat()) {
      // Afloat: the boat module drives the player, the world gets no input.
      boatCtl = { throttle: move.z, steer: move.x, brake: input.brake() };
      return {};
    } else {
      ctl.throttle = move.z;
      ctl.steer = move.x;
      ctl.brake = input.brake();
    }
    return ctl;
  }

  function stepOnce() {
    const events = world.step(STEP, readCtl());
    handleEvents(events);
    handleMission(missions.update(STEP));
    // Cycle 2 systems run on the same clock as the world.
    weather.update(STEP);
    handleSideJob(sideJobs.update(STEP));
    // Cycle 3 systems run on the same clock as the world.
    const warNews = updateGangs(world.state, STEP);
    if (warNews) toast(`${warNews.districtName} changed hands.`);
    updateRacing(world.state, STEP);
    updateCustoms(world.state, STEP);
    incomeClock += STEP;
    if (incomeClock >= 120) {
      incomeClock = 0;
      const rent = collectIncome(world.state);
      if (rent.collected > 0) toast(`Properties paid $${rent.collected}.`);
    }
    refreshSystemsPanel();
    if (missions.done && !story2.armed && !story2.done) {
      story2.startMission(0);
      toast('Three more jobs wait at the harbor — Job 9: Night Run.', 5);
    }
    handleStory2(story2.update(STEP));
    boats.update(STEP, boatCtl);
    audio.siren(world.state.wanted > 0);
    const pc = world.playerCar();
    if (pc && !world.state.player.onFoot) audio.engine(Math.min(1, Math.abs(pc.speed) / CAR.maxSpeed));
    else audio.engineOff();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (!actions) return;
    audio.unlock();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      toast(muted ? 'Sound off' : 'Sound on');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        if (readSave()) continueGame();
        else startGame();
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        showScreen('pause-screen');
        say('Paused.');
      } else if (actions & ACTION_ENTER) {
        const p = world.state.player;
        if (boats.isPlayerOnBoat()) {
          if (boats.exitBoat()) {
            audio.click();
            toast('You docked the boat.');
          }
        } else if (p.onFoot && boats.tryBoard()) {
          audio.click();
          toast('You boarded the boat. W/S throttle, A/D steer.');
        } else {
          handleEvents(p.onFoot ? world.tryEnterCar() : world.exitCar());
        }
      } else if (actions & ACTION_MELEE) {
        handleEvents(world.melee());
      } else if (actions & ACTION_RELOAD) {
        world.reload();
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        showScreen(null);
        say('Playing.');
      }
    } else if (screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) respawn();
    } else if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        showScreen(null);
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      // Attract mode: the city lives behind the title.
      accumulator += dt;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        world.step(STEP, {});
      }
    } else if (screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        accumulator -= STEP;
        stepOnce();
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(screen, null, dt);
    refreshTabTitle();
  }

  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-continue').addEventListener('click', continueGame);
  document.getElementById('btn-resume').addEventListener('click', () => {
    screen = SCREEN_PLAY;
    showScreen(null);
    say('Playing.');
  });
  document.getElementById('btn-quit-title').addEventListener('click', quitToTitle);
  document.getElementById('btn-respawn').addEventListener('click', respawn);
  document.getElementById('btn-freeroam').addEventListener('click', () => {
    screen = SCREEN_PLAY;
    showScreen(null);
    say('Free roam.');
  });
  document.getElementById('btn-quit-title-2').addEventListener('click', quitToTitle);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      showScreen('pause-screen');
      say('Paused.');
    }
  });

  // Cycle 3 triggers: the system menu and what its four buttons do.
  // Properties carry districts, not coordinates, so the nearest buy is the
  // cheapest available one; races are picked by their first checkpoint.
  function buyNearestProperty() {
    const open = listAvailableProperties(world.state);
    if (open.length === 0) { toast('You already own every property in Palm Harbor.'); return; }
    const pick = open.reduce((a, b) => (b.price < a.price ? b : a));
    const result = buyProperty(pick.id, world.state);
    if (result.ok) {
      saveGame();
      refreshSystemsPanel();
      toast(`Bought ${result.property} for $${result.paid}. Rent lands every two minutes.`);
    } else if (result.reason === 'not enough money') {
      toast('Not enough money for that property yet.');
    } else {
      toast(`Could not buy it: ${result.reason}.`);
    }
  }
  function startNearestRace() {
    const p = world.state.player;
    let pick = null;
    let best = Infinity;
    for (const race of RACES) {
      const start = race.checkpoints[0];
      if (!start) continue;
      const d = (start.x - p.x) * (start.x - p.x) + (start.z - p.z) * (start.z - p.z);
      if (d < best) { best = d; pick = race.id; }
    }
    if (!pick) { toast('No race course is staged right now.'); return; }
    const result = startRace(pick, world.state);
    if (result.ok) {
      saveGame();
      toast(`${result.race} — entry $${result.entry}. Reach every checkpoint in order.`);
    } else if (result.reason === 'already racing') {
      toast('You are already in a race.');
    } else if (result.reason === 'not enough money') {
      toast('Not enough money for the entry fee.');
    } else {
      toast(`Could not start it: ${result.reason}.`);
    }
  }
  function openOverlayPanel(title) {
    const old = document.getElementById('menu-overlay-panel');
    if (old) old.remove();
    const panel = document.createElement('div');
    panel.id = 'menu-overlay-panel';
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:50;min-width:320px;max-width:520px;max-height:80vh;overflow:auto;background:#101820;color:#f2f2f2;padding:14px;border:2px solid #e8b23a;border-radius:8px;font-family:sans-serif;';
    const head = document.createElement('div');
    head.textContent = title;
    head.style.cssText = 'font-weight:bold;margin-bottom:10px;';
    panel.appendChild(head);
    const content = document.createElement('div');
    panel.appendChild(content);
    const closer = document.createElement('button');
    closer.textContent = 'Close';
    closer.style.cssText = 'display:block;width:100%;margin-top:10px;padding:8px;cursor:pointer;';
    closer.addEventListener('click', () => panel.remove());
    panel.appendChild(closer);
    document.body.appendChild(panel);
    return content;
  }
  function openWorkshop() {
    const car = world.playerCar();
    if (!car) { toast('Get in a car first — the workshop tunes the ride you are driving.'); return; }
    const vehicleId = car.id;
    const content = openOverlayPanel('Workshop — tune your ride');
    const mods = getVehicleMods(vehicleId);
    const summary = document.createElement('div');
    summary.textContent = `Current: paint ${mods.paint || 'stock'}, wheels ${mods.wheels || 'stock'}, nitro ${mods.nitro || 'none'} — $${mods.spent} spent on this car.`;
    summary.style.cssText = 'margin-bottom:10px;';
    content.appendChild(summary);
    const groups = [
      ['Paint', listPaints(), (item) => buyPaint(vehicleId, item.id, world.state)],
      ['Wheels', listWheels(), (item) => buyWheels(vehicleId, item.id, world.state)],
      ['Nitro', listNitroKits(), (item) => buyNitro(vehicleId, item.id, world.state)],
    ];
    for (const [label, items, buy] of groups) {
      const heading = document.createElement('div');
      heading.textContent = label;
      heading.style.cssText = 'font-weight:bold;margin:8px 0 4px;';
      content.appendChild(heading);
      for (const item of items) {
        const button = document.createElement('button');
        button.style.cssText = 'display:block;width:100%;text-align:left;margin:3px 0;padding:7px;cursor:pointer;';
        button.textContent = `${item.name} — $${item.price}`;
        button.addEventListener('click', () => {
          const result = buy(item);
          if (result.ok) {
            saveGame();
            refreshSystemsPanel();
            toast(`Fitted ${item.name} for $${item.price}.`);
            content.parentElement.remove();
            openWorkshop();
          } else {
            toast(result.reason === 'not enough money' ? 'Not enough money for that part.' : `Could not fit it: ${result.reason}.`);
          }
        });
        content.appendChild(button);
      }
    }
  }
  function showGangStandings() {
    const content = openOverlayPanel('Gang standings');
    for (const gang of GANGS) {
      const summary = gangSummary(gang.id);
      const line = document.createElement('div');
      line.style.cssText = 'margin:6px 0;padding:8px;border-left:4px solid ' + gang.color + ';';
      line.textContent = `${gang.name} — holds ${summary.turf.length} district${summary.turf.length === 1 ? '' : 's'} (${summary.turf.join(', ') || 'none'}), standing ${summary.reputation}, ${summary.attitude}. Leader: ${gang.leader}.`;
      content.appendChild(line);
    }
  }
  initSystemMenu({
    'buy-property': buyNearestProperty,
    'start-race': startNearestRace,
    'open-workshop': openWorkshop,
    'gang-standings': showGangStandings,
  });

  refreshTitle();
  showScreen('title-screen');
  say('Palm Harbor. Press Enter to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

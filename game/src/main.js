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

  function refreshTabTitle() {
    const cur = missions.current();
    const title = cur ? `Palm Harbor — Job ${cur.missionIndex + 1}/8: ${cur.title}` : 'Palm Harbor';
    if (title !== lastTitle) {
      document.title = title;
      lastTitle = title;
    }
  }

  function say(message) {
    status.textContent = message;
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
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...world.getSave(), ...missions.getSave() }));
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
      if (missions.done) {
        screen = SCREEN_OVER;
        showScreen('end-screen');
        say('All eight jobs done. Palm Harbor is yours.');
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
        handleEvents(world.state.player.onFoot ? world.tryEnterCar() : world.exitCar());
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

  refreshTitle();
  showScreen('title-screen');
  say('Palm Harbor. Press Enter to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

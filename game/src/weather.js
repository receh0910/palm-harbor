// Palm Harbor — weather and the day/night cycle.
// A slow clock (one full day every eight minutes of play) and weather that
// drifts between clear skies, cloud, rain and storm. Rain makes the roads
// slick (the world's car physics reads state.weather.rain) and cuts how far
// you can see; night does the same after dark. Missions can force the clock
// or the sky: Night Run waits for dark, Storm Chase wants a storm.
// Pure logic: no DOM, no three.js — the renderer reads the numbers and
// paints the sky, fog and rain. Safe to import from the headless tests.
import { CITY } from './config.js';

export const WEATHER_DAY_MINUTES = 8;
export const WEATHER_CONDITIONS = ['clear', 'cloudy', 'rain', 'storm'];
export const WEATHER_RAIN_TARGET = { clear: 0, cloudy: 0.08, rain: 0.65, storm: 1 };
export const WEATHER_CLOUD_TARGET = { clear: 0.12, cloudy: 0.55, rain: 0.8, storm: 1 };
export const WEATHER_GRIP_LOSS = 0.28;
export const WEATHER_VIS_RAIN = 0.45;
export const WEATHER_VIS_NIGHT = 0.3;
export const WEATHER_DAY_START = 10.0;

const DAY_SECONDS = WEATHER_DAY_MINUTES * 60;
const DRIFT_EVERY = 55;

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
// 0 in daylight (07:00–19:00), 1 in the deep night, smooth ramps at dawn/dusk.
function nightFactor(h) {
  if (h >= 7 && h < 19) return 0;
  if (h >= 19 && h < 21) return (h - 19) / 2;
  if (h >= 21 || h < 5) return 1;
  return 1 - (h - 5) / 2;
}

export function createWeather(world) {
  const st = {
    timeOfDay: WEATHER_DAY_START,
    condition: 'clear',
    rain: 0,
    clouds: 0.12,
    driftT: 20,
    held: false,
  };

  function publish() {
    // The world carries the live numbers so car physics and the renderer
    // can read them without importing this module.
    world.state.weather = {
      rain: st.rain,
      night: nightFactor(st.timeOfDay),
      storm: st.condition === 'storm' ? 1 : 0,
      clouds: st.clouds,
      timeOfDay: st.timeOfDay,
      condition: st.condition,
    };
  }

  function driftCondition() {
    // Weather wanders on its own: clear is the most likely next sky, storm
    // the rarest. A held sky (a mission forced it) never drifts.
    if (st.held) return;
    const roll = Math.random();
    let next = st.condition;
    if (st.condition === 'clear') {
      next = roll < 0.55 ? 'clear' : roll < 0.85 ? 'cloudy' : 'rain';
    } else if (st.condition === 'cloudy') {
      next = roll < 0.35 ? 'clear' : roll < 0.75 ? 'cloudy' : roll < 0.93 ? 'rain' : 'storm';
    } else if (st.condition === 'rain') {
      next = roll < 0.3 ? 'cloudy' : roll < 0.7 ? 'rain' : roll < 0.9 ? 'storm' : 'clear';
    } else {
      next = roll < 0.45 ? 'rain' : roll < 0.8 ? 'cloudy' : 'clear';
    }
    st.condition = next;
  }

  function update(dt) {
    st.timeOfDay += (dt * 24) / DAY_SECONDS;
    if (st.timeOfDay >= 24) st.timeOfDay -= 24;
    st.driftT += dt;
    if (st.driftT > DRIFT_EVERY) {
      st.driftT = 0;
      driftCondition();
    }
    const rainTarget = WEATHER_RAIN_TARGET[st.condition] ?? 0;
    const cloudTarget = WEATHER_CLOUD_TARGET[st.condition] ?? 0.12;
    st.rain = lerp(st.rain, rainTarget, clampNum(dt * 0.25, 0, 1));
    st.clouds = lerp(st.clouds, cloudTarget, clampNum(dt * 0.2, 0, 1));
    publish();
  }

  function gripFactor() {
    return 1 - WEATHER_GRIP_LOSS * st.rain;
  }
  function visibility() {
    return clampNum(1 - WEATHER_VIS_RAIN * st.rain - WEATHER_VIS_NIGHT * nightFactor(st.timeOfDay), 0.25, 1);
  }
  function clockText() {
    const h = Math.floor(st.timeOfDay);
    const m = Math.floor((st.timeOfDay - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  function isNight() {
    return nightFactor(st.timeOfDay) > 0.6;
  }

  // Missions call these to stage their scene, then release() hands the sky
  // back to the drift. setTimeOfDay only moves the clock.
  function setTimeOfDay(h) {
    st.timeOfDay = ((h % 24) + 24) % 24;
    publish();
  }
  function setCondition(condition, hold) {
    if (!WEATHER_CONDITIONS.includes(condition)) return;
    st.condition = condition;
    st.held = hold !== false;
    st.rain = WEATHER_RAIN_TARGET[condition] ?? 0;
    st.clouds = WEATHER_CLOUD_TARGET[condition] ?? 0.12;
    publish();
  }
  function release() {
    st.held = false;
    st.driftT = 0;
  }
  function forceNight() {
    setTimeOfDay(21.5);
  }
  function forceStorm() {
    setTimeOfDay(16.5);
    setCondition('storm', true);
  }

  function hud() {
    return {
      clock: clockText(),
      condition: st.condition,
      rain: st.rain,
      night: nightFactor(st.timeOfDay),
      clouds: st.clouds,
      grip: gripFactor(),
      visibility: visibility(),
    };
  }

  function reset() {
    st.timeOfDay = WEATHER_DAY_START;
    st.condition = 'clear';
    st.rain = 0;
    st.clouds = 0.12;
    st.driftT = 20;
    st.held = false;
    publish();
  }
  function getSave() {
    return { timeOfDay: st.timeOfDay, condition: st.condition };
  }
  function loadSave(s) {
    if (!s) return;
    if (typeof s.timeOfDay === 'number') st.timeOfDay = s.timeOfDay;
    if (WEATHER_CONDITIONS.includes(s.condition)) st.condition = s.condition;
    st.rain = WEATHER_RAIN_TARGET[st.condition] ?? 0;
    st.clouds = WEATHER_CLOUD_TARGET[st.condition] ?? 0.12;
    publish();
  }

  publish();
  return {
    update,
    gripFactor,
    visibility,
    clockText,
    isNight,
    setTimeOfDay,
    setCondition,
    release,
    forceNight,
    forceStorm,
    hud,
    reset,
    getSave,
    loadSave,
    get timeOfDay() {
      return st.timeOfDay;
    },
    get condition() {
      return st.condition;
    },
    get rain() {
      return st.rain;
    },
    get night() {
      return nightFactor(st.timeOfDay);
    },
  };
}

// The sky over the harbor at a glance: used by the HUD and the renderer.
export function weatherLabel(w) {
  if (!w) return '';
  const icon = w.condition === 'storm' ? '⛈' : w.condition === 'rain' ? '🌧' : w.condition === 'cloudy' ? '⛅' : w.night > 0.6 ? '🌙' : '☀';
  return `${icon} ${w.clock} ${w.condition}`;
}
// How far the fog should reach: clear day sees the whole city, rain and
// night pull it in. The renderer multiplies its base fog distance by this.
export function fogFactor(w) {
  if (!w) return 1;
  return clampNum(w.visibility, 0.25, 1);
}
// Sea state for the boats: calm in clear skies, choppy in a storm.
export function seaState(w) {
  if (!w) return 0;
  return clampNum(w.rain * 0.7 + (w.condition === 'storm' ? 0.3 : 0), 0, 1);
}
export { CITY };

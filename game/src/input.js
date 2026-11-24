// Keyboard and pointer input for the 3D game. Held keys give a move vector;
// one-shot presses (confirm, pause, enter car, melee, reload, mute) are queued
// as bit flags and taken once by the loop, so a press between two frames is
// never lost and never counted twice. Dragging orbits the camera, the wheel
// zooms, and holding the mouse button fires the pistol while on foot.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MELEE = 8;
export const ACTION_RELOAD = 16;
export const ACTION_MUTE = 32;

const FORWARD_KEYS = new Set(['KeyW', 'ArrowUp']);
const BACK_KEYS = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);

export function createInput(target) {
  const held = new Set();
  let queued = 0;
  let lookDx = 0;
  let lookDy = 0;
  let zoomDelta = 0;
  let triggerHeld = false;
  let orbiting = false;
  let pointerX = 0;
  let pointerY = 0;

  function isMoveKey(code) {
    return FORWARD_KEYS.has(code) || BACK_KEYS.has(code) || LEFT_KEYS.has(code) || RIGHT_KEYS.has(code);
  }
  function anyOf(keys) {
    for (const code of keys) if (held.has(code)) return true;
    return false;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (isMoveKey(event.code)) event.preventDefault();
      return;
    }
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') queued |= ACTION_CONFIRM;
    else if (event.code === 'KeyP' || event.code === 'Escape') queued |= ACTION_PAUSE;
    else if (event.code === 'KeyE') queued |= ACTION_ENTER;
    else if (event.code === 'KeyF') queued |= ACTION_MELEE;
    else if (event.code === 'KeyR') queued |= ACTION_RELOAD;
    else if (event.code === 'KeyM') queued |= ACTION_MUTE;
    if (isMoveKey(event.code) || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    triggerHeld = false;
    orbiting = false;
  });

  target.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    triggerHeld = true;
    orbiting = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button !== 0) return;
    triggerHeld = false;
    orbiting = false;
  });
  window.addEventListener('pointermove', (event) => {
    if (!orbiting) return;
    lookDx += event.clientX - pointerX;
    lookDy += event.clientY - pointerY;
    pointerX = event.clientX;
    pointerY = event.clientY;
  });
  window.addEventListener('wheel', (event) => { zoomDelta += event.deltaY; }, { passive: true });

  return {
    /** Camera-relative move: x right, z forward (both -1..1). */
    move() {
      const x = (anyOf(RIGHT_KEYS) ? 1 : 0) - (anyOf(LEFT_KEYS) ? 1 : 0);
      const z = (anyOf(FORWARD_KEYS) ? 1 : 0) - (anyOf(BACK_KEYS) ? 1 : 0);
      return { x, z };
    },
    run() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    jump() { return held.has('Space'); },
    brake() { return held.has('Space'); },
    firing() { return triggerHeld; },
    /** Drag deltas since the last call, in pixels. */
    takeLook() {
      const d = { x: lookDx, y: lookDy };
      lookDx = 0;
      lookDy = 0;
      return d;
    },
    takeZoom() {
      const z = zoomDelta;
      zoomDelta = 0;
      return z;
    },
    takeActions() {
      const taken = queued;
      queued = 0;
      return taken;
    },
  };
}

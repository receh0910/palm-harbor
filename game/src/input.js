// Keyboard and pointer input for the 3D game. Held keys give a move vector; one-shot presses
// (confirm, pause, enter car, melee, reload) are queued as bit flags and taken once by the loop,
// so a press between two frames is never lost and never counted twice. Dragging orbits the
// camera; the wheel zooms it; holding the mouse button fires the pistol while on foot.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MELEE = 8;
export const ACTION_RELOAD = 16;
export const ACTION_MUTE = 32;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  let lookX = 0, lookY = 0, zoom = 0;
  let firing = false;
  let dragging = false;
  let lastX = 0, lastY = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) { if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) event.preventDefault(); return; }
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyE') actions |= ACTION_ENTER;
    else if (event.code === 'KeyF') actions |= ACTION_MELEE;
    else if (event.code === 'KeyR') actions |= ACTION_RELOAD;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); firing = false; dragging = false; });

  target.addEventListener('pointerdown', (event) => {
    if (event.button === 0) { firing = true; dragging = true; lastX = event.clientX; lastY = event.clientY; }
  });
  window.addEventListener('pointerup', (event) => { if (event.button === 0) { firing = false; dragging = false; } });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    lookX += event.clientX - lastX;
    lookY += event.clientY - lastY;
    lastX = event.clientX; lastY = event.clientY;
  });
  window.addEventListener('wheel', (event) => { zoom += event.deltaY; }, { passive: true });

  const has = (set) => { for (const code of set) if (keys.has(code)) return true; return false; };

  return {
    /** Camera-relative move: x right, z forward (both -1..1). */
    move() {
      return { x: (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0), z: (has(UP) ? 1 : 0) - (has(DOWN) ? 1 : 0) };
    },
    run() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    jump() { return keys.has('Space'); },
    brake() { return keys.has('Space'); },
    firing() { return firing; },
    /** Drag deltas since the last call, in pixels. */
    takeLook() { const d = { x: lookX, y: lookY }; lookX = 0; lookY = 0; return d; },
    takeZoom() { const z = zoom; zoom = 0; return z; },
    takeActions() { const taken = actions; actions = 0; return taken; },
  };
}

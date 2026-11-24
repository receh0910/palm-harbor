// Palm Harbor — system menu: one panel for property, race, workshop,
// and standings. It builds its own DOM and calls back into bound actions.
const MENU_TOGGLE_CODE = 'KeyQ';
const MENU_CLOSE_CODE = 'Escape';
const MENU_PICK_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

export const MENU_ENTRIES = [
  { id: 'buy-property', label: 'Buy Property', hint: 'Buy the nearest property up for sale', action: null },
  { id: 'start-race', label: 'Start Race', hint: 'Line up for the nearest street race', action: null },
  { id: 'open-workshop', label: 'Workshop', hint: 'Open the vehicle workshop and tune a ride', action: null },
  { id: 'gang-standings', label: 'Gang Standings', hint: 'See which gang holds each territory', action: null },
];
let menuOpen = false, menuPanel = null, menuCornerButton = null;

export function bindMenuAction(id, fn) {
  const entry = MENU_ENTRIES.find((e) => e.id === id);
  if (entry && typeof fn === 'function') entry.action = fn;
}
function runMenuEntry(entry) {
  if (typeof entry.action === 'function') entry.action();
  closeSystemMenu();
}
function buildMenuPanel() {
  menuPanel = document.createElement('div');
  menuPanel.id = 'system-menu-panel';
  menuPanel.style.cssText = 'position:fixed;right:16px;top:96px;z-index:40;min-width:280px;background:#101820;color:#f2f2f2;padding:12px;border:2px solid #e8b23a;border-radius:8px;display:none;font-family:sans-serif;';
  const title = document.createElement('div');
  title.textContent = 'Palm Harbor — Systems';
  menuPanel.appendChild(title);
  MENU_ENTRIES.forEach((entry, index) => {
    const button = document.createElement('button');
    button.style.cssText = 'display:block;width:100%;text-align:left;margin:4px 0;padding:8px;cursor:pointer;';
    button.textContent = `${index + 1}. ${entry.label} — ${entry.hint}`;
    button.addEventListener('click', () => runMenuEntry(entry));
    menuPanel.appendChild(button);
  });
  const closer = document.createElement('button');
  closer.style.cssText = 'display:block;width:100%;margin:8px 0 0;padding:8px;cursor:pointer;';
  closer.textContent = 'Close (Q)';
  closer.addEventListener('click', () => closeSystemMenu());
  menuPanel.appendChild(closer);
  const footer = document.createElement('div');
  footer.textContent = 'Keys: 1-4 pick an entry, Q toggles, Esc closes.';
  footer.style.cssText = 'margin-top:8px;font-size:12px;opacity:0.8;';
  menuPanel.appendChild(footer);
  document.body.appendChild(menuPanel);
}
function buildCornerButton() {
  menuCornerButton = document.createElement('button');
  menuCornerButton.id = 'system-menu-corner';
  menuCornerButton.textContent = 'Systems (Q)';
  menuCornerButton.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:40;padding:8px 12px;cursor:pointer;';
  menuCornerButton.addEventListener('click', () => toggleSystemMenu());
  document.body.appendChild(menuCornerButton);
}
export function openSystemMenu() {
  if (!menuPanel) return;
  menuOpen = true;
  menuPanel.style.display = 'block';
}
export function closeSystemMenu() {
  if (!menuPanel) return;
  menuOpen = false;
  menuPanel.style.display = 'none';
}
export function toggleSystemMenu() {
  if (menuOpen) closeSystemMenu();
  else openSystemMenu();
}
export function isSystemMenuOpen() {
  return menuOpen;
}
function onMenuKeyDown(event) {
  if (event.code === MENU_TOGGLE_CODE) {
    event.preventDefault();
    toggleSystemMenu();
  } else if (menuOpen && event.code === MENU_CLOSE_CODE) {
    event.preventDefault();
    closeSystemMenu();
  } else if (menuOpen) {
    const pick = MENU_PICK_CODES.indexOf(event.code);
    if (pick >= 0 && pick < MENU_ENTRIES.length) {
      event.preventDefault();
      runMenuEntry(MENU_ENTRIES[pick]);
    }
  }
}
export function initSystemMenu(actions = {}) {
  for (const entry of MENU_ENTRIES) {
    if (typeof actions[entry.id] === 'function') entry.action = actions[entry.id];
  }
  if (!menuPanel) {
    buildMenuPanel();
    window.addEventListener('keydown', onMenuKeyDown);
  }
  if (!menuCornerButton) buildCornerButton();
  return { open: openSystemMenu, close: closeSystemMenu, toggle: toggleSystemMenu, isOpen: isSystemMenuOpen, bind: bindMenuAction };
}
export function destroySystemMenu() {
  window.removeEventListener('keydown', onMenuKeyDown);
  if (menuPanel) menuPanel.remove();
  if (menuCornerButton) menuCornerButton.remove();
  menuPanel = null;
  menuCornerButton = null;
  menuOpen = false;
}

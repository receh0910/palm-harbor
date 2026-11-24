const STATIONS = [
  {
    id: "neon-tide",
    name: "Neon Tide FM",
    frequency: 88.4,
    dj: "Marisol Vega",
    slogan: "Ride the glow, all night long.",
  },
  {
    id: "harbor-static",
    name: "Harbor Static",
    frequency: 91.7,
    dj: "Old Man Rook",
    slogan: "Voices from the docks, static and all.",
  },
  {
    id: "coconut-radio",
    name: "Coconut Radio",
    frequency: 95.2,
    dj: "Lulu Breeze",
    slogan: "Sunshine you can hear.",
  },
  {
    id: "midnight-diesel",
    name: "Midnight Diesel",
    frequency: 102.9,
    dj: "Karga Holt",
    slogan: "Loud enough to wake the freeway.",
  },
  {
    id: "static-bloom",
    name: "Static Bloom",
    frequency: 107.5,
    dj: "Fern Okafor",
    slogan: "Music that grows in the dark.",
  },
];

function getCurrentSlogan() {
  return STATIONS[currentIndex].slogan;
}

const STORAGE_KEY = "radio:lastStation";

let currentIndex = 0;
let volume = 0.7;
let missionDucked = false;

function loadLastStation() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return;
    const index = STATIONS.findIndex((s) => s.id === saved);
    if (index >= 0) currentIndex = index;
  } catch (err) {
    // Storage unavailable; keep the first station.
  }
}

function saveLastStation() {
  try {
    window.localStorage.setItem(STORAGE_KEY, STATIONS[currentIndex].id);
  } catch (err) {
    // Storage unavailable; nothing to save.
  }
}

function getCurrentStation() {
  return STATIONS[currentIndex];
}

function nextStation() {
  currentIndex = (currentIndex + 1) % STATIONS.length;
  saveLastStation();
  return getCurrentStation();
}

function prevStation() {
  currentIndex = (currentIndex - 1 + STATIONS.length) % STATIONS.length;
  saveLastStation();
  return getCurrentStation();
}

function setVolume(value) {
  volume = Math.max(0, Math.min(1, Number(value) || 0));
  return volume;
}

function getEffectiveVolume() {
  return missionDucked ? volume * 0.35 : volume;
}

function setMissionDuck(active) {
  missionDucked = Boolean(active);
  return getEffectiveVolume();
}

loadLastStation();

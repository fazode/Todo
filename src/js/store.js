/**
 * Persistenz. Alles liegt im localStorage des Geräts, es gibt keinen Server.
 * Fällt auf einen In-Memory-Speicher zurück, wenn localStorage blockiert ist
 * (privater Modus, abgeschaltete Cookies).
 */

const TASK_KEY = 'nachtnotiz.tasks.v1';
const SETTINGS_KEY = 'nachtnotiz.settings.v1';

const DEFAULT_SETTINGS = {
  autosplit: true,
  fillers: true,
  continuous: true,
  lang: 'de-DE',
  filter: 'open',
  dimmed: false,
};

const memory = new Map();

const backend = (() => {
  try {
    const probe = '__nn_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return {
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => memory.set(k, v),
      removeItem: (k) => memory.delete(k),
    };
  }
})();

function read(key, fallback) {
  try {
    const raw = backend.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    backend.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Fremde oder alte Daten auf das erwartete Format bringen. */
export function normalizeTask(raw) {
  if (!raw || typeof raw.text !== 'string' || !raw.text.trim()) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    text: raw.text.trim().slice(0, 2000),
    done: Boolean(raw.done),
    flagged: Boolean(raw.flagged),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    doneAt: Number.isFinite(raw.doneAt) ? raw.doneAt : null,
    source: raw.source === 'voice' ? 'voice' : 'typed',
  };
}

export function loadTasks() {
  const raw = read(TASK_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeTask).filter(Boolean);
}

export function saveTasks(tasks) {
  return write(TASK_KEY, tasks);
}

export function createTask(text, source = 'typed') {
  return normalizeTask({ text, source, createdAt: Date.now() });
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) };
}

export function saveSettings(settings) {
  return write(SETTINGS_KEY, { ...DEFAULT_SETTINGS, ...settings });
}

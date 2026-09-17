/**
 * Nachtnotiz – Aufgaben diktieren, ohne dabei richtig wach zu werden.
 * Hält den Zustand im Speicher, schreibt nach jeder Änderung in den localStorage
 * und zeichnet die Liste bei strukturellen Änderungen neu.
 */

import { loadTasks, saveTasks, createTask, loadSettings, saveSettings, normalizeTask } from './store.js';
import { toTasks, formatTime } from './parse.js';
import { extractDue, formatDue, toInputValue } from './datetime.js';
import * as reminders from './reminders.js';
import { createDictation, isSupported } from './speech.js';

const $ = (selector) => document.querySelector(selector);

const el = {
  mic: $('#btn-mic'),
  micLabel: $('#mic-label'),
  live: $('#live'),
  notice: $('#notice'),
  list: $('#list'),
  empty: $('#empty'),
  count: $('#count'),
  filters: document.querySelectorAll('.chip[data-filter]'),
  form: $('#form-manual'),
  input: $('#input-manual'),
  menu: $('#menu'),
  menuBtn: $('#btn-menu'),
  dimBtn: $('#btn-dim'),
  toast: $('#toast'),
  toastText: $('#toast-text'),
  toastAction: $('#toast-action'),
  optAutosplit: $('#opt-autosplit'),
  optFillers: $('#opt-fillers'),
  optContinuous: $('#opt-continuous'),
  optLang: $('#opt-lang'),
  optDue: $('#opt-due'),
  notifyBtn: $('#btn-notify'),
  notifyState: $('#notify-state'),
  dueDialog: $('#due-dialog'),
  dueTask: $('#due-task'),
  dueCustom: $('#due-custom'),
  dueClear: $('#due-clear'),
  quickButtons: document.querySelectorAll('[data-quick]'),
  fileImport: $('#file-import'),
};

let tasks = loadTasks();
let settings = loadSettings();
let toastTimer = null;
let undoAction = null;
let wakeLock = null;
let dueTarget = null;

/* ---------------------------------------------------------------- Zustand */

function persist() {
  if (!saveTasks(tasks)) {
    showNotice('Speichern fehlgeschlagen – der Browser lässt keinen lokalen Speicher zu. Die Liste geht beim Neuladen verloren.');
  }
}

function visibleTasks() {
  if (settings.filter === 'open') return tasks.filter((task) => !task.done);
  if (settings.filter === 'done') return tasks.filter((task) => task.done);
  return tasks;
}

function addTexts(texts, source) {
  const fresh = texts
    .map((text) => (settings.dueFromSpeech ? extractDue(text) : { text, dueAt: null }))
    .map(({ text, dueAt }) => createTask(text, source, dueAt))
    .filter(Boolean);
  if (!fresh.length) return 0;

  // Neues kommt nach oben, innerhalb eines Diktats bleibt die Reihenfolge des Gesagten.
  tasks = [...fresh, ...tasks];
  persist();
  render();

  const withDue = fresh.filter((task) => task.dueAt);
  if (withDue.length) ensureRemindersFor(withDue);
  return fresh.length;
}

/* -------------------------------------------------------------- Oberfläche */

function render() {
  const items = visibleTasks();
  const open = tasks.filter((task) => !task.done).length;

  el.count.textContent = tasks.length ? `· ${open} offen` : '';
  el.empty.hidden = items.length > 0;
  if (items.length === 0) {
    el.empty.textContent = tasks.length
      ? 'Für diesen Filter gibt es nichts.'
      : 'Noch nichts notiert. Sprich einfach los, der Rest kann bis morgen warten.';
  }

  el.list.replaceChildren(...items.map(renderItem));
}

function renderItem(task) {
  const li = document.createElement('li');
  li.className = `item${task.done ? ' is-done' : ''}${task.flagged ? ' is-flagged' : ''}`;
  li.dataset.id = task.id;

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'item-check';
  check.checked = task.done;
  check.setAttribute('aria-label', task.done ? 'Als offen markieren' : 'Als erledigt markieren');
  check.addEventListener('change', () => toggleDone(task.id));

  const body = document.createElement('div');
  body.className = 'item-body';

  const text = document.createElement('textarea');
  text.className = 'item-text';
  text.rows = 1;
  text.value = task.text;
  text.setAttribute('aria-label', 'Aufgabentext bearbeiten');
  text.addEventListener('input', () => autoGrow(text));
  text.addEventListener('change', () => editText(task.id, text.value));
  text.addEventListener('blur', () => editText(task.id, text.value));
  text.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      text.blur();
    }
  });

  const meta = document.createElement('p');
  meta.className = 'item-meta';
  meta.textContent = `${task.source === 'voice' ? 'diktiert' : 'getippt'} · ${formatTime(task.createdAt)}`;

  body.append(text, meta);

  if (task.dueAt) {
    const overdue = !task.done && task.dueAt <= Date.now();
    const due = document.createElement('button');
    due.type = 'button';
    due.className = `due-chip${overdue ? ' is-overdue' : ''}`;
    due.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16l-2-3M10 22h4"/></svg>`;
    due.append(document.createTextNode(`${overdue ? 'überfällig, ' : ''}${formatDue(task.dueAt)}`));
    due.title = 'Erinnerung ändern';
    due.addEventListener('click', () => openDueDialog(task.id));
    body.append(due);
  }

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  actions.append(
    iconButton(
      task.dueAt ? 'Erinnerung ändern' : 'Erinnerung setzen',
      '<path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16l-2-3M10 22h4"/>',
      () => openDueDialog(task.id),
      Boolean(task.dueAt),
    ),
    iconButton(
      task.flagged ? 'Markierung entfernen' : 'Als wichtig markieren',
      '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
      () => toggleFlag(task.id),
      task.flagged,
    ),
    iconButton(
      'Aufgabe löschen',
      '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
      () => removeTask(task.id),
    ),
  );

  li.append(check, body, actions);
  requestAnimationFrame(() => autoGrow(text));
  return li;
}

function iconButton(label, path, onClick, active = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-btn${active ? ' is-on' : ''}`;
  button.title = label;
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg><span class="sr-only">${label}</span>`;
  button.addEventListener('click', onClick);
  return button;
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function showNotice(message) {
  el.notice.textContent = message;
  el.notice.hidden = !message;
}

function showToast(message, onUndo) {
  clearTimeout(toastTimer);
  undoAction = onUndo ?? null;
  el.toastText.textContent = message;
  el.toastAction.hidden = !onUndo;
  el.toast.hidden = false;
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast() {
  clearTimeout(toastTimer);
  el.toast.hidden = true;
  undoAction = null;
}

/* ------------------------------------------------------------- Aktionen */

function toggleDone(id) {
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return;

  task.done = !task.done;
  task.doneAt = task.done ? Date.now() : null;
  persist();
  render();

  // Erledigtes soll nachts nicht mehr klingeln.
  if (task.done) reminders.cancel(task.id);
  else if (task.dueAt) reminders.schedule(task);

  if (task.done) {
    showToast('Erledigt.', () => {
      task.done = false;
      task.doneAt = null;
      persist();
      render();
      if (task.dueAt) reminders.schedule(task);
      hideToast();
    });
  }
}

/* ---------------------------------------------------------- Erinnerungen */

function updateNotifyState() {
  const state = reminders.permission();
  const ahead = reminders.canScheduleAhead;

  if (!reminders.canNotify) {
    el.notifyState.textContent = 'Dieser Browser kennt keine Benachrichtigungen. Fällige Aufgaben werden beim Öffnen der App oben hervorgehoben.';
  } else if (state === 'granted') {
    el.notifyState.textContent = ahead
      ? 'Benachrichtigungen sind erlaubt. Der Browser meldet sich auch bei geschlossener App.'
      : 'Benachrichtigungen sind erlaubt. Sie erscheinen, solange die App läuft; verpasste Fälligkeiten kommen beim nächsten Öffnen.';
  } else if (state === 'denied') {
    el.notifyState.textContent = 'Benachrichtigungen sind blockiert. Du kannst sie in den Seiteneinstellungen des Browsers wieder erlauben.';
  } else {
    el.notifyState.textContent = 'Noch nicht erlaubt. Ohne Erlaubnis siehst du fällige Aufgaben nur in der Liste.';
  }

  el.notifyBtn.hidden = !reminders.canNotify || state !== 'default';
}

/** Erlaubnis einholen (nur wenn nötig) und die Meldungen beim Browser vormerken. */
async function ensureRemindersFor(newTasks) {
  const granted = await reminders.ensurePermission();
  updateNotifyState();

  if (!granted) {
    showToast('Termin gespeichert, Benachrichtigungen sind aber nicht erlaubt.');
    return;
  }
  await Promise.all(newTasks.map(reminders.schedule));
}

function checkDueTasks() {
  const overdue = reminders.findDue(tasks);
  if (!overdue.length) return;

  overdue.forEach((task) => {
    task.notifiedAt = Date.now();
    reminders.fire(task);
  });
  persist();
  render();

  if (reminders.permission() !== 'granted') {
    showToast(overdue.length === 1 ? 'Eine Aufgabe ist fällig.' : `${overdue.length} Aufgaben sind fällig.`);
  }
}

function openDueDialog(id) {
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return;

  dueTarget = id;
  el.dueTask.textContent = task.text;
  el.dueCustom.value = toInputValue(task.dueAt ?? Date.now() + 3_600_000);
  el.dueClear.hidden = !task.dueAt;
  el.dueDialog.showModal();
}

function quickTimestamp(kind) {
  const date = new Date();
  if (kind === '60') return date.getTime() + 3_600_000;

  if (kind === 'evening') {
    date.setHours(19, 0, 0, 0);
    if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
    return date.getTime();
  }

  const hour = kind === 'tomorrow-18' ? 18 : 8;
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

function setDue(id, dueAt) {
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return;

  task.dueAt = dueAt;
  task.notifiedAt = null;
  persist();
  render();

  if (dueAt) {
    ensureRemindersFor([task]);
    showToast(`Erinnerung ${formatDue(dueAt)}.`);
  } else {
    reminders.cancel(id);
    showToast('Erinnerung entfernt.');
  }
}

function toggleFlag(id) {
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return;
  task.flagged = !task.flagged;
  persist();
  render();
}

function editText(id, value) {
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return;

  const next = value.trim();
  if (!next) {
    removeTask(id);
    return;
  }
  if (next === task.text) return;

  task.text = next.slice(0, 2000);
  persist();
}

function removeTask(id) {
  const index = tasks.findIndex((entry) => entry.id === id);
  if (index === -1) return;

  const [removed] = tasks.splice(index, 1);
  reminders.cancel(removed.id);
  persist();
  render();

  showToast('Aufgabe gelöscht.', () => {
    tasks.splice(index, 0, removed);
    persist();
    render();
    hideToast();
  });
}

function clearDone() {
  const removed = tasks.filter((task) => task.done);
  if (!removed.length) {
    showToast('Es gibt nichts Erledigtes zum Aufräumen.');
    return;
  }

  const snapshot = tasks;
  tasks = tasks.filter((task) => !task.done);
  persist();
  render();

  showToast(`${removed.length} erledigte Aufgabe${removed.length === 1 ? '' : 'n'} gelöscht.`, () => {
    tasks = snapshot;
    persist();
    render();
    hideToast();
  });
}

/* --------------------------------------------------------------- Diktat */

const dictation = createDictation({
  onStart() {
    el.mic.setAttribute('aria-pressed', 'true');
    el.micLabel.textContent = 'Ich höre zu – tippen zum Stoppen';
    showNotice('');
    requestWakeLock();
  },

  onInterim(text) {
    el.live.innerHTML = '';
    if (!text) return;
    const span = document.createElement('span');
    span.className = 'interim';
    span.textContent = text;
    el.live.append(span);
  },

  onFinal(transcript) {
    const texts = toTasks(transcript, {
      removeFillers: settings.fillers,
      autosplit: settings.autosplit,
    });
    const added = addTexts(texts, 'voice');
    el.live.textContent = texts.join(' · ');
    if (added) showToast(added === 1 ? 'Notiert.' : `${added} Aufgaben notiert.`);
  },

  onStop() {
    el.mic.setAttribute('aria-pressed', 'false');
    el.micLabel.textContent = 'Tippen zum Diktieren';
    releaseWakeLock();
    setTimeout(() => {
      if (!dictation.listening) el.live.textContent = '';
    }, 2500);
  },

  onError(message) {
    el.mic.setAttribute('aria-pressed', 'false');
    el.micLabel.textContent = 'Tippen zum Diktieren';
    releaseWakeLock();
    showNotice(message);
  },
});

function toggleDictation() {
  if (dictation.listening) {
    dictation.stop();
    return;
  }
  el.live.textContent = '';
  dictation.start({ lang: settings.lang, continuous: settings.continuous });
}

/* Display soll während des Diktats nicht ausgehen. */
async function requestWakeLock() {
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}

/* ------------------------------------------------------------ Datenexport */

function exportJson() {
  const payload = { app: 'nachtnotiz', version: 1, exportedAt: new Date().toISOString(), tasks };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nachtnotiz-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importJson(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = (Array.isArray(parsed) ? parsed : parsed.tasks ?? []).map(normalizeTask).filter(Boolean);
    if (!incoming.length) {
      showToast('In der Datei stehen keine Aufgaben.');
      return;
    }

    const known = new Set(tasks.map((task) => task.id));
    const fresh = incoming.filter((task) => !known.has(task.id));
    tasks = [...fresh, ...tasks];
    persist();
    render();
    reminders.syncAll(tasks);
    showToast(`${fresh.length} Aufgabe${fresh.length === 1 ? '' : 'n'} importiert.`);
  } catch {
    showToast('Die Datei ließ sich nicht lesen.');
  }
}

async function copyAsText() {
  const text = visibleTasks()
    .map((task) => `${task.done ? '[x]' : '[ ]'} ${task.text}`)
    .join('\n');

  if (!text) {
    showToast('Nichts zu kopieren.');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast('In die Zwischenablage kopiert.');
  } catch {
    showToast('Kopieren hat der Browser abgelehnt.');
  }
}

/* --------------------------------------------------------- Einstellungen */

function updateSettings(patch) {
  settings = { ...settings, ...patch };
  saveSettings(settings);
}

function applySettings() {
  el.optAutosplit.checked = settings.autosplit;
  el.optFillers.checked = settings.fillers;
  el.optContinuous.checked = settings.continuous;
  el.optDue.checked = settings.dueFromSpeech;
  el.optLang.value = settings.lang;

  document.body.classList.toggle('is-dimmed', settings.dimmed);
  el.dimBtn.setAttribute('aria-pressed', String(settings.dimmed));

  el.filters.forEach((chip) => {
    const active = chip.dataset.filter === settings.filter;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
}

/* ---------------------------------------------------------------- Events */

el.mic.addEventListener('click', toggleDictation);

el.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const added = addTexts(toTasks(el.input.value, { removeFillers: false, autosplit: false }), 'typed');
  if (added) el.input.value = '';
  el.input.focus();
});

el.filters.forEach((chip) => {
  chip.addEventListener('click', () => {
    updateSettings({ filter: chip.dataset.filter });
    applySettings();
    render();
  });
});

el.menuBtn.addEventListener('click', () => {
  const open = el.menu.hidden;
  el.menu.hidden = !open;
  el.menuBtn.setAttribute('aria-expanded', String(open));
});

el.dimBtn.addEventListener('click', () => {
  updateSettings({ dimmed: !settings.dimmed });
  applySettings();
});

el.optAutosplit.addEventListener('change', () => updateSettings({ autosplit: el.optAutosplit.checked }));
el.optFillers.addEventListener('change', () => updateSettings({ fillers: el.optFillers.checked }));
el.optContinuous.addEventListener('change', () => updateSettings({ continuous: el.optContinuous.checked }));
el.optLang.addEventListener('change', () => updateSettings({ lang: el.optLang.value }));
el.optDue.addEventListener('change', () => updateSettings({ dueFromSpeech: el.optDue.checked }));

el.notifyBtn.addEventListener('click', async () => {
  await reminders.ensurePermission();
  updateNotifyState();
  reminders.syncAll(tasks);
});

el.quickButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const id = dueTarget;
    el.dueDialog.close('quick');
    setDue(id, quickTimestamp(button.dataset.quick));
  });
});

el.dueDialog.addEventListener('close', () => {
  const id = dueTarget;
  const choice = el.dueDialog.returnValue;
  dueTarget = null;
  if (!id) return;

  if (choice === 'clear') {
    setDue(id, null);
    return;
  }
  if (choice !== 'save') return;

  const picked = new Date(el.dueCustom.value).getTime();
  if (Number.isNaN(picked)) {
    showToast('Kein gültiger Zeitpunkt.');
    return;
  }
  setDue(id, picked);
});

$('#btn-export').addEventListener('click', exportJson);
$('#btn-copy').addEventListener('click', copyAsText);
$('#btn-clear-done').addEventListener('click', clearDone);
$('#btn-import').addEventListener('click', () => el.fileImport.click());

el.fileImport.addEventListener('change', () => {
  const [file] = el.fileImport.files ?? [];
  if (file) importJson(file);
  el.fileImport.value = '';
});

el.toastAction.addEventListener('click', () => undoAction?.());

// Leertaste startet und stoppt das Diktat, solange nicht getippt wird.
document.addEventListener('keydown', (event) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (event.code === 'Space' && !typing && isSupported) {
    event.preventDefault();
    toggleDictation();
  }
  if (event.key === 'Escape' && dictation.listening) dictation.stop();
});

// Im Hintergrund weiterzuhören kostet nur Akku.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && dictation.listening) dictation.stop();
  // Zurück aus dem Hintergrund: verpasste Fälligkeiten nachreichen.
  if (!document.hidden) {
    checkDueTasks();
    render();
  }
});

/* ----------------------------------------------------------------- Start */

applySettings();
render();
updateNotifyState();
checkDueTasks();

// Fällige Aufgaben im Minutentakt prüfen, solange die App offen ist.
setInterval(checkDueTasks, 30_000);
reminders.syncAll(tasks);

if (!isSupported) {
  el.mic.disabled = true;
  el.micLabel.textContent = 'Diktat hier nicht verfügbar';
  showNotice('Dieser Browser kann keine Spracherkennung. Am zuverlässigsten läuft sie in Chrome, Edge oder Safari. Tippen funktioniert überall.');
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* Offline-Betrieb ist ein Extra, kein Muss. */
    });
  });
}

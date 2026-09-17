/**
 * Erinnerungen.
 *
 * Zwei Wege, je nachdem was der Browser kann:
 * 1. Notification Triggers (`TimestampTrigger`): der Browser meldet sich zur
 *    gesetzten Zeit auch dann, wenn die App geschlossen ist.
 * 2. Rückfallebene: solange die App offen ist, prüft ein Timer jede halbe Minute.
 *    Beim nächsten Öffnen werden verpasste Fälligkeiten nachgereicht.
 *
 * Ohne Server gibt es keinen dritten Weg – Web Push bräuchte genau das.
 */

export const canNotify = typeof Notification !== 'undefined';

export const canScheduleAhead = canNotify
  && 'serviceWorker' in navigator
  && typeof globalThis.TimestampTrigger === 'function'
  && 'showTrigger' in Notification.prototype;

const TAG_PREFIX = 'nachtnotiz-task-';

export function permission() {
  return canNotify ? Notification.permission : 'denied';
}

/** Fragt die Erlaubnis erst dann, wenn der Nutzer wirklich eine Erinnerung will. */
export async function ensurePermission() {
  if (!canNotify) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

function options(task, extra = {}) {
  return {
    body: 'Fällige Aufgabe aus deiner Nachtnotiz.',
    tag: TAG_PREFIX + task.id,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    requireInteraction: true,
    data: { id: task.id },
    ...extra,
  };
}

/** Meldung sofort anzeigen. */
export async function fire(task) {
  if (permission() !== 'granted') return false;
  const reg = await registration();
  try {
    if (reg) await reg.showNotification(task.text, options(task));
    else new Notification(task.text, options(task));
    return true;
  } catch {
    return false;
  }
}

/** Meldung für später beim Browser hinterlegen, sofern er das kann. */
export async function schedule(task) {
  if (!canScheduleAhead || permission() !== 'granted') return false;
  if (!task.dueAt || task.done || task.dueAt <= Date.now()) return false;

  const reg = await registration();
  if (!reg) return false;

  try {
    await cancel(task.id);
    await reg.showNotification(task.text, options(task, {
      showTrigger: new globalThis.TimestampTrigger(task.dueAt),
    }));
    return true;
  } catch {
    return false;
  }
}

export async function cancel(taskId) {
  const reg = await registration();
  if (!reg) return;
  try {
    const pending = await reg.getNotifications({ tag: TAG_PREFIX + taskId, includeTriggered: true });
    pending.forEach((notification) => notification.close());
  } catch {
    /* Der Browser kennt keine vorgemerkten Meldungen. */
  }
}

/** Alle vorgemerkten Meldungen neu setzen, z. B. nach einer Änderung. */
export async function syncAll(tasks) {
  if (!canScheduleAhead || permission() !== 'granted') return;
  await Promise.all(tasks.filter((task) => task.dueAt && !task.done).map(schedule));
}

/** Offene Aufgaben, deren Zeitpunkt erreicht ist und die noch nicht gemeldet wurden. */
export function findDue(tasks, now = Date.now()) {
  return tasks.filter((task) => !task.done && task.dueAt && task.dueAt <= now && !task.notifiedAt);
}

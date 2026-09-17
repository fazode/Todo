/**
 * Erkennt deutsche Zeitangaben in diktiertem Text und trennt sie vom Aufgabentext.
 *
 * Absichtlich konservativ: erkannt wird nur, was eindeutig nach Termin klingt
 * („morgen“, „um 9 Uhr“, „in zwei Stunden“, „am Montag“). Steht keine solche
 * Angabe im Text, bleibt er unverändert und ohne Fälligkeit.
 */

const NUMBER_WORDS = {
  ein: 1, eine: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6,
  sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
};

const WEEKDAYS = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6,
};

// Tageszeiten ohne konkrete Uhrzeit.
const DAYTIMES = {
  'früh': 8, 'morgens': 8, 'morgen früh': 8, 'vormittag': 10, 'vormittags': 10,
  'mittag': 12, 'mittags': 12, 'nachmittag': 15, 'nachmittags': 15,
  'abend': 19, 'abends': 19, 'nacht': 22, 'nachts': 22,
};

// Uhrzeit, wenn nur ein Tag genannt wurde.
const DEFAULT_HOUR = 9;

const NUMBER_PATTERN = `\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')}`;

// Wortgrenzen als Unicode-Lookarounds, damit „übermorgen“ und „fünf“ sauber greifen.
const WS = '(?<![\\p{L}\\p{N}])';
const WE = '(?![\\p{L}\\p{N}])';

function toNumber(value) {
  if (value == null) return null;
  const text = String(value).trim().toLowerCase();
  if (/^\d+$/.test(text)) return Number(text);
  return NUMBER_WORDS[text] ?? null;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function cut(text, match) {
  return `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
}

function tidy(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,;:.-]+/, '')
    .trim();
}

function capitalize(text) {
  return text ? text[0].toLocaleUpperCase('de-DE') + text.slice(1) : text;
}

/**
 * @param {string} input   Aufgabentext, möglicherweise mit Zeitangabe
 * @param {Date}   now     Bezugszeitpunkt (für Tests überschreibbar)
 * @returns {{text: string, dueAt: number|null}}
 */
export function extractDue(input, now = new Date()) {
  let text = String(input ?? '');
  if (!text.trim()) return { text: tidy(text), dueAt: null };

  let dayOffset = null;      // Tage ab heute
  let weekday = null;        // konkreter Wochentag
  let hour = null;
  let minute = 0;
  let relativeMs = null;     // „in zwei Stunden“
  let daytimeHint = null;    // „abends“ – verschiebt eine Uhrzeit < 12 in den Abend

  // „in zwei Stunden“, „in 30 Minuten“, „in drei Tagen“
  const relative = text.match(new RegExp(`${WS}in\\s+(${NUMBER_PATTERN})\\s+(minuten?|stunden?|tagen?|wochen?)${WE}`, 'iu'));
  if (relative) {
    const amount = toNumber(relative[1]);
    const unit = relative[2].toLowerCase();
    if (amount) {
      const factor = unit.startsWith('minute') ? 60_000
        : unit.startsWith('stunde') ? 3_600_000
          : unit.startsWith('tag') ? 86_400_000
            : 604_800_000;
      relativeMs = amount * factor;
      text = cut(text, relative);
    }
  }

  // „heute“, „morgen“, „übermorgen“
  if (relativeMs === null) {
    const day = text.match(new RegExp(`${WS}(heute|morgen|übermorgen)${WE}`, 'iu'));
    if (day) {
      const word = day[1].toLowerCase();
      dayOffset = word === 'heute' ? 0 : word === 'morgen' ? 1 : 2;
      text = cut(text, day);
    }

    // „am Montag“, „Freitag“
    const named = text.match(new RegExp(`${WS}(?:am\\s+|nächsten\\s+)?(${Object.keys(WEEKDAYS).join('|')})${WE}`, 'iu'));
    if (named && dayOffset === null) {
      weekday = WEEKDAYS[named[1].toLowerCase()];
      text = cut(text, named);
    }

    // Tageszeit („abends“, „nachmittags“)
    const daytime = text.match(new RegExp(`${WS}(${Object.keys(DAYTIMES).join('|')})${WE}`, 'iu'));
    if (daytime) {
      daytimeHint = daytime[1].toLowerCase();
      text = cut(text, daytime);
    }

    // „um halb zehn“
    const half = text.match(new RegExp(`${WS}um\\s+halb\\s+(${NUMBER_PATTERN})${WE}`, 'iu'));
    if (half) {
      const next = toNumber(half[1]);
      if (next) {
        hour = (next + 11) % 12 || 12;
        minute = 30;
        text = cut(text, half);
      }
    }

    // „um 9“, „um 9:30 Uhr“, „9 Uhr 30“ – ohne „um“ nur mit dem Wort „Uhr“
    if (hour === null) {
      const clock = text.match(new RegExp(
        `${WS}(?:(um)\\s+)?(${NUMBER_PATTERN})(?:\\s*[:.]\\s*(\\d{2}))?\\s*(uhr)?(?:\\s+(\\d{1,2}))?${WE}`,
        'iu',
      ));
      if (clock && (clock[1] || clock[4])) {
        const parsed = toNumber(clock[2]);
        if (parsed !== null && parsed <= 24) {
          hour = parsed === 24 ? 0 : parsed;
          minute = Number(clock[3] ?? clock[5] ?? 0) || 0;
          if (minute > 59) minute = 0;
          text = cut(text, clock);
        }
      }
    }
  }

  // Nichts gefunden: Text unverändert lassen.
  if (relativeMs === null && dayOffset === null && weekday === null && hour === null && daytimeHint === null) {
    return { text: tidy(text), dueAt: null };
  }

  if (relativeMs !== null) {
    return { text: capitalize(tidy(text)), dueAt: now.getTime() + relativeMs };
  }

  if (hour === null && daytimeHint) hour = DAYTIMES[daytimeHint];
  // Abends gesprochene Uhrzeiten meinen den Abend: „abends um 8“ ist 20 Uhr.
  if (hour !== null && hour < 12 && daytimeHint && DAYTIMES[daytimeHint] >= 12) hour += 12;
  if (hour === null) hour = DEFAULT_HOUR;

  let due = startOfDay(now);
  if (weekday !== null) {
    const diff = (weekday - due.getDay() + 7) % 7;
    due = addDays(due, diff === 0 ? 7 : diff);
  } else if (dayOffset !== null) {
    due = addDays(due, dayOffset);
  }

  due.setHours(hour, minute, 0, 0);

  // Reine Uhrzeit ohne Tag: heute, wenn sie noch kommt, sonst morgen.
  if (weekday === null && dayOffset === null && due.getTime() <= now.getTime()) {
    due = addDays(due, 1);
  }

  return { text: capitalize(tidy(text)), dueAt: due.getTime() };
}

/** „fällig morgen 09:00“ – kurz genug für die Zeile unter der Aufgabe. */
export function formatDue(timestamp, now = new Date()) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);

  if (days === 0) return `heute ${time}`;
  if (days === 1) return `morgen ${time}`;
  if (days === -1) return `gestern ${time}`;
  if (days > 1 && days < 7) return `${date.toLocaleDateString('de-DE', { weekday: 'long' })} ${time}`;
  return `${date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${time}`;
}

/** Zeitstempel für ein <input type="datetime-local">. */
export function toInputValue(timestamp) {
  const date = new Date(timestamp ?? Date.now());
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

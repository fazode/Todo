/**
 * Aufbereitung des diktierten Rohtexts: Füllwörter raus, Sprachbefehle
 * interpretieren, lange Diktate in einzelne Aufgaben zerlegen.
 */

// \b kennt nur ASCII-Wortzeichen und würde mitten in „ähm“ greifen,
// deshalb die Wortgrenzen als Unicode-Lookarounds.
const WORD_START = '(?<![\\p{L}\\p{N}])';
const WORD_END = '(?![\\p{L}\\p{N}])';

// Bewusst knapp gehalten: nur Laute, die nie Teil einer echten Aufgabe sind.
const FILLERS = new RegExp(`${WORD_START}(?:äh+m?|öh+m?|ehm|hm+|mhm|ähem)${WORD_END}`, 'giu');

// Abkürzungen, hinter denen ein Punkt kein Satzende ist.
const ABBREVIATIONS = ['bzw', 'ca', 'evtl', 'ggf', 'inkl', 'usw', 'etc', 'vgl', 'max', 'min', 'Nr', 'Dr', 'Prof', 'Abb', 'Tel'];

// Phrasen, an denen eine neue Aufgabe beginnt.
const SPLIT_PHRASES = [
  'neue aufgabe',
  'nächste aufgabe',
  'nächster punkt',
  'neuer punkt',
  'außerdem muss ich',
  'außerdem sollte ich',
  'und dann muss ich',
  'und dann noch',
  'new task',
  'next task',
];

// Diktierte Satzzeichen, die Browser gelegentlich als Wort liefern.
const SPOKEN_PUNCTUATION = [
  [/\s*\b(punkt|full stop)\b\s*$/i, '.'],
  [/\s*\b(fragezeichen|question mark)\b\s*$/i, '?'],
  [/\s*\b(ausrufezeichen|exclamation mark)\b\s*$/i, '!'],
];

function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function capitalize(text) {
  return text ? text[0].toLocaleUpperCase('de-DE') + text.slice(1) : text;
}

function splitOnPhrases(text) {
  const pattern = new RegExp(`\\s*${WORD_START}(?:${SPLIT_PHRASES.join('|')})${WORD_END}[,:]?\\s*`, 'giu');
  return text.split(pattern);
}

function splitOnSentences(text) {
  // Satzende: Punkt, dann Großbuchstabe. Einzelne Buchstaben („z. B.“) und
  // gängige Abkürzungen („ca.“) sind ausgenommen.
  const pattern = new RegExp(
    `(?<!${WORD_START}\\p{L}\\.)(?<!${WORD_START}(?:${ABBREVIATIONS.join('|')})\\.)(?<=[.!?])\\s+(?=\\p{Lu})`,
    'u',
  );
  return text.split(pattern);
}

/**
 * Wandelt ein Diktat-Segment in eine Liste von Aufgaben-Texten um.
 *
 * @param {string} raw            Rohtext aus der Spracherkennung
 * @param {{removeFillers?: boolean, autosplit?: boolean}} options
 * @returns {string[]}
 */
export function toTasks(raw, options = {}) {
  const { removeFillers = true, autosplit = true } = options;

  let text = collapse(String(raw ?? ''));
  if (!text) return [];

  if (removeFillers) text = collapse(text.replace(FILLERS, ' '));
  for (const [pattern, replacement] of SPOKEN_PUNCTUATION) {
    text = text.replace(pattern, replacement);
  }
  // Leerzeichen vor Satzzeichen entfernen, die durch das Filtern entstanden sind.
  text = text.replace(/\s+([,.;:!?])/g, '$1');
  if (!text.replace(/[^\p{L}\p{N}]/gu, '')) return [];

  const parts = autosplit
    ? splitOnPhrases(text).flatMap(splitOnSentences)
    : [text];

  return parts
    .map((part) => collapse(part).replace(/^[,;:.\s]+/, ''))
    .filter((part) => part.replace(/[^\p{L}\p{N}]/gu, '').length > 0)
    .map(capitalize);
}

/** Datum kurz und schlafzimmertauglich: „heute 03:14“ statt ISO-Ballast. */
export function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

  if (days === 0) return `heute ${time}`;
  if (days === 1) return `gestern ${time}`;
  if (days < 7) return `${date.toLocaleDateString('de-DE', { weekday: 'long' })} ${time}`;
  return `${date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })} ${time}`;
}

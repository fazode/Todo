import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractDue, formatDue } from '../src/js/datetime.js';

// Donnerstag, 17.09.2026, 23:30 Uhr – die typische Situation dieser App.
const NOW = new Date(2026, 8, 17, 23, 30, 0, 0);

function due(text, now = NOW) {
  const result = extractDue(text, now);
  return { text: result.text, at: result.dueAt === null ? null : new Date(result.dueAt) };
}

test('erkennt „morgen“ und setzt die Standarduhrzeit', () => {
  const { text, at } = due('morgen den Vertrag kündigen');
  assert.equal(text, 'Den Vertrag kündigen');
  assert.deepEqual([at.getDate(), at.getHours(), at.getMinutes()], [18, 9, 0]);
});

test('erkennt „übermorgen“ mit Uhrzeit', () => {
  const { text, at } = due('übermorgen um 14:30 Termin bestätigen');
  assert.equal(text, 'Termin bestätigen');
  assert.deepEqual([at.getDate(), at.getHours(), at.getMinutes()], [19, 14, 30]);
});

test('schiebt eine bereits vergangene Uhrzeit auf den nächsten Tag', () => {
  const { text, at } = due('um 9 Uhr Zahnarzt anrufen');
  assert.equal(text, 'Zahnarzt anrufen');
  assert.deepEqual([at.getDate(), at.getHours()], [18, 9]);
});

test('versteht „in zwei Stunden“', () => {
  const { text, at } = due('in zwei Stunden Wäsche aufhängen');
  assert.equal(text, 'Wäsche aufhängen');
  assert.equal(at.getTime(), NOW.getTime() + 2 * 3_600_000);
});

test('versteht „in 30 Minuten“', () => {
  const { at } = due('in 30 Minuten Ofen ausschalten');
  assert.equal(at.getTime(), NOW.getTime() + 30 * 60_000);
});

test('nimmt den nächsten genannten Wochentag', () => {
  const { text, at } = due('am Montag die Rechnung schreiben');
  assert.equal(text, 'Die Rechnung schreiben');
  assert.equal(at.getDay(), 1);
  assert.deepEqual([at.getDate(), at.getHours()], [21, 9]);
});

test('setzt bei „morgen früh“ acht Uhr', () => {
  const { text, at } = due('morgen früh das Backup prüfen');
  assert.equal(text, 'Das Backup prüfen');
  assert.deepEqual([at.getDate(), at.getHours()], [18, 8]);
});

test('deutet eine Uhrzeit mit „abends“ als Abendstunde', () => {
  const { text, at } = due('abends um 8 den Müll rausbringen');
  assert.equal(text, 'Den Müll rausbringen');
  assert.equal(at.getHours(), 20);
});

test('versteht „um halb zehn“', () => {
  const { at } = due('um halb zehn Rückruf');
  assert.deepEqual([at.getHours(), at.getMinutes()], [9, 30]);
});

test('versteht „9 Uhr 30“ ohne „um“', () => {
  const { at } = due('9 Uhr 30 Meeting vorbereiten');
  assert.deepEqual([at.getHours(), at.getMinutes()], [9, 30]);
});

test('lässt Text ohne Zeitangabe unangetastet', () => {
  for (const input of ['Kapitel 3 lesen', 'Um Rückruf bitten', 'Version 2 deployen']) {
    const { text, at } = due(input);
    assert.equal(at, null, input);
    assert.equal(text, input);
  }
});

test('formatiert Fälligkeiten kurz', () => {
  assert.match(formatDue(new Date(2026, 8, 18, 9, 0).getTime(), NOW), /^morgen \d{2}:\d{2}$/);
  assert.match(formatDue(new Date(2026, 8, 17, 9, 0).getTime(), NOW), /^heute \d{2}:\d{2}$/);
  assert.equal(formatDue(new Date(2026, 8, 21, 9, 0).getTime(), NOW), 'Montag 09:00');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toTasks, formatTime } from '../src/js/parse.js';

test('entfernt Füllwörter und macht einen sauberen Satz daraus', () => {
  assert.deepEqual(
    toTasks('ähm ich muss äh morgen den Vertrag kündigen'),
    ['Ich muss morgen den Vertrag kündigen'],
  );
});

test('lässt Füllwörter stehen, wenn das Filtern abgeschaltet ist', () => {
  assert.deepEqual(
    toTasks('ähm Rechnung schreiben', { removeFillers: false }),
    ['Ähm Rechnung schreiben'],
  );
});

test('trennt an Sprachbefehlen in mehrere Aufgaben', () => {
  assert.deepEqual(
    toTasks('Müll rausbringen neue Aufgabe Zahnarzttermin machen'),
    ['Müll rausbringen', 'Zahnarzttermin machen'],
  );
});

test('trennt an Satzenden', () => {
  assert.deepEqual(
    toTasks('Backup prüfen. Deployment planen.'),
    ['Backup prüfen.', 'Deployment planen.'],
  );
});

test('trennt nichts, wenn das Auto-Trennen aus ist', () => {
  assert.deepEqual(
    toTasks('Backup prüfen. Deployment planen.', { autosplit: false }),
    ['Backup prüfen. Deployment planen.'],
  );
});

test('trennt nicht an Abkürzungen', () => {
  assert.deepEqual(
    toTasks('Doku ergänzen, z. B. die API-Beispiele', { autosplit: true }),
    ['Doku ergänzen, z. B. die API-Beispiele'],
  );
});

test('setzt diktierte Satzzeichen um', () => {
  assert.deepEqual(toTasks('Urlaub buchen Fragezeichen'), ['Urlaub buchen?']);
});

test('gibt für leere oder sinnlose Eingaben nichts zurück', () => {
  assert.deepEqual(toTasks('   '), []);
  assert.deepEqual(toTasks('ähm äh'), []);
  assert.deepEqual(toTasks(null), []);
});

test('formatiert heutige Zeitstempel als „heute“', () => {
  const now = new Date();
  now.setHours(3, 14, 0, 0);
  assert.match(formatTime(now.getTime()), /^heute \d{2}:\d{2}$/);
});

test('formatiert gestrige Zeitstempel als „gestern“', () => {
  const yesterday = new Date(Date.now() - 86_400_000);
  yesterday.setHours(23, 5, 0, 0);
  assert.match(formatTime(yesterday.getTime()), /^gestern \d{2}:\d{2}$/);
});

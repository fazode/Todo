/**
 * Dünne Hülle um die Web Speech API (SpeechRecognition).
 *
 * Besonderheiten, die hier abgefangen werden:
 * - Der Dienst beendet sich auf Mobilgeräten nach jeder Sprechpause selbst.
 *   Solange der Nutzer nicht gestoppt hat, starten wir neu.
 * - `no-speech` und `aborted` sind Normalbetrieb, keine Fehler für den Nutzer.
 * - Ein Neustart direkt im `end`-Handler wirft in manchen Browsern,
 *   deshalb der Umweg über setTimeout.
 */

const SpeechRecognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

export const isSupported = Boolean(SpeechRecognition);

const SILENT_ERRORS = new Set(['no-speech', 'aborted']);

const ERROR_MESSAGES = {
  'not-allowed': 'Der Zugriff auf das Mikrofon wurde blockiert. Erlaube ihn in den Seiteneinstellungen des Browsers.',
  'service-not-allowed': 'Der Browser lässt die Spracherkennung gerade nicht zu. Ein Neuladen der Seite hilft meistens.',
  'audio-capture': 'Kein Mikrofon gefunden. Prüfe, ob ein Mikrofon angeschlossen und freigegeben ist.',
  network: 'Die Spracherkennung braucht kurz Internet. Offline kannst du die Aufgabe eintippen.',
  'language-not-supported': 'Diese Sprache unterstützt der Browser nicht. Wähle eine andere im Menü.',
};

export function createDictation({ onStart, onInterim, onFinal, onStop, onError }) {
  let recognition = null;
  let wantsToListen = false;
  let restartTimer = null;
  let options = { lang: 'de-DE', continuous: true };

  function buildRecognition() {
    const instance = new SpeechRecognition();
    instance.lang = options.lang;
    instance.continuous = options.continuous;
    instance.interimResults = true;
    instance.maxAlternatives = 1;

    instance.onstart = () => onStart?.();

    instance.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          onFinal?.(transcript);
        } else {
          interim += transcript;
        }
      }
      onInterim?.(interim);
    };

    instance.onerror = (event) => {
      if (SILENT_ERRORS.has(event.error)) return;
      wantsToListen = false;
      onError?.(ERROR_MESSAGES[event.error] || 'Die Spracherkennung hat abgebrochen. Versuch es noch einmal.');
    };

    instance.onend = () => {
      if (wantsToListen && options.continuous) {
        restartTimer = setTimeout(() => {
          try {
            instance.start();
          } catch {
            wantsToListen = false;
            onStop?.();
          }
        }, 250);
        return;
      }
      wantsToListen = false;
      onStop?.();
    };

    return instance;
  }

  return {
    get listening() {
      return wantsToListen;
    },

    start(nextOptions = {}) {
      if (!isSupported || wantsToListen) return false;
      options = { ...options, ...nextOptions };
      recognition = buildRecognition();
      wantsToListen = true;
      try {
        recognition.start();
        return true;
      } catch {
        wantsToListen = false;
        onError?.('Das Diktat lässt sich gerade nicht starten. Lade die Seite neu.');
        return false;
      }
    },

    stop() {
      wantsToListen = false;
      clearTimeout(restartTimer);
      try {
        recognition?.stop();
      } catch {
        /* Instanz war bereits beendet. */
      }
    },
  };
}

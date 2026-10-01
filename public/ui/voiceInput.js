/**
 * Speaking a message instead of typing it, with the browser's own speech
 * recognition (Chrome, Edge, Safari). Where a browser has none — Firefox —
 * the button is not shown at all, rather than shown and failing.
 *
 * The words go into the composer as they are heard, after anything already
 * typed, for the person to read and send; nothing is sent by itself. The
 * language is the page's: Arabic pages listen for Arabic.
 */
(function (global) {
  'use strict';

  /**
   * @param {{button: HTMLButtonElement, input: HTMLTextAreaElement, language: () => string, t: (key: string) => string, toast: (message: string) => void}} deps
   */
  function createVoiceInput({ button, input, language, t, toast }) {
    const Recognition = global.SpeechRecognition || global.webkitSpeechRecognition;
    // The button starts hidden in the page; it is shown only where it works.
    if (!Recognition) return { supported: false, stop() {} };
    button.hidden = false;
    let recognition = null;

    function show(listening) {
      const label = t(listening ? 'voiceStop' : 'voiceStart');
      button.setAttribute('aria-label', label);
      button.title = label;
      button.setAttribute('aria-pressed', String(listening));
      button.classList.toggle('is-listening', listening);
    }

    // The person's own variety when their browser names one, else a common one.
    function tag() {
      const own = String(global.navigator.language || '');
      if (language() === 'ar') return /^ar-/i.test(own) ? own : 'ar-JO';
      return /^en-/i.test(own) ? own : 'en-US';
    }

    function start() {
      if (input.disabled) return;
      const typed = input.value.trim() ? input.value.replace(/\s*$/, ' ') : '';
      const r = new Recognition();
      r.lang = tag();
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (event) => {
        let heard = '';
        for (let i = 0; i < event.results.length; i++) heard += event.results[i][0].transcript;
        input.value = typed + heard;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      r.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') toast(t('voiceDenied'));
        else if (event.error === 'no-speech') toast(t('voiceNothing'));
        else if (event.error !== 'aborted') toast(t('voiceFailed'));
      };
      r.onend = () => {
        if (recognition === r) recognition = null;
        show(false);
        input.focus();
      };
      try {
        r.start();
        recognition = r;
        show(true);
      } catch (_) {
        toast(t('voiceFailed'));
      }
    }

    function stop() {
      if (recognition) recognition.stop();
    }

    show(false);
    button.addEventListener('click', () => (recognition ? stop() : start()));
    return { supported: true, stop };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createVoiceInput = createVoiceInput;
})(window);

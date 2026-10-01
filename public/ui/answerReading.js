/**
 * Taking an answer's words away: copying them, or hearing them read aloud
 * with the browser's own voices (public/domain/speech.js decides what is
 * read). The voice follows the answer's language, not the page's: an
 * English answer on an Arabic page is read in English.
 *
 * Where a browser cannot speak, there is no Listen button rather than one
 * that does nothing.
 */
(function (global) {
  'use strict';

  const COPY = '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" stroke="#10B981" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  const SPEAKER = '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"></path></svg>';
  const STOP = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"></rect></svg>';

  /**
   * @param {{t: (key: string) => string, copy: (text: string) => Promise<boolean>}} deps
   */
  function createAnswerReading({ t, copy }) {
    const synth = global.speechSynthesis;
    const Utterance = global.SpeechSynthesisUtterance;
    /** @type {HTMLButtonElement | null} */
    let speaking = null;

    function mark(button, on) {
      const label = t(on ? 'readStop' : 'readAloud');
      button.title = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(on));
      button.classList.toggle('is-speaking', on);
      button.innerHTML = on ? STOP : SPEAKER;
    }

    function stop() {
      if (!synth) return;
      synth.cancel();
      if (speaking) mark(speaking, false);
      speaking = null;
    }

    function speak(button, markdown) {
      stop();
      const text = global.QjoDomain.speech.speakable(markdown);
      const lang = global.QjoDomain.language.documentLanguage(text) === 'ar' ? 'ar' : 'en';
      const voice = synth.getVoices().find((v) => String(v.lang).toLowerCase().startsWith(lang)) || null;
      const parts = global.QjoDomain.speech.chunks(text);
      speaking = button;
      mark(button, true);
      parts.forEach((part, i) => {
        const u = new Utterance(part);
        u.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
        if (voice) u.voice = voice;
        const done = () => { if (speaking === button) { mark(button, false); speaking = null; } };
        if (i === parts.length - 1) u.onend = done;
        u.onerror = done;
        synth.speak(u);
      });
    }

    /**
     * Copy, and Listen where the browser can speak and there is something to
     * hear, at the start of an answer's toolbar.
     * @param {HTMLElement} toolbar
     * @param {() => string} answerText the answer as shown
     * @param {string} markdown the answer as written
     * @param {(title: string, svg: string, onClick: (b: HTMLButtonElement) => void) => HTMLButtonElement} iconButton
     */
    function appendButtons(toolbar, answerText, markdown, iconButton) {
      toolbar.appendChild(iconButton(t('copyAnswer'), COPY, async (b) => {
        if (!(await copy(answerText()))) return;
        b.innerHTML = CHECK;
        setTimeout(() => { b.innerHTML = COPY; }, 1300);
      }));
      if (!synth || !Utterance || !global.QjoDomain.speech.speakable(markdown)) return;
      const listen = iconButton(t('readAloud'), SPEAKER, (b) => (speaking === b ? stop() : speak(b, markdown)));
      listen.classList.add('qjo-read-aloud');
      listen.setAttribute('aria-pressed', 'false');
      toolbar.appendChild(listen);
    }

    // Leaving the page, or the conversation, ends the reading.
    global.addEventListener('pagehide', stop);
    return { appendButtons, stop };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createAnswerReading = createAnswerReading;
})(window);

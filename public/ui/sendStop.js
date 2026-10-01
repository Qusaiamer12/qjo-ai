/**
 * The send button turns into Stop while an answer is being written.
 *
 * Stop was a 24-pixel word in the status line, and the line went away once
 * the answer started to appear: a long answer could not be stopped at all,
 * while the big button beside the composer sat grey and did nothing. The
 * same button now sends and stops, where the thumb already is.
 */
(function (global) {
  'use strict';

  const STOP_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>';

  /**
   * @param {{button: HTMLButtonElement, t: (key: string) => string}} deps
   */
  function createSendStop({ button, t }) {
    const sendIcon = button.innerHTML;
    let stopping = false;

    /** Shows Send, or Stop while an answer is being written. */
    function setBusy(busy) {
      if (busy === stopping) return;
      stopping = busy;
      button.classList.toggle('is-stop', busy);
      button.innerHTML = busy ? STOP_ICON : sendIcon;
      const label = t(busy ? 'stopAnswer' : 'sendBtn');
      button.setAttribute('aria-label', label);
      button.title = label;
    }

    return { setBusy, isStop: () => stopping };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createSendStop = createSendStop;
})(window);

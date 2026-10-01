/**
 * Editing the last message sent: it goes back into the composer, and it and
 * everything after it leave the conversation — the screen here, the history
 * the model is sent and the saved chat through `rewind` (app.js's
 * rewindHistoryToLastQuestion) — so the edited message is asked as if the
 * first had never been.
 *
 * Only the last message: an earlier one has answers after it that would
 * have to be thrown away too. Not a message that carried files: those are
 * not in the composer to send again.
 */
(function (global) {
  'use strict';

  const PENCIL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  /**
   * @param {{t: (key: string) => string, canEdit: () => boolean, rewind: () => void, composer: HTMLTextAreaElement, composerChanged: () => void}} deps
   */
  function createMessageEditor({ t, canEdit, rewind, composer, composerChanged }) {
    /** Offers Edit under this message, and takes it away from any earlier one. */
    function offer(wrap, text) {
      document.querySelectorAll('.qjo-edit-message').forEach((b) => b.remove());
      if (!wrap || !String(text || '').trim()) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'qjo-edit-message';
      button.innerHTML = PENCIL;
      button.append(t('editMessage'));
      button.setAttribute('aria-label', t('editMessage'));
      button.addEventListener('click', () => {
        if (!canEdit()) return;
        while (wrap.nextElementSibling) wrap.nextElementSibling.remove();
        wrap.remove();
        rewind();
        composer.value = text;
        composerChanged();
        composer.focus();
      });
      wrap.appendChild(button);
    }

    return { offer };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createMessageEditor = createMessageEditor;
})(window);

/**
 * Marks the page while an on-screen keyboard has shrunk it: body gets
 * `qjo-keyboard-resized`, and the phone's floating Flash and Tools step aside
 * (design-system.css).
 *
 * app.js marks `qjo-keyboard-open` when the visual viewport is shorter than
 * the window — iOS, where the keyboard covers the page. The page asks Android
 * for interactive-widget=resizes-content (index.html), and there the keyboard
 * shrinks the window itself: innerHeight and the visual viewport fall
 * together, the two never differ, and the pills stayed over the conversation
 * with the keyboard open. Here the window is compared with its own height
 * before the keyboard: shorter by more than a keyboard's worth while
 * something editable has focus is a keyboard. Without focus there is no
 * keyboard, so that height is the page's full one.
 */
(function (global) {
  'use strict';

  const KEYBOARD_PX = 120;
  const CLASS = 'qjo-keyboard-resized';

  /** @param {Element | null} el */
  const editable = (el) => Boolean(el && (/** @type {HTMLElement} */ (el).isContentEditable || /^(TEXTAREA|SELECT)$/.test(el.tagName)
    || (el.tagName === 'INPUT' && !/^(button|checkbox|radio|range|color|file|submit|reset|image)$/i.test(/** @type {HTMLInputElement} */ (el).type))));

  /** @param {Window} win */
  function install(win) {
    const doc = win.document;
    let width = win.innerWidth;
    let full = win.innerHeight;

    const check = () => {
      const focused = editable(doc.activeElement);
      // A new width is a turned or resized screen: start again from it.
      if (win.innerWidth !== width) { width = win.innerWidth; full = win.innerHeight; }
      else if (!focused) full = win.innerHeight;
      else full = Math.max(full, win.innerHeight);
      const open = focused && full - win.innerHeight > KEYBOARD_PX;
      if (doc.body) doc.body.classList.toggle(CLASS, open);
      return open;
    };
    // Focus moves before the keyboard opens, and leaves before it closes.
    const later = () => win.setTimeout(check, 0);

    win.addEventListener('resize', check, { passive: true });
    if (win.visualViewport) win.visualViewport.addEventListener('resize', check, { passive: true });
    doc.addEventListener('focusin', later);
    doc.addEventListener('focusout', later);
    return { isOpen: check };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.keyboardWatch = install(global);
})(window);

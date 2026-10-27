/**
 * Whether the conversation follows an answer as it is written.
 *
 * It used to be decided after the new text was already on the page: "less
 * than 120px from the bottom" was measured once a code block or a table had
 * rendered, a render taller than that read as the reader having scrolled
 * away, and the page stopped following for the rest of the answer — on the
 * first code block, usually.
 *
 * So the page follows until the reader goes back up themselves — a finger
 * pulling the conversation down, a wheel turned up, a key, the scroll bar —
 * and follows again once they come back down to the end. Content growing, and
 * the page's own scrolling, never decide it. What an answer adds as it ends
 * — its buttons — is followed as well.
 */
(function (global) {
  'use strict';

  const UP_KEYS = new Set(['ArrowUp', 'PageUp', 'Home']);
  // A drag on the scroll bar is seen by its scrolling, shortly after the press.
  const DRAG_WINDOW_MS = 1000;
  const AFTER_ANSWER_MS = 1500;

  /**
   * @param {{scroller: HTMLElement, toBottom: () => void, settled: (atBottom?: boolean) => void, atBottomPx?: number, win?: Window}} deps
   *   toBottom: scrolls to the end; settled: told after each request, with
   *   true when it scrolled there and nothing when it did not (it measures).
   */
  function createScrollFollow({ scroller, toBottom, settled, atBottomPx = 40, win = global }) {
    let following = true;
    let pending = false;
    let pressedAt = -Infinity;
    /** @type {number | null} */
    let touchY = null;
    const passive = { passive: true };
    const leave = () => { following = false; };
    /** @param {TouchEvent} event */
    const fingerY = (event) => (event.touches[0] ? event.touches[0].clientY : null);

    scroller.addEventListener('wheel', (event) => { if (event.deltaY < 0) leave(); }, passive);
    scroller.addEventListener('touchstart', (event) => { touchY = fingerY(event); }, passive);
    // The finger moving down the screen pulls the conversation back up.
    scroller.addEventListener('touchmove', (event) => {
      const y = fingerY(event);
      if (y !== null && touchY !== null && y > touchY + 2) leave();
      touchY = y;
    }, passive);
    scroller.addEventListener('pointerdown', () => { pressedAt = win.performance.now(); }, passive);
    win.addEventListener('keydown', (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (!typing && (UP_KEYS.has(event.key) || (event.key === ' ' && event.shiftKey))) leave();
    });

    // From the end of the conversation: the scroller's, and the page's.
    const distance = () => {
      const doc = win.document.documentElement;
      return Math.max(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight, doc.scrollHeight - win.innerHeight - win.scrollY);
    };
    const position = () => scroller.scrollTop + win.scrollY;
    let lastPosition = position();
    const onScroll = () => {
      const at = position();
      const up = at < lastPosition - 1;
      lastPosition = at;
      if (up && win.performance.now() - pressedAt < DRAG_WINDOW_MS) leave();
      else if (!up && distance() < atBottomPx) following = true;
    };
    scroller.addEventListener('scroll', onScroll, passive);
    win.addEventListener('scroll', onScroll, passive);

    const scrollSoon = () => {
      if (pending) return;
      pending = true;
      win.requestAnimationFrame(() => {
        pending = false;
        if (following) { toBottom(); lastPosition = position(); }
        settled(following || undefined);
      });
    };
    // Growth just after an answer's text — its buttons, drawn when it ends —
    // is followed too. Later growth (a card the reader opens) is theirs.
    let requestedAt = -Infinity;
    const content = scroller.firstElementChild;
    if (win.ResizeObserver && content) {
      new win.ResizeObserver(() => { if (following && win.performance.now() - requestedAt < AFTER_ANSWER_MS) scrollSoon(); }).observe(content);
    }

    return {
      isFollowing: () => following,
      /** The page took the reader to the bottom (a new message, the button). */
      follow() { following = true; },
      /** The answer grew: once a frame, to its end if the reader is following. */
      request() { requestedAt = win.performance.now(); scrollSoon(); }
    };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createScrollFollow = createScrollFollow;
})(window);

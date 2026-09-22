/**
 * Runs before app.js and decides whether app.js is allowed to run at all.
 *
 * app.js used to be one file: if it loaded, all of it loaded. Splitting it into
 * modules added four more files that can each fail on their own — a flaky
 * mobile connection, a proxy that drops one request. Measured before this
 * existed: with the markdown module missing, app.js died at load on a
 * destructuring error and the page sat there looking normal but doing nothing;
 * with the streaming module missing, the page loaded fine and then crashed on
 * the first message. Neither told the person anything.
 *
 * So: check that every module arrived. If one did not, try one reload — that
 * fixes a dropped request, which is the usual cause — and if it still fails,
 * say so plainly with a way to retry. It never reloads twice, so a file that is
 * genuinely missing from a bad deploy cannot turn into a reload loop.
 *
 * Deliberately self-contained: it cannot use anything from the modules it is
 * checking for, so its message is built from plain DOM and inline styles.
 */
(function () {
  'use strict';

  const REQUIRED = [
    ['markdown rendering', () => window.QjoDomain && window.QjoDomain.markdown],
    ['request failure handling', () => window.QjoDomain && window.QjoDomain.classifyRequestFailure],
    ['stream protocol', () => window.QjoDomain && window.QjoDomain.createSseParser],
    ['streaming view', () => window.QjoUI && window.QjoUI.createStreamingView]
  ];

  const RELOAD_FLAG = 'qjo_boot_reloaded';

  function readFlag() {
    try { return sessionStorage.getItem(RELOAD_FLAG); } catch (_) { return null; }
  }
  function writeFlag() {
    try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch (_) { /* storage blocked */ }
  }
  function clearFlag() {
    try { sessionStorage.removeItem(RELOAD_FLAG); } catch (_) { /* storage blocked */ }
  }

  function showFailure(missing) {
    const box = document.createElement('div');
    box.className = 'qjo-load-failure';
    box.setAttribute('role', 'alert');
    box.setAttribute('dir', 'rtl');
    box.style.cssText = [
      'position:fixed', 'inset:auto 16px 16px 16px', 'z-index:2147483647',
      'max-width:520px', 'margin:0 auto', 'padding:16px 18px', 'border-radius:14px',
      'background:#1f2937', 'color:#f9fafb', 'font:14px/1.6 system-ui,sans-serif',
      'box-shadow:0 10px 30px rgba(0,0,0,.35)'
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:6px';
    title.textContent = 'ما اكتمل تحميل التطبيق';

    const body = document.createElement('div');
    body.style.cssText = 'opacity:.85;margin-bottom:12px';
    body.textContent = 'في جزء ما وصل — غالبًا الاتصال انقطع لحظة. تحديث الصفحة بيحلها عادةً.';

    const detail = document.createElement('div');
    detail.style.cssText = 'opacity:.55;font-size:12px;margin-bottom:12px;direction:ltr;text-align:right';
    detail.textContent = 'missing: ' + missing.join(', ');

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'تحديث الصفحة';
    button.style.cssText = 'border:0;border-radius:999px;padding:8px 16px;font-weight:700;cursor:pointer;background:#f9fafb;color:#111827';
    button.addEventListener('click', () => { clearFlag(); location.reload(); });

    box.append(title, body, detail, button);
    (document.body || document.documentElement).appendChild(box);
  }

  const missing = REQUIRED.filter(([, present]) => !present()).map(([name]) => name);

  if (!missing.length) {
    // A clean load clears the flag, so a later failure gets its own retry.
    clearFlag();
    window.__qjoBootOk = true;
    return;
  }

  window.__qjoBootOk = false;
  console.error('[boot] modules failed to load:', missing.join(', '));

  if (!readFlag()) {
    writeFlag();
    location.reload();
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => showFailure(missing), { once: true });
  } else {
    showFailure(missing);
  }
})();

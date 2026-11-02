/**
 * The reasoning card of an answer opened again from a saved chat.
 *
 * The live card (ui/streamingView.js) was translated; this one was written in
 * English inside app.js, so a saved chat opened in Arabic read "Reasoning" and
 * "Completed". Every word comes from the catalog now (i18n.js, both languages).
 *
 * Pure: text in, HTML out. `t` and `escapeHtml` are handed in; the reasoning is
 * the model's text and is escaped before it is put in any markup.
 */
(function () {
  'use strict';

  /**
   * @param {{ text?: string, isDone?: boolean, elapsed?: string, t: (key: string, vars?: object) => string, escapeHtml: (s: string) => string }} o
   * @returns {string}
   */
  function renderReasoningCardHtml({ text, isDone = true, elapsed = '', t, escapeHtml }) {
    const rawLines = String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
    let stepsHtml = '';
    for (const line of rawLines) {
      const isTool = /^(✓|used|searched|تم استخدام|تم البحث)/i.test(line);
      stepsHtml += `<div class="qjo-reasoning-step${isTool ? ' tool-step' : ''}">
          <span class="qjo-step-dot"></span>
          ${isTool ? '<span class="tool-check">✓</span>' : ''}
          <span>${escapeHtml(line.replace(/^[✓•\-*]\s*/, ''))}</span>
        </div>`;
    }
    const timer = isDone
      ? (elapsed ? t('reasoningThoughtFor', { time: elapsed }) : t('reasoningCompleted'))
      : (elapsed || '0.1s');
    return `
        <div class="qjo-reasoning-card${isDone ? ' collapsed' : ''}">
          <div class="qjo-reasoning-header">
            <div class="qjo-reasoning-title">
              ${!isDone ? '<span class="qjo-reasoning-pulse"></span>' : ''}
              <span class="qjo-reasoning-label">${escapeHtml(t(isDone ? 'reasoningLabel' : 'reasoningLabelLive'))}</span>
              <span class="qjo-reasoning-timer">${escapeHtml(timer)}</span>
            </div>
            <button type="button" class="qjo-reasoning-toggle" aria-label="${escapeHtml(t('reasoningToggle'))}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
          </div>
          <div class="qjo-reasoning-body">
            <div class="qjo-reasoning-timeline">
              ${stepsHtml || `<div class="qjo-reasoning-step"><span class="qjo-step-dot"></span><span>${escapeHtml(t('reasoningFallbackStep'))}</span></div>`}
            </div>
          </div>
        </div>
      `;
  }

  const api = { renderReasoningCardHtml };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.reasoningCard = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

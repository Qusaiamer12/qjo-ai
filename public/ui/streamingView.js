/**
 * The assistant bubble while an answer is streaming: the reasoning card, the
 * timeline of steps, and the answer text as it arrives.
 *
 * Extracted from sendMessage, which was 588 lines with a cyclomatic complexity
 * of 126 — 126 independent paths through one function, past the point where it
 * can be reasoned about or meaningfully tested. Roughly 210 of those lines were
 * this: a dozen mutable DOM handles and four timers, tangled with request
 * building and error handling that had nothing to do with them.
 *
 * It owns its own state and takes everything else as a dependency, so it can be
 * driven directly by a test without a network or a send.
 */
(function (global) {
  'use strict';

  /**
   * @param {object} deps
   * @param {(role: string, content: string, extraClass?: string) => HTMLElement} deps.addMessage
   * @param {(text: string) => string} deps.escapeHtml
   * @param {(text: string) => string} deps.renderMarkdown
   * @param {() => void} deps.requestSmoothScroll
   * @param {() => string} deps.getLanguage Read at render time, not captured.
   * @param {number} [deps.renderIntervalMs]
   */
  function createStreamingView(deps) {
    const { addMessage, escapeHtml, renderMarkdown, requestSmoothScroll, getLanguage } = deps;

    // Re-rendering faster than the eye can read buys nothing. This used to
    // re-parse the whole accumulated answer on every animation frame and then
    // force a synchronous layout read, which measured 32.9ms median frames
    // (~30fps) during a 4s stream. Token capture is untouched: `answer`
    // accumulates every chunk regardless of how often the DOM is rebuilt.
    const RENDER_INTERVAL_MS = deps.renderIntervalMs || 90;

    let wrap = null;
    let bubble = null;
    let contentContainer = null;
    let started = false;

    let reasoningCard = null;
    let reasoningTimeline = null;
    let reasoningTimerEl = null;
    let reasoningLabelEl = null;
    let reasoningDivider = null;
    let reasoningActive = false;
    let reasoningRaw = '';
    let reasoningStartTime = null;
    let reasoningElapsed = '0.0s';
    let reasoningTimerInterval = null;
    let currentActiveStep = null;

    let reasoningBuffer = '';
    let reasoningFlushTimer = null;

    let answer = '';
    let lastRenderAt = 0;
    let lastRenderedLength = -1;
    let renderTimerId = null;
    let renderRafId = null;

    const isArabic = () => getLanguage() === 'ar';

    function ensureElements() {
      if (started) return;
      wrap = addMessage('assistant', '');
      bubble = wrap.querySelector('.bubble');
      bubble.innerHTML = '';
      started = true;
    }

    function ensureReasoningCard() {
      ensureElements();
      if (reasoningCard) return;

      reasoningActive = true;
      reasoningStartTime = Date.now();
      reasoningCard = document.createElement('div');
      reasoningCard.className = 'qjo-reasoning-card';
      reasoningCard.innerHTML = `
            <div class="qjo-reasoning-header">
              <div class="qjo-reasoning-title">
                <span class="qjo-reasoning-pulse"></span>
                <span class="qjo-reasoning-label">${isArabic() ? 'التفكير...' : 'Reasoning...'}</span>
                <span class="qjo-reasoning-timer">0.1s</span>
              </div>
              <button type="button" class="qjo-reasoning-toggle" aria-label="Toggle Reasoning">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
              </button>
            </div>
            <div class="qjo-reasoning-body">
              <div class="qjo-reasoning-timeline"></div>
            </div>
          `;
      reasoningTimeline = reasoningCard.querySelector('.qjo-reasoning-timeline');
      reasoningTimerEl = reasoningCard.querySelector('.qjo-reasoning-timer');
      reasoningLabelEl = reasoningCard.querySelector('.qjo-reasoning-label');

      reasoningCard.querySelector('.qjo-reasoning-header')
        .addEventListener('click', () => reasoningCard.classList.toggle('collapsed'));

      reasoningTimerInterval = setInterval(() => {
        if (!reasoningStartTime) return;
        reasoningElapsed = ((Date.now() - reasoningStartTime) / 1000).toFixed(1) + 's';
        if (reasoningTimerEl) reasoningTimerEl.textContent = reasoningElapsed;
      }, 100);

      if (contentContainer) bubble.insertBefore(reasoningCard, contentContainer);
      else bubble.appendChild(reasoningCard);
    }

    /** A discrete, already-complete step — "searched the web", "read a page". */
    function addStep(text, isTool = false) {
      ensureReasoningCard();
      const step = document.createElement('div');
      step.className = 'qjo-reasoning-step' + (isTool ? ' tool-step' : '');
      step.setAttribute('dir', 'auto');
      step.innerHTML = isTool
        ? `<span class="qjo-step-dot"></span><span class="tool-check">✓</span><span>${escapeHtml(text)}</span>`
        : `<span class="qjo-step-dot"></span><span>${escapeHtml(text)}</span>`;
      reasoningTimeline.appendChild(step);
      requestSmoothScroll();
    }

    // A tool step appears when the tool starts and is ticked when it ends.
    // It used to appear only once finished, so a search in progress was an
    // empty card: the person could not tell working from frozen.
    const TOOL_NAMES = {
      en: { web_search: 'Searching the web', fetch_page: 'Reading a page', calculate: 'Calculating' },
      ar: { web_search: 'بحث في الويب', fetch_page: 'قراءة صفحة', calculate: 'حساب' }
    };
    const toolSteps = new Map();
    function toolStep({ tool = '', label = '', detail = '', status = '', done = false } = {}) {
      const key = `${tool}:${detail}`;
      let step = toolSteps.get(key);
      if (!step) {
        ensureReasoningCard();
        step = document.createElement('div');
        step.className = 'qjo-reasoning-step tool-step';
        step.setAttribute('dir', 'auto');
        reasoningTimeline.appendChild(step);
        toolSteps.set(key, step);
        requestSmoothScroll();
      }
      const finished = status === 'done' || done;
      const name = TOOL_NAMES[getLanguage() === 'ar' ? 'ar' : 'en'][tool] || label || tool;
      step.classList.toggle('is-running', !finished);
      step.innerHTML = `<span class="qjo-step-dot"></span>${finished ? '<span class="tool-check">✓</span>' : '<span class="tool-spinner" aria-hidden="true"></span>'}<span>${escapeHtml(detail ? `${name}: ${detail}` : name)}</span>`;
    }

    // Reasoning deltas arrive as fast as tokens, 100+/sec. Touching the DOM and
    // scrolling on each one forced a synchronous layout per delta — measured at
    // 2.53ms, 28x the cost of the write itself, which is where most of the
    // streaming jank lived.
    function flushReasoningBuffer() {
      if (reasoningFlushTimer) { clearTimeout(reasoningFlushTimer); reasoningFlushTimer = null; }
      const delta = reasoningBuffer;
      reasoningBuffer = '';
      if (!delta || !reasoningTimeline) return;

      const shouldStartNewStep = !currentActiveStep
        || delta.includes('\n')
        || (delta.includes('.') && currentActiveStep.textContent.length > 55);

      if (shouldStartNewStep) {
        currentActiveStep = document.createElement('div');
        currentActiveStep.className = 'qjo-reasoning-step';
        currentActiveStep.setAttribute('dir', 'auto');
        currentActiveStep.innerHTML = '<span class="qjo-step-dot"></span><span class="step-content"></span>';
        reasoningTimeline.appendChild(currentActiveStep);
      }
      const contentEl = currentActiveStep.querySelector('.step-content');
      if (contentEl) contentEl.textContent += delta.replace(/[\n\r]+/g, ' ');
      requestSmoothScroll();
    }

    /** Reasoning text as it streams. The transcript records every delta. */
    function streamReasoning(delta) {
      ensureReasoningCard();
      reasoningRaw += delta;
      if (!delta.trim()) return;
      reasoningBuffer += delta;
      if (!reasoningFlushTimer) {
        reasoningFlushTimer = setTimeout(flushReasoningBuffer, RENDER_INTERVAL_MS);
      }
    }

    function finishReasoning() {
      flushReasoningBuffer();
      if (!reasoningActive) return;
      reasoningActive = false;
      if (reasoningTimerInterval) { clearInterval(reasoningTimerInterval); reasoningTimerInterval = null; }
      if (reasoningStartTime) {
        reasoningElapsed = ((Date.now() - reasoningStartTime) / 1000).toFixed(1) + 's';
      }
      if (reasoningCard) {
        const pulse = reasoningCard.querySelector('.qjo-reasoning-pulse');
        if (pulse) pulse.remove();
      }
      if (reasoningLabelEl) {
        reasoningLabelEl.textContent = isArabic() ? 'مسار التفكير' : 'Reasoning';
      }
      if (reasoningTimerEl) {
        reasoningTimerEl.textContent = isArabic()
          ? `تم التفكير في ${reasoningElapsed}`
          : `Thought for ${reasoningElapsed}`;
      }
      if (!reasoningDivider) {
        reasoningDivider = document.createElement('div');
        reasoningDivider.className = 'qjo-reasoning-divider';
        if (contentContainer) bubble.insertBefore(reasoningDivider, contentContainer);
        else bubble.appendChild(reasoningDivider);
      }
    }

    function ensureContentContainer() {
      ensureElements();
      if (contentContainer) return;
      contentContainer = document.createElement('div');
      contentContainer.className = 'qjo-streamed-content';
      bubble.appendChild(contentContainer);
    }

    function renderStreamedContent() {
      if (!contentContainer) return;
      if (answer.length === lastRenderedLength) return;
      lastRenderedLength = answer.length;
      lastRenderAt = performance.now();
      contentContainer.innerHTML = renderMarkdown(answer) + '<span class="qjo-typing-cursor"></span>';
      requestSmoothScroll();
    }

    function scheduleRender() {
      if (renderTimerId) return;
      // The first chunk renders immediately (lastRenderAt starts at 0), so
      // time-to-first-visible-token is unchanged by the pacing.
      const delay = Math.max(0, RENDER_INTERVAL_MS - (performance.now() - lastRenderAt));
      renderTimerId = setTimeout(() => {
        renderTimerId = null;
        renderRafId = requestAnimationFrame(renderStreamedContent);
      }, delay);
    }

    /** Answer text as it streams. */
    function appendAnswer(text) {
      ensureContentContainer();
      answer += text;
      scheduleRender();
    }

    /** Cancels any queued render without drawing it. */
    function flushRenders() {
      if (renderTimerId) { clearTimeout(renderTimerId); renderTimerId = null; }
      if (renderRafId) { cancelAnimationFrame(renderRafId); renderRafId = null; }
    }

    /** The finished answer: full markdown pass, typing cursor removed. */
    function renderFinalAnswer() {
      if (contentContainer) contentContainer.innerHTML = renderMarkdown(answer);
      const cursor = bubble ? bubble.querySelector('.qjo-typing-cursor') : null;
      if (cursor) cursor.remove();
    }

    /** Every timer this view owns. Safe to call more than once. */
    function dispose() {
      flushRenders();
      if (reasoningFlushTimer) { clearTimeout(reasoningFlushTimer); reasoningFlushTimer = null; }
      if (reasoningTimerInterval) { clearInterval(reasoningTimerInterval); reasoningTimerInterval = null; }
    }

    /** Removes the reasoning card and answer container, leaving the bubble. */
    function clearForFailure() {
      dispose();
      if (reasoningCard) { reasoningCard.remove(); reasoningCard = null; }
      if (contentContainer) { contentContainer.remove(); contentContainer = null; }
    }

    return {
      ensureElements,
      ensureReasoningCard,
      addStep,
      toolStep,
      streamReasoning,
      finishReasoning,
      appendAnswer,
      flushRenders,
      renderFinalAnswer,
      clearForFailure,
      dispose,
      get wrap() { return wrap; },
      get bubble() { return bubble; },
      get contentContainer() { return contentContainer; },
      get reasoningCard() { return reasoningCard; },
      get started() { return started; },
      get reasoningActive() { return reasoningActive; },
      get answer() { return answer; },
      get reasoningTranscript() { return reasoningRaw; }
    };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createStreamingView = createStreamingView;
})(typeof window !== 'undefined' ? window : globalThis);

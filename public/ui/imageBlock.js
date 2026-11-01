/**
 * Pictures in an answer: an ```image block drawn as a picture the person can
 * save or have drawn again.
 *
 * What the block says, the address that draws it and the SVG it may carry are
 * public/domain/imageBlock.js; this asks the image service for the picture
 * when the card comes into view, says so while it waits, and never leaves a
 * broken image: a picture that has not arrived in LOAD_TIMEOUT_MS, or failed,
 * is replaced by the block's own (sanitised) SVG when it has one, or by a
 * plain statement of what happened. "Another version" is a new seed; it is
 * also the way to try again.
 *
 * The description leaves the page for an external service, and the card says
 * so. The page's own address is not sent with it (no referrer).
 */
(function (global) {
  'use strict';

  const LOAD_TIMEOUT_MS = 25000;

  /**
   * @param {{
   *   t: (key: string, vars?: Record<string, string | number>) => string,
   *   toast?: (message: string) => void,
   *   timeoutMs?: number,
   *   document?: Document
   * }} deps
   */
  function createImageBlocks(deps) {
    const { t } = deps;
    const doc = deps.document || global.document;
    const timeoutMs = deps.timeoutMs || LOAD_TIMEOUT_MS;
    const domain = () => global.QjoDomain.imageBlock;
    /** @type {WeakMap<Element, {spec: any, seed: number, title: string, source: string, attempt: number, timer: any, started: boolean}>} */
    const cards = new WeakMap();

    function el(tag, className, text) {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    }

    function button(className, label, title) {
      const node = el('button', className, label);
      node.type = 'button';
      node.title = title;
      return node;
    }

    const part = (card, name) => /** @type {HTMLElement} */ (card.querySelector(`.qjo-image-${name}`));

    /** loading → loaded, or → fallback (the block's SVG) or → error (a statement). */
    function setState(card, state, message) {
      card.dataset.state = state;
      const status = part(card, 'status');
      status.textContent = message || '';
      status.classList.toggle('is-error', state === 'error');
      part(card, 'again').disabled = state === 'loading';
      part(card, 'save').hidden = state !== 'loaded' && state !== 'fallback';
    }

    function show(card, src, alt) {
      const img = el('img', 'qjo-image-img');
      img.alt = alt;
      img.decoding = 'async';
      img.src = src;
      part(card, 'stage').replaceChildren(img);
      return img;
    }

    function fail(card) {
      const held = cards.get(card);
      held.attempt++;
      clearTimeout(held.timer);
      if (held.spec.svg) {
        // A drawing the page rebuilt from an allowlist, shown as an image: a browser runs nothing in one.
        show(card, domain().svgDataUrl(held.spec.svg), held.spec.alt || held.title);
        setState(card, 'fallback', t('imageFallbackNote'));
      } else {
        part(card, 'stage').replaceChildren();
        setState(card, 'error', t('imageFailed'));
      }
    }

    /** The stage while the picture is on its way. */
    function waiting(card) {
      const wait = el('div', 'qjo-image-wait');
      wait.setAttribute('role', 'status');
      wait.append(el('span', 'qjo-image-spinner'), el('span', 'qjo-image-wait-text', t('imageLoading', { seconds: Math.round(timeoutMs / 1000) })));
      part(card, 'stage').replaceChildren(wait);
      setState(card, 'loading');
    }

    function load(card) {
      const held = cards.get(card);
      const attempt = ++held.attempt;
      clearTimeout(held.timer);
      const stale = () => held.attempt !== attempt;
      waiting(card);

      const img = el('img', 'qjo-image-img');
      img.alt = held.spec.alt || held.title;
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', () => {
        if (stale()) return;
        clearTimeout(held.timer);
        part(card, 'stage').replaceChildren(img);
        setState(card, 'loaded');
      });
      img.addEventListener('error', () => { if (!stale()) fail(card); });
      held.timer = setTimeout(() => {
        if (stale()) return;
        fail(card);
        // Stop asking: a picture that arrives after the card gave up is not shown.
        img.removeAttribute('src');
      }, timeoutMs);
      img.src = domain().buildUrl(held.spec, held.seed);
    }

    function another(card) {
      const held = cards.get(card);
      if (!held || card.dataset.state === 'loading') return;
      held.seed = domain().anotherSeed(held.seed);
      load(card);
    }

    // ── Saving ────────────────────────────────────────────────────────────

    function fileName(held) {
      const base = (held.title || held.spec.prompt).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
      return `qjo-${base || 'picture'}`;
    }

    function save(blob, name) {
      const url = global.URL.createObjectURL(blob);
      const link = el('a');
      link.href = url;
      link.download = name;
      doc.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => global.URL.revokeObjectURL(url), 4000);
    }

    async function download(card) {
      const held = cards.get(card);
      if (!held) return;
      if (card.dataset.state === 'fallback') {
        save(new global.Blob([held.spec.svg], { type: 'image/svg+xml' }), `${fileName(held)}.svg`);
        return;
      }
      if (card.dataset.state !== 'loaded') return;
      const url = domain().buildUrl(held.spec, held.seed);
      try {
        const response = await global.fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' });
        const blob = response.ok ? await response.blob() : null;
        if (!blob || !/^image\//.test(blob.type)) throw new Error('not a picture');
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type] || 'png';
        save(blob, `${fileName(held)}.${extension}`);
      } catch (_) {
        // The browser would not hand the file over: the picture itself, in a tab, saved from there.
        global.open(url, '_blank', 'noopener');
        if (deps.toast) deps.toast(t('imageDownloadFailed'));
      }
    }

    // ── A card ────────────────────────────────────────────────────────────

    function problem(card, message, source) {
      const header = el('div', 'qjo-image-header');
      header.append(el('span', 'qjo-image-icon', '🎨'), el('span', 'qjo-image-title', t('imageDefaultTitle')));
      card.replaceChildren(header, el('div', 'qjo-image-status is-error', t('imageProblem', { error: message })));
      card.classList.add('has-error');
      if (source) {
        const details = el('details', 'qjo-image-source');
        details.append(el('summary', '', t('imageSource')), el('pre', '', source));
        card.append(details);
      }
    }

    const watcher = typeof global.IntersectionObserver === 'function'
      ? new global.IntersectionObserver((entries) => {
        for (const entry of entries) {
          const card = /** @type {HTMLElement} */ (entry.target);
          const held = cards.get(card);
          if (!entry.isIntersecting || !held || held.started) continue;
          held.started = true;
          watcher.unobserve(card);
          load(card);
        }
      }, { rootMargin: '300px 0px' })
      : null;

    /** Turns the picture blocks inside an element into cards. @param {ParentNode} element */
    function initialize(element) {
      if (!element) return;
      element.querySelectorAll('.qjo-image-card:not([data-ready])').forEach((node) => {
        const card = /** @type {HTMLElement} */ (node);
        card.dataset.ready = '1';
        let source = '';
        let result;
        try { source = decodeURIComponent(card.dataset.imageSpec || ''); result = domain().parse(source); } catch (_) { result = { ok: false, error: { code: 'unreadable' } }; }
        if (!result.ok) { problem(card, domain().explain(result.error, t), source); return; }
        const { spec } = result;
        const title = spec.title || t('imageDefaultTitle');

        const saveButton = button('qjo-image-save', t('imageDownload'), t('imageDownloadTitle'));
        saveButton.hidden = true;
        saveButton.addEventListener('click', () => download(card));
        const again = button('qjo-image-again', t('imageAnother'), t('imageAnotherTitle'));
        again.addEventListener('click', () => another(card));
        const header = el('div', 'qjo-image-header');
        header.append(el('span', 'qjo-image-icon', '🎨'), el('span', 'qjo-image-title', title), saveButton, again);

        const stage = el('div', 'qjo-image-stage');
        stage.style.aspectRatio = `${spec.width} / ${spec.height}`;
        card.replaceChildren(header, stage, el('div', 'qjo-image-status'), el('div', 'qjo-image-privacy', t('imageExternalNote')));
        const held = { spec, seed: domain().seedFor(spec), title, source, attempt: 0, timer: null, started: false };
        cards.set(card, held);
        waiting(card);
        if (watcher) watcher.observe(card);
        else { held.started = true; load(card); }
      });
    }

    return { initialize, LOAD_TIMEOUT_MS };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createImageBlocks = createImageBlocks;
})(typeof window !== 'undefined' ? window : globalThis);

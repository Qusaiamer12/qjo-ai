/**
 * The sources behind an answer: a strip above it, and citations inside it that
 * say where they point.
 *
 * Sources used to arrive as cards under the answer once it had finished, with
 * a domain and the words "web" or "official/docs" — no date, nothing of what
 * the source said, and a citation in the text was a bare "1" that meant
 * nothing until clicked. Now the strip appears the moment a search finishes,
 * each source with its site's icon, name, tier and date; a citation reads
 * "1 · WHO" and shows what that source says on hover, focus or tap.
 *
 * Everything drawn from a source is set as text, never as markup: titles and
 * snippets come from the web.
 */
(function (global) {
  'use strict';

  const MAX_SOURCES = 8;
  const SNIPPET_CHARS = 240;
  const TIER_KEYS = {
    official: 'tierOfficial', medical: 'tierMedical', academic: 'tierAcademic', news: 'tierNews',
    reference: 'tierReference', docs: 'tierDocs', code: 'tierCode', community: 'tierCommunity'
  };
  const TIER_ICONS = { official: '🏛️', medical: '🩺', academic: '🎓', news: '📰', reference: '📚', docs: '📘', code: '💻', community: '💬' };
  // A citation the model wrote: [1](url), or [[1]](url).
  const CITATION = /^\[?\s*(\d{1,3})\s*\]?$/;
  const STYLE_ID = 'qjo-source-strip-style';
  // Answers on a phone carry old !important rules that paint every link and
  // every span inside a link one colour. body:not(#_) matches the same body
  // and outranks them (an id in :not counts as an id), so the strip and the
  // citations keep their own colours without touching those rules.
  const HI = 'body:not(#_) .bubble';
  const STYLE = `
.qjo-sources { margin: 2px 0 12px; }
.qjo-sources-head { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; font: 700 12px/1.2 var(--ds-sans, system-ui, sans-serif); }
.qjo-sources-row { display: flex; gap: 8px; overflow-x: auto; scroll-snap-type: x proximity; padding: 2px 2px 6px; -webkit-overflow-scrolling: touch; }
${HI} a.qjo-source { flex: 0 0 196px; scroll-snap-align: start; display: flex; flex-direction: column; gap: 5px; padding: 9px 10px; border-radius: 12px;
  border: 1px solid var(--ds-line, #e6e7ec) !important; background: var(--ds-panel, #fff); text-decoration: none; min-width: 0; font-weight: 400; }
${HI} a.qjo-source:hover, ${HI} a.qjo-source:focus-visible { border-color: var(--ds-accent-line, rgba(29, 78, 216, .22)) !important; }
${HI} .qjo-sources-head, ${HI} .qjo-sources-head *, ${HI} a.qjo-source *, .qjo-cite-pop .qjo-source-top, .qjo-cite-pop .qjo-source-meta {
  color: var(--ds-muted, #71737d) !important; -webkit-text-fill-color: currentColor !important; }
${HI} a.qjo-source .qjo-source-title { color: var(--ds-ink, #0b0b0d) !important; }
.qjo-source-top { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; }
.qjo-source-icon { flex: none; width: 16px; height: 16px; border-radius: 4px; display: grid; place-items: center; overflow: hidden;
  background: var(--ds-panel-2, #f2f3f6); font: 700 10px/1 var(--ds-sans, system-ui, sans-serif); }
.qjo-source-icon img { width: 16px; height: 16px; display: block; }
.qjo-source-site { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.qjo-source-num { flex: none; min-width: 18px; height: 18px; border-radius: 9px; display: grid; place-items: center; padding: 0 5px;
  background: var(--ds-accent-soft, rgba(29, 78, 216, .08)); font: 700 11px/1 var(--ds-sans, system-ui, sans-serif); }
${HI} a.qjo-source .qjo-source-num { color: var(--ds-accent, #1d4ed8) !important; }
.qjo-source-title { font-size: 13px; font-weight: 600; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.qjo-source-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11px; }
.qjo-tier { border-radius: 6px; padding: 1px 6px; background: var(--ds-panel-2, #f2f3f6); white-space: nowrap; }
.qjo-tier[data-tier="official"], .qjo-tier[data-tier="medical"], .qjo-tier[data-tier="academic"] { background: rgba(22, 163, 74, .12); }
.qjo-tier[data-tier="community"] { background: rgba(217, 119, 6, .12); }
body:not(#_) .qjo-tier:is([data-tier="official"], [data-tier="medical"], [data-tier="academic"]) { color: #15803d !important; }
body:not(#_) .qjo-tier[data-tier="community"] { color: #b45309 !important; }
body.dark:not(#_) .qjo-tier:is([data-tier="official"], [data-tier="medical"], [data-tier="academic"]) { color: #4ade80 !important; }
body.dark:not(#_) .qjo-tier[data-tier="community"] { color: #fbbf24 !important; }
${HI} a.qjo-cite { display: inline-flex; align-items: center; gap: 3px; margin: 0 2px; padding: 0 6px; border-radius: 7px; vertical-align: baseline; border: 0 !important;
  font-size: .78em; font-weight: 600; line-height: 1.6; text-decoration: none; white-space: nowrap; unicode-bidi: isolate; background: var(--ds-accent-soft, rgba(29, 78, 216, .08)); }
${HI} a.qjo-cite, ${HI} a.qjo-cite * { color: var(--ds-accent, #1d4ed8) !important; -webkit-text-fill-color: currentColor !important; }
${HI} a.qjo-cite:hover, ${HI} a.qjo-cite:focus-visible, ${HI} a.qjo-cite[aria-expanded="true"] { background: var(--ds-accent-line, rgba(29, 78, 216, .22)); }
.qjo-cite-n { font-weight: 700; }
.qjo-cite-pop { position: fixed; z-index: 3000; width: min(320px, calc(100vw - 16px)); padding: 12px 13px; border-radius: 12px;
  border: 1px solid var(--ds-line, #e6e7ec); background: var(--ds-panel, #fff); color: var(--ds-ink, #0b0b0d);
  box-shadow: 0 12px 32px rgba(0, 0, 0, .18); font: 13px/1.5 var(--ds-sans, system-ui, sans-serif); }
.qjo-cite-pop[hidden] { display: none; }
.qjo-cite-pop .qjo-source-top { margin-bottom: 6px; }
.qjo-cite-pop strong { display: block; margin-bottom: 4px; }
.qjo-cite-pop p { margin: 0 0 8px; color: var(--ds-muted, #71737d); }
.qjo-cite-pop a { color: var(--ds-accent, #1d4ed8); font-weight: 600; text-decoration: none; }
`;

  /**
   * @param {object} deps
   * @param {(key: string, vars?: Record<string, string | number>) => string} deps.t
   * @param {() => string} deps.getLanguage
   * @param {Document} [deps.document]
   */
  function createSourceStrip(deps) {
    const { t, getLanguage } = deps;
    const doc = deps.document || global.document;
    const tiers = () => global.QjoDomain.sourceTier;
    /** @type {WeakMap<Element, {list: Source[], strip: HTMLElement | null}>} */
    const byWrap = new WeakMap();
    /** @type {WeakMap<Element, Source>} */
    const citeSource = new WeakMap();

    function styled() {
      if (doc.getElementById(STYLE_ID)) return;
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = STYLE;
      doc.head.appendChild(style);
    }

    const keyOf = (url) => {
      try {
        const u = new URL(url);
        return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}${u.search}`;
      } catch (_) { return ''; }
    };

    function trim(text, max) {
      const s = String(text || '').replace(/\s+/g, ' ').trim();
      return s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, '')}…` : s;
    }

    /**
     * One source, from any of the shapes the page receives: a tool_call or
     * toolsUsed source, or a pre-search source card (excerpt, date).
     * @returns {Source | null}
     * @typedef {{url: string, title: string, site: string, kind: string, published: string, snippet: string, host: string}} Source
     */
    function normalize(raw) {
      if (!raw) return null;
      let parsed;
      try { parsed = new URL(String(raw.url || '').trim()); } catch (_) { return null; }
      if (!/^https?:$/.test(parsed.protocol)) return null;
      const url = parsed.href;
      const published = String(raw.published || raw.date || '').slice(0, 10);
      return {
        url,
        host: parsed.hostname,
        title: trim(raw.title, 160) || parsed.hostname,
        site: trim(raw.site, 40) || tiers().siteName(url),
        kind: tiers().tierOf(url),
        published: /^\d{4}-\d{2}(-\d{2})?$/.test(published) ? published : '',
        snippet: trim(raw.snippet || raw.excerpt || raw.content, SNIPPET_CHARS)
      };
    }

    function dateText(published) {
      if (!published) return '';
      const date = new Date(published.length === 7 ? `${published}-01` : published);
      if (Number.isNaN(date.getTime())) return '';
      const options = published.length === 7 ? { year: 'numeric', month: 'short' } : { year: 'numeric', month: 'short', day: 'numeric' };
      try { return new Intl.DateTimeFormat(getLanguage() === 'ar' ? 'ar' : 'en', /** @type {any} */ (options)).format(date); } catch (_) { return published; }
    }

    // The site's icon, from DuckDuckGo's icon service; its first letter if it
    // has none. One service rather than each site's own /favicon.ico: the
    // person's browser does not call every site the model searched, and the
    // icon can be tested (Playwright aborts any URL ending in /favicon.ico
    // before a route can answer it).
    function iconFor(source) {
      const box = doc.createElement('span');
      box.className = 'qjo-source-icon';
      box.setAttribute('aria-hidden', 'true');
      const letter = () => { box.textContent = (source.site || source.host).charAt(0).toUpperCase(); };
      const img = doc.createElement('img');
      img.alt = '';
      img.width = 16;
      img.height = 16;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { img.remove(); letter(); }, { once: true });
      img.src = `https://icons.duckduckgo.com/ip3/${encodeURIComponent(source.host)}.ico`;
      box.appendChild(img);
      return box;
    }

    function tierBadge(kind) {
      if (!TIER_KEYS[kind]) return null;
      const badge = doc.createElement('span');
      badge.className = 'qjo-tier';
      badge.dataset.tier = kind;
      badge.textContent = `${TIER_ICONS[kind]} ${t(TIER_KEYS[kind])}`;
      return badge;
    }

    function topLine(source) {
      const top = doc.createElement('span');
      top.className = 'qjo-source-top';
      const site = doc.createElement('span');
      site.className = 'qjo-source-site';
      site.textContent = source.site;
      top.append(iconFor(source), site);
      return top;
    }

    function metaLine(source) {
      const meta = doc.createElement('span');
      meta.className = 'qjo-source-meta';
      const badge = tierBadge(source.kind);
      if (badge) meta.appendChild(badge);
      const when = dateText(source.published);
      if (when) {
        const time = doc.createElement('time');
        time.dateTime = source.published;
        time.textContent = when;
        meta.appendChild(time);
      }
      return meta;
    }

    function card(source) {
      const link = doc.createElement('a');
      link.className = 'qjo-source';
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('role', 'listitem');
      link.dataset.url = keyOf(source.url);
      const title = doc.createElement('span');
      title.className = 'qjo-source-title';
      title.textContent = source.title;
      title.dir = 'auto';
      link.append(topLine(source), title, metaLine(source));
      return link;
    }

    // Above the answer: after the reasoning card, before the text.
    function place(wrap, strip) {
      const bubble = wrap.querySelector('.bubble') || wrap;
      const content = bubble.querySelector(':scope > .qjo-streamed-content');
      if (content) { if (strip.nextElementSibling !== content) bubble.insertBefore(strip, content); } else if (strip.parentNode !== bubble) bubble.appendChild(strip);
    }

    function draw(wrap, state) {
      styled();
      if (!state.strip) {
        state.strip = doc.createElement('section');
        state.strip.className = 'qjo-sources';
      }
      const strip = state.strip;
      strip.setAttribute('aria-label', t('sources'));
      strip.textContent = '';
      const head = doc.createElement('div');
      head.className = 'qjo-sources-head';
      const label = doc.createElement('span');
      label.textContent = t('sources');
      const count = doc.createElement('span');
      count.className = 'qjo-sources-count';
      count.textContent = `· ${state.list.length}`;
      head.append(label, count);
      const row = doc.createElement('div');
      row.className = 'qjo-sources-row';
      row.setAttribute('role', 'list');
      for (const source of state.list) row.appendChild(card(source));
      strip.append(head, row);
      place(wrap, strip);
    }

    /**
     * Adds sources to an answer's strip, drawing it if this is the first.
     * @param {Element | null} wrap the answer's message element
     * @param {Array<object>} sources
     */
    function add(wrap, sources) {
      if (!wrap || !Array.isArray(sources) || !sources.length) return;
      const state = byWrap.get(wrap) || { list: [], strip: null };
      const seen = new Set(state.list.map((s) => keyOf(s.url)));
      for (const raw of sources) {
        const source = normalize(raw);
        if (!source || seen.has(keyOf(source.url)) || state.list.length >= MAX_SOURCES) continue;
        seen.add(keyOf(source.url));
        state.list.push(source);
      }
      if (!state.list.length) return;
      byWrap.set(wrap, state);
      draw(wrap, state);
    }

    function sourceFor(wrap, url) {
      const state = wrap ? byWrap.get(wrap) : null;
      const key = keyOf(url);
      return (state && state.list.find((s) => keyOf(s.url) === key)) || null;
    }

    /**
     * Citations in an answer, "[1](url)", drawn as "1 · WHO". Links in code
     * and ordinary named links are left alone. Safe to run more than once.
     * @param {Element} bubble
     * @returns {Map<string, number>} the first number each source was cited by
     */
    function decorate(bubble) {
      const cited = new Map();
      if (!bubble) return cited;
      styled();
      const wrap = bubble.closest('.msg');
      const content = bubble.querySelector('.qjo-streamed-content') || bubble;
      for (const a of Array.from(content.querySelectorAll('a[href]'))) {
        if (a.closest('pre, code, .qjo-sources, .qjo-file-card')) continue;
        const number = a.dataset.cite || (CITATION.exec(a.textContent.trim()) || [])[1];
        if (!number || !/^https?:$/.test(a.protocol)) continue;
        const source = sourceFor(wrap, a.href) || normalize({ url: a.href });
        if (!source) continue;
        a.classList.add('qjo-cite');
        a.dataset.cite = number;
        a.textContent = '';
        const n = doc.createElement('span');
        n.className = 'qjo-cite-n';
        n.textContent = number;
        const site = doc.createElement('span');
        site.className = 'qjo-cite-site';
        site.textContent = `· ${source.site}`;
        a.append(n, site);
        a.setAttribute('aria-label', `${number}: ${source.title}`);
        a.setAttribute('aria-haspopup', 'dialog');
        citeSource.set(a, source);
        const key = keyOf(a.href);
        if (!cited.has(key)) cited.set(key, Number(number));
      }
      return cited;
    }

    /**
     * The answer is complete: the strip sits right above it, its citations
     * are drawn, and each cited source carries the number the text uses —
     * cited ones first, in that order.
     * @param {Element | null} wrap
     */
    function finish(wrap) {
      if (!wrap) return;
      const bubble = wrap.querySelector('.bubble');
      const cited = decorate(bubble);
      const state = byWrap.get(wrap);
      if (!state || !state.strip) return;
      const numbered = (s) => cited.get(keyOf(s.url)) || Infinity;
      state.list = state.list.map((s, i) => ({ s, i })).sort((a, b) => numbered(a.s) - numbered(b.s) || a.i - b.i).map(({ s }) => s);
      draw(wrap, state);
      for (const link of Array.from(state.strip.querySelectorAll('.qjo-source'))) {
        const number = cited.get(/** @type {HTMLElement} */ (link).dataset.url || '');
        if (!number) continue;
        const badge = doc.createElement('span');
        badge.className = 'qjo-source-num';
        badge.textContent = String(number);
        link.querySelector('.qjo-source-top').appendChild(badge);
      }
    }

    // ── What a citation says, on hover, focus or tap ──
    let pop = null;
    let popFor = null;
    let hideTimer = null;
    let lastPointer = 'mouse';
    let quiet = false;
    // Whether the card was already open for the citation being tapped. A tap
    // focuses the link before its click, and focus opens the card, so by the
    // time of the click every tap looked like the second one.
    let openAtTap = false;

    function popover() {
      if (pop && pop.isConnected) return pop;
      pop = doc.createElement('div');
      pop.className = 'qjo-cite-pop';
      pop.id = 'qjo-cite-pop';
      pop.setAttribute('role', 'dialog');
      pop.hidden = true;
      pop.addEventListener('pointerenter', () => clearTimeout(hideTimer));
      pop.addEventListener('pointerleave', () => hideSoon());
      pop.addEventListener('focusout', (e) => { if (!pop.contains(/** @type {Node} */ (e.relatedTarget)) && e.relatedTarget !== popFor) hide(); });
      doc.body.appendChild(pop);
      return pop;
    }

    function fill(box, source) {
      box.textContent = '';
      box.dir = getLanguage() === 'ar' ? 'rtl' : 'ltr';
      const title = doc.createElement('strong');
      title.textContent = source.title;
      title.dir = 'auto';
      box.append(topLine(source), title);
      if (source.snippet) {
        const snippet = doc.createElement('p');
        snippet.textContent = source.snippet;
        snippet.dir = 'auto';
        box.appendChild(snippet);
      }
      const meta = metaLine(source);
      const open = doc.createElement('a');
      open.href = source.url;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.textContent = `${t('sourceOpen')} ↗`;
      meta.appendChild(open);
      box.appendChild(meta);
    }

    function position(box, anchor) {
      const r = anchor.getBoundingClientRect();
      const view = { w: global.innerWidth, h: global.innerHeight };
      const width = box.offsetWidth;
      const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), view.w - width - 8);
      const below = r.bottom + 6;
      const top = below + box.offsetHeight > view.h - 8 ? Math.max(8, r.top - box.offsetHeight - 6) : below;
      box.style.left = `${Math.round(left)}px`;
      box.style.top = `${Math.round(top)}px`;
    }

    function show(anchor) {
      const source = citeSource.get(anchor);
      if (!source) return;
      clearTimeout(hideTimer);
      const box = popover();
      if (popFor && popFor !== anchor) popFor.setAttribute('aria-expanded', 'false');
      fill(box, source);
      box.hidden = false;
      popFor = anchor;
      anchor.setAttribute('aria-expanded', 'true');
      anchor.setAttribute('aria-controls', box.id);
      position(box, anchor);
    }

    function hide() {
      clearTimeout(hideTimer);
      if (pop) pop.hidden = true;
      if (popFor) popFor.setAttribute('aria-expanded', 'false');
      popFor = null;
    }

    function hideSoon() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 180);
    }

    const citeOf = (target) => (target && target.closest ? target.closest('a.qjo-cite') : null);

    doc.addEventListener('pointerdown', (e) => {
      lastPointer = e.pointerType || 'mouse';
      const a = citeOf(e.target);
      openAtTap = Boolean(a && a === popFor && pop && !pop.hidden);
      if (pop && !pop.hidden && !pop.contains(/** @type {Node} */ (e.target)) && !a) hide();
    }, true);
    doc.addEventListener('pointerover', (e) => { const a = citeOf(e.target); if (a && e.pointerType === 'mouse') show(a); });
    doc.addEventListener('pointerout', (e) => { const a = citeOf(e.target); if (a && a === popFor && e.pointerType === 'mouse' && !a.contains(/** @type {Node} */ (e.relatedTarget))) hideSoon(); });
    doc.addEventListener('focusin', (e) => { const a = citeOf(e.target); if (a && !quiet) show(a); });
    doc.addEventListener('focusout', (e) => { const a = citeOf(e.target); if (a && !(pop && pop.contains(/** @type {Node} */ (e.relatedTarget)))) hideSoon(); });
    // A tap shows what the source says; a second tap on the same citation
    // opens it. A click from the keyboard (detail 0) or a mouse opens it at once.
    doc.addEventListener('click', (e) => {
      const a = citeOf(e.target);
      if (!a || e.detail === 0 || lastPointer === 'mouse' || openAtTap) return;
      e.preventDefault();
      show(a);
    });
    doc.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !popFor) return;
      const a = popFor;
      const inside = pop.contains(doc.activeElement);
      hide();
      if (inside) { quiet = true; a.focus(); quiet = false; }
    });
    // The page scrolls itself while an answer settles; the card follows its
    // citation, and closes only once the citation has left the screen.
    let follow = 0;
    global.addEventListener('scroll', () => {
      if (!popFor || follow) return;
      follow = global.requestAnimationFrame(() => {
        follow = 0;
        if (!popFor) return;
        const r = popFor.getBoundingClientRect();
        if (!popFor.isConnected || r.bottom < 0 || r.top > global.innerHeight) hide(); else position(pop, popFor);
      });
    }, { capture: true, passive: true });
    global.addEventListener('resize', () => { if (popFor) hide(); }, { passive: true });

    return { add, finish, decorate };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createSourceStrip = createSourceStrip;
})(typeof window !== 'undefined' ? window : globalThis);

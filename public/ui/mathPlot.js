/**
 * Math plots in an answer: a ```mathplot block drawn as a figure the person
 * can turn, zoom and save as PNG.
 *
 * What the block describes and the points that draw it are
 * public/domain/mathPlot.js; this draws them with Plotly (its 3D build: lines,
 * surfaces, meshes, isosurfaces), loaded from jsdelivr the first time an
 * answer has a figure, pinned to one file by its hash. A figure is drawn when
 * it comes into view, and one far out of view gives its WebGL context back:
 * a browser keeps only about sixteen.
 */
(function (global) {
  'use strict';

  const PLOTLY = {
    src: 'https://cdn.jsdelivr.net/npm/plotly.js-gl3d-dist-min@4.1.1/plotly-gl3d.min.js',
    integrity: 'sha384-6hbxN8DqA6n4AEKaxBT8U+Tq1DRCavyWRGOiglCEu+DXgmgq53+4IRgsPmAuQnLn'
  };
  const LOAD_TIMEOUT_MS = 30000;
  const LIVE_3D = 6;
  const PALETTE = {
    light: ['#0891b2', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#2563eb', '#b45309', '#0d9488'],
    dark: ['#38c7dd', '#a78bfa', '#f472b6', '#fb923c', '#4ade80', '#60a5fa', '#facc15', '#2dd4bf']
  };
  const INK = {
    light: { text: '#1e293b', grid: 'rgba(15, 23, 42, 0.10)', zero: 'rgba(15, 23, 42, 0.35)', pane: 'rgba(241, 245, 249, 0.9)' },
    dark: { text: '#e2e8f0', grid: 'rgba(255, 255, 255, 0.10)', zero: 'rgba(255, 255, 255, 0.35)', pane: 'rgba(30, 41, 59, 0.9)' }
  };

  /**
   * @param {{
   *   t: (key: string, vars?: Record<string, string | number>) => string,
   *   isDark: () => boolean,
   *   document?: Document
   * }} deps
   */
  function createMathPlots(deps) {
    const { t } = deps;
    const doc = deps.document || global.document;
    const domain = () => global.QjoDomain.mathPlot;
    /** @type {Promise<any> | null} */
    let loading = null;
    /** @type {WeakMap<Element, {figure: any, title: string}>} */
    const figures = new WeakMap();
    const live3d = new Set();

    function loadPlotly() {
      if (global.Plotly) return Promise.resolve(global.Plotly);
      if (loading) return loading;
      loading = new Promise((resolve, reject) => {
        const script = doc.createElement('script');
        script.src = PLOTLY.src;
        script.integrity = PLOTLY.integrity;
        script.crossOrigin = 'anonymous';
        script.async = true;
        const timer = setTimeout(() => fail(new Error('timeout')), LOAD_TIMEOUT_MS);
        // A failed load is not kept: the next figure, after the connection is
        // back, tries again.
        function fail(error) { clearTimeout(timer); loading = null; script.remove(); reject(error); }
        script.onload = () => { clearTimeout(timer); if (global.Plotly) resolve(global.Plotly); else fail(new Error('no Plotly')); };
        script.onerror = () => fail(new Error('load'));
        doc.head.append(script);
      });
      return loading;
    }

    const webgl = (() => {
      let known = null;
      return () => {
        if (known === null) {
          try { const c = doc.createElement('canvas'); known = Boolean(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (_) { known = false; }
        }
        return known;
      };
    })();

    const touch = () => Boolean(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);

    // ── Figure → Plotly ───────────────────────────────────────────────────

    function traces(figure, theme) {
      const palette = PALETTE[theme];
      const out = [];
      const annotations = [];
      const legend = figure.items.length > 1 || figure.items.some((it) => it.name);
      figure.items.forEach((item, n) => {
        const color = item.color || palette[n % palette.length];
        const name = item.name || `${n + 1}`;
        const one = [[0, color], [1, color]];
        const common = { name, legendgroup: `p${n}`, showlegend: legend && Boolean(item.name) };
        switch (item.kind) {
          case 'line2d':
            out.push({ ...common, type: 'scatter', mode: 'lines', x: item.x, y: item.y, line: { color, width: 2.6 }, connectgaps: false, hovertemplate: '(%{x:.4g}, %{y:.4g})<extra></extra>' });
            break;
          case 'points2d':
            out.push({ ...common, type: 'scatter', mode: item.labels.length ? 'markers+text' : 'markers', x: item.x, y: item.y, text: item.labels, textposition: 'top center', marker: { size: 9, color }, textfont: { color: INK[theme].text } });
            break;
          case 'arrow2d':
            out.push({ ...common, type: 'scatter', mode: 'lines', x: [item.from[0], item.to[0]], y: [item.from[1], item.to[1]], line: { color, width: 3 }, hoverinfo: 'skip' });
            annotations.push({ x: item.to[0], y: item.to[1], ax: item.from[0], ay: item.from[1], xref: 'x', yref: 'y', axref: 'x', ayref: 'y', showarrow: true, arrowhead: 2, arrowsize: 1.4, arrowwidth: 2.6, arrowcolor: color, text: '' });
            break;
          case 'line3d':
            out.push({ ...common, type: 'scatter3d', mode: 'lines', x: item.x, y: item.y, z: item.z, line: { color, width: 6 }, connectgaps: false });
            break;
          case 'points3d':
            out.push({ ...common, type: 'scatter3d', mode: item.labels.length ? 'markers+text' : 'markers', x: item.x, y: item.y, z: item.z, text: item.labels, marker: { size: 5, color }, textfont: { color: INK[theme].text } });
            break;
          case 'arrow3d': {
            const d = item.to.map((v, k) => v - item.from[k]);
            const length = Math.hypot(...d) || 1;
            out.push({ ...common, type: 'scatter3d', mode: 'lines', x: [item.from[0], item.to[0]], y: [item.from[1], item.to[1]], z: [item.from[2], item.to[2]], line: { color, width: 7 }, hoverinfo: 'skip' });
            out.push({ type: 'cone', x: [item.to[0]], y: [item.to[1]], z: [item.to[2]], u: [d[0] / length], v: [d[1] / length], w: [d[2] / length], anchor: 'tip', sizemode: 'absolute', sizeref: Math.max(0.12, length * 0.16), colorscale: one, showscale: false, showlegend: false, legendgroup: `p${n}`, hoverinfo: 'skip' });
            break;
          }
          case 'surface':
            out.push({ ...common, type: 'surface', x: item.x, y: item.y, z: item.z, showscale: false, opacity: item.opacity || 1, colorscale: item.color ? one : theme === 'dark' ? 'Viridis' : 'Portland', lighting: { ambient: 0.65, diffuse: 0.7, specular: 0.15, roughness: 0.6 }, hovertemplate: '(%{x:.3g}, %{y:.3g}, %{z:.3g})<extra></extra>' });
            break;
          case 'solid':
            item.parts.forEach((part, k) => out.push({ ...common, showlegend: common.showlegend && k === 0, type: 'surface', x: part.x, y: part.y, z: part.z, showscale: false, opacity: item.opacity || 1, colorscale: one, lighting: { ambient: 0.55, diffuse: 0.8, specular: 0.25, roughness: 0.5 }, hoverinfo: 'skip' }));
            break;
          case 'mesh':
            out.push({ ...common, type: 'mesh3d', x: item.x, y: item.y, z: item.z, i: item.i, j: item.j, k: item.k, color, opacity: item.opacity || 1, flatshading: true, hoverinfo: 'skip' });
            out.push({ type: 'scatter3d', mode: 'lines', x: item.edges.x, y: item.edges.y, z: item.edges.z, line: { color: INK[theme].text, width: 3 }, showlegend: false, legendgroup: `p${n}`, hoverinfo: 'skip' });
            break;
          case 'iso':
            out.push({ ...common, type: 'isosurface', x: item.x, y: item.y, z: item.z, value: item.value, isomin: 0, isomax: 0, surface: { count: 1 }, caps: { x: { show: false }, y: { show: false }, z: { show: false } }, colorscale: one, showscale: false, opacity: item.opacity || 1, hoverinfo: 'skip' });
            break;
          default:
        }
      });
      return { data: out, annotations };
    }

    /** @param {number} width the figure's width: a narrow one is seen from further away, so nothing is cut */
    function layout(figure, theme, annotations, width) {
      const ink = INK[theme];
      const axis = (title) => ({ title: { text: title }, color: ink.text, gridcolor: ink.grid, zerolinecolor: ink.zero, zeroline: true });
      const [ax, ay, az] = [figure.axes[0] || 'x', figure.axes[1] || 'y', figure.axes[2] || 'z'];
      const base = {
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: "'IBM Plex Sans Arabic', 'Inter', sans-serif", color: ink.text, size: 12 },
        showlegend: figure.items.some((it) => it.name), legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { color: ink.text } },
        hovermode: 'closest', annotations, uirevision: 'keep'
      };
      if (figure.dim === 3) {
        const a3 = (title) => ({ ...axis(title), backgroundcolor: ink.pane, showbackground: true });
        return { ...base, margin: { l: 0, r: 0, t: base.showlegend ? 28 : 0, b: 0 }, scene: { xaxis: a3(ax), yaxis: a3(ay), zaxis: a3(az), aspectmode: figure.aspect === 'equal' ? 'data' : 'cube', camera: { eye: width < 520 ? { x: 1.95, y: 1.8, z: 1.3 } : { x: 1.55, y: 1.45, z: 1.05 } } } };
      }
      const clips = figure.items.map((it) => it.clip).filter(Boolean);
      const yaxis = { ...axis(ay), ...(figure.aspect === 'equal' ? { scaleanchor: 'x', scaleratio: 1 } : {}) };
      if (clips.length) yaxis.range = [Math.min(...clips.map((c) => c[0])), Math.max(...clips.map((c) => c[1]))];
      return { ...base, margin: { l: 48, r: 14, t: base.showlegend ? 30 : 12, b: 42 }, xaxis: axis(ax), yaxis };
    }

    // ── A card ────────────────────────────────────────────────────────────

    function el(tag, className, text) {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    }

    // What the figure wrote — a name, an expression — is kept whole and left
    // to right inside an Arabic sentence: each part the strings isolate
    // (U+2066 … U+2069) is its own box.
    function writeNote(note, message) {
      note.replaceChildren(...String(message).split(/\u2066([^\u2069]*)\u2069/).map((part, i) => {
        if (i % 2 === 0) return doc.createTextNode(part);
        const code = el('bdi', 'math-plot-code', part);
        code.dir = 'ltr';
        return code;
      }));
    }

    function showProblem(card, message, source) {
      const note = card.querySelector('.math-plot-note');
      writeNote(note, message);
      note.classList.add('is-error');
      card.classList.add('has-error');
      card.querySelector('.math-plot-stage').remove();
      if (source && !card.querySelector('.math-plot-source')) {
        const details = el('details', 'math-plot-source');
        details.append(el('summary', '', t('mathPlotSource')), el('pre', '', source));
        card.append(details);
      }
    }

    async function draw(card) {
      const area = card.querySelector('.math-plot-area');
      const held = area && figures.get(card);
      if (!held || card.dataset.drawn === '1' || card.dataset.drawing === '1') return;
      const { figure } = held;
      if (figure.dim === 3 && !webgl()) { showProblem(card, t('mathPlotNoWebgl')); return; }
      card.dataset.drawing = '1';
      const note = card.querySelector('.math-plot-note');
      if (!global.Plotly) note.textContent = t('mathPlotLoading');
      let Plotly;
      try { Plotly = await loadPlotly(); } catch (_) {
        showProblem(card, t('mathPlotFailed', { error: t('libraryUnavailable') }));
        delete card.dataset.drawing;
        return;
      }
      try {
        const theme = deps.isDark() ? 'dark' : 'light';
        const { data, annotations } = traces(figure, theme);
        await Plotly.newPlot(area, data, layout(figure, theme, annotations, area.clientWidth), {
          // A finger turns and pinches; the toolbar would only cover the legend.
          responsive: true, displaylogo: false, scrollZoom: false, displayModeBar: touch() ? false : 'hover',
          modeBarButtonsToRemove: ['toImage', 'sendDataToCloud', 'lasso2d', 'select2d', 'resetCameraLastSave3d', 'hoverClosest3d']
        });
        card.dataset.drawn = '1';
        card.dataset.theme = theme;
        note.textContent = figure.empty.length ? t('mathPlotSomeEmpty', { names: figure.empty.map((e) => e.name || t('mathPlotPart', { n: e.index + 1 })).join('، ') }) : figure.dim === 3 ? t(touch() ? 'mathPlotHint3dTouch' : 'mathPlotHint3d') : '';
        card.querySelector('.math-plot-png').hidden = false;
        lock(card);
        if (figure.dim === 3) { live3d.add(card); release(); }
      } catch (error) {
        // Not the connection: the library is here and could not draw it.
        showProblem(card, t('mathPlotFailed', { error: t('mpDrawFailed', { detail: String((error && error.message) || error).slice(0, 120) }) }), held.source);
      } finally {
        delete card.dataset.drawing;
      }
    }

    // Gives back the WebGL of the 3D figures furthest out of view.
    function release() {
      if (live3d.size <= LIVE_3D) return;
      for (const card of live3d) {
        if (live3d.size <= LIVE_3D) break;
        const box = card.getBoundingClientRect();
        if (box.bottom > -global.innerHeight && box.top < 2 * global.innerHeight) continue;
        global.Plotly.purge(card.querySelector('.math-plot-area'));
        live3d.delete(card);
        delete card.dataset.drawn;
        card.querySelector('.math-plot-note').textContent = t('mathPlotRedraw');
      }
    }

    // On a touch screen a figure takes every swipe over it, and the page
    // stops scrolling there: it waits behind a pill until it is tapped, and
    // waits again once it is scrolled away.
    function lock(card) {
      const stage = card.querySelector('.math-plot-stage');
      if (!stage || !touch() || stage.querySelector('.math-plot-lock')) return;
      const cover = el('button', 'math-plot-lock');
      cover.type = 'button';
      cover.append(el('span', 'math-plot-lock-pill', t('mathPlotTapToMove')));
      cover.addEventListener('click', () => cover.remove());
      stage.append(cover);
    }

    const watcher = typeof global.IntersectionObserver === 'function'
      ? new global.IntersectionObserver((entries) => {
        for (const e of entries) {
          const card = /** @type {HTMLElement} */ (e.target);
          if (e.isIntersecting) draw(card);
          else if (card.dataset.drawn === '1') lock(card);
        }
      }, { rootMargin: '300px 0px' })
      : null;

    function download(card) {
      const held = figures.get(card);
      const area = card.querySelector('.math-plot-area');
      if (!held || !area || !global.Plotly || card.dataset.drawn !== '1') return;
      const name = (held.title || 'qjo-plot').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 60) || 'qjo-plot';
      global.Plotly.downloadImage(area, { format: 'png', filename: name, width: 1200, height: 900 });
    }

    /** Turns the plot blocks inside an element into figures. @param {ParentNode} element */
    function initialize(element) {
      if (!element) return;
      element.querySelectorAll('.math-plot-card:not([data-ready])').forEach((node) => {
        const card = /** @type {HTMLElement} */ (node);
        card.dataset.ready = '1';
        let source = '';
        let result;
        // A description that breaks the reader itself is a problem to show, not an empty card.
        try { source = decodeURIComponent(card.dataset.plotSpec || ''); result = domain().buildFigure(source); } catch (_) { result = { ok: false, error: { code: 'unreadable' } }; }
        const title = result.ok && result.figure.title ? result.figure.title : t('mathPlotDefaultTitle');
        const header = el('div', 'math-plot-header');
        const png = el('button', 'math-plot-png', t('mathPlotDownload'));
        png.type = 'button';
        png.title = t('mathPlotDownloadTitle');
        png.hidden = true;
        png.addEventListener('click', () => download(card));
        header.append(el('span', 'math-plot-icon', result.ok && result.figure.dim === 3 ? '🧊' : '📐'), el('span', 'math-plot-title', title), png);
        const area = el('div', 'math-plot-area');
        area.setAttribute('role', 'img');
        area.setAttribute('aria-label', title);
        const stage = el('div', 'math-plot-stage');
        stage.append(area);
        // Not a <p>: the answer's paragraph rule (styles.css) would set its colour and size.
        card.replaceChildren(header, stage, el('div', 'math-plot-note'));
        if (!result.ok) { showProblem(card, t('mathPlotFailed', { error: domain().explain(result.error, t) }), source); return; }
        if (result.figure.dim === 3) card.classList.add('is-3d');
        figures.set(card, { figure: result.figure, title, source });
        if (watcher) watcher.observe(card); else draw(card);
      });
    }

    // The page's theme changed: drawn figures take its colours.
    function retheme() {
      const theme = deps.isDark() ? 'dark' : 'light';
      doc.querySelectorAll('.math-plot-card[data-drawn="1"]').forEach((card) => {
        const held = figures.get(card);
        if (!held || card.dataset.theme === theme || !global.Plotly) return;
        const { data, annotations } = traces(held.figure, theme);
        const area = card.querySelector('.math-plot-area');
        global.Plotly.react(area, data, layout(held.figure, theme, annotations, area.clientWidth));
        /** @type {HTMLElement} */ (card).dataset.theme = theme;
      });
    }
    if (doc.body && typeof global.MutationObserver === 'function') {
      new global.MutationObserver(retheme).observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    }

    return { initialize, retheme, PLOTLY };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createMathPlots = createMathPlots;
})(typeof window !== 'undefined' ? window : globalThis);

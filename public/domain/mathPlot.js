/**
 * Math plots: what a ```mathplot block describes, and the points that draw it.
 *
 * An answer describes a figure — a function, a curve, a surface, a solid, a
 * vector — and the page draws it, interactive, in the answer
 * (public/ui/mathPlot.js). Before this a plot request got a Chart.js line of a
 * dozen hand-computed points, and anything in three dimensions could not be
 * drawn at all.
 *
 * The expressions are the model's text: they are read by a small parser into
 * a tree of arithmetic and the functions named below, and evaluated by walking
 * it. Nothing is ever compiled or run as JavaScript.
 *
 * Pure: a description in, points out.
 */
(function () {
  'use strict';

  const MAX_PLOTS = 12;
  const MAX_EXPRESSION = 300;
  const MAX_DEPTH = 60;

  // ── Expressions ─────────────────────────────────────────────────────────

  const mod = (a, b) => ((a % b) + b) % b;
  // x^(1/3) of a negative x is its real cube root, as on paper: an exponent
  // that is a fraction with an odd denominator has a real answer.
  function power(b, e) {
    if (b < 0 && Number.isFinite(e) && !Number.isInteger(e)) {
      for (let q = 3; q < 100; q += 2) {
        const n = Math.round(e * q);
        if (Math.abs(n / q - e) < 1e-12 * Math.max(1, Math.abs(e))) return (n % 2 === 0 ? 1 : -1) * Math.pow(-b, e);
      }
      return NaN;
    }
    return Math.pow(b, e);
  }
  const FUNCTIONS = {
    sin: [Math.sin, 1], cos: [Math.cos, 1], tan: [Math.tan, 1],
    sec: [(x) => 1 / Math.cos(x), 1], csc: [(x) => 1 / Math.sin(x), 1], cot: [(x) => 1 / Math.tan(x), 1],
    asin: [Math.asin, 1], acos: [Math.acos, 1], atan: [Math.atan, 1],
    arcsin: [Math.asin, 1], arccos: [Math.acos, 1], arctan: [Math.atan, 1],
    sinh: [Math.sinh, 1], cosh: [Math.cosh, 1], tanh: [Math.tanh, 1],
    asinh: [Math.asinh, 1], acosh: [Math.acosh, 1], atanh: [Math.atanh, 1],
    sqrt: [Math.sqrt, 1], cbrt: [Math.cbrt, 1], exp: [Math.exp, 1],
    // School notation: ln is natural, log is base 10 — log(x, b) any base.
    ln: [Math.log, 1], log: [(x, b) => (b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b)), 1, 2],
    log10: [Math.log10, 1], log2: [Math.log2, 1],
    abs: [Math.abs, 1], floor: [Math.floor, 1], ceil: [Math.ceil, 1], round: [Math.round, 1], sign: [Math.sign, 1],
    min: [Math.min, 1, 16], max: [Math.max, 1, 16], hypot: [Math.hypot, 1, 16],
    atan2: [Math.atan2, 2], pow: [power, 2], mod: [mod, 2]
  };
  const CONSTANTS = { pi: Math.PI, 'π': Math.PI, e: Math.E, tau: 2 * Math.PI };
  const ALIASES = { 'θ': 'theta', 'φ': 'phi' };
  // Names are looked up as own keys only: "constructor" is not a function here.
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  /** What is wrong, carried by an Error. @param {any} fault @returns {Error & {fault: any}} */
  const problem = (fault) => Object.assign(new Error(fault.code), { fault });

  // How people and models write maths that is not ASCII.
  function normalize(text) {
    return String(text)
      .replace(/[×·∙⋅]/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/\*\*/g, '^');
  }

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (num) { tokens.push({ kind: 'num', value: Number(num[0]), at: i }); i += num[0].length; continue; }
      const id = /^[A-Za-z_Ͱ-Ͽ][A-Za-z0-9_Ͱ-Ͽ]*/.exec(src.slice(i));
      if (id) { tokens.push({ kind: 'id', value: own(ALIASES, id[0]) ? ALIASES[id[0]] : id[0], at: i }); i += id[0].length; continue; }
      if ('+-*/^(),|√'.includes(c)) { tokens.push({ kind: c, at: i }); i++; continue; }
      throw problem({ code: 'syntax', at: i, near: c });
    }
    return tokens;
  }

  /**
   * Reads an expression in the given variables.
   * @param {string} text
   * @param {string[]} variables
   * @returns {{ok: true, fn: (scope: Record<string, number>) => number, uses: string[]} | {ok: false, error: any}}
   */
  function parseExpression(text, variables) {
    const src = normalize(text == null ? '' : text).trim();
    if (!src) return { ok: false, error: { code: 'empty' } };
    if (src.length > MAX_EXPRESSION) return { ok: false, error: { code: 'tooLong', max: MAX_EXPRESSION } };
    const vars = new Set(variables);
    const uses = new Set();
    let tokens;
    try { tokens = tokenize(src); } catch (error) { return { ok: false, error: error.fault }; }
    let p = 0;
    let depth = 0;
    const peek = () => tokens[p];
    /** @type {(code: string, extra?: any) => never} */
    const fail = (code, extra) => { throw problem({ code, at: peek() ? peek().at : src.length, ...extra }); };
    const expect = (kind) => { if (!peek() || peek().kind !== kind) fail('expected', { what: kind }); p++; };
    const nameKind = (name) => (vars.has(name) ? 'var' : own(CONSTANTS, name) ? 'const' : own(FUNCTIONS, name) ? 'fn' : null);

    // "xy" or "pix" are products of names, as on paper.
    function split(name) {
      const parts = [];
      let rest = name;
      while (rest) {
        const known = [...vars, ...Object.keys(CONSTANTS)].filter((n) => rest.startsWith(n)).sort((a, b) => b.length - a.length)[0];
        if (!known) return null;
        parts.push(known);
        rest = rest.slice(known.length);
      }
      return parts;
    }
    function leaf(name) {
      if (vars.has(name)) { uses.add(name); return (s) => s[name]; }
      const value = CONSTANTS[name];
      return () => value;
    }

    function call(name) {
      const [fn, min, max = min] = FUNCTIONS[name];
      let exponent = null;
      // sin^2(x) is (sin x)^2.
      if (peek() && peek().kind === '^') { p++; exponent = primary(); }
      if (!peek() || peek().kind !== '(') fail('needsParens', { name });
      p++;
      const args = [expression()];
      while (peek() && peek().kind === ',') { p++; args.push(expression()); }
      expect(')');
      if (args.length < min || args.length > max) fail('arity', { name, count: args.length });
      const apply = args.length === 1 ? (s) => fn(args[0](s)) : (s) => fn(...args.map((a) => a(s)));
      return exponent ? (s) => power(apply(s), exponent(s)) : apply;
    }

    function primary() {
      if (++depth > MAX_DEPTH) fail('tooDeep');
      const t = peek();
      if (!t) fail('ended');
      let out;
      if (t.kind === 'num') { p++; out = () => t.value; }
      else if (t.kind === '(') { p++; out = expression(); expect(')'); }
      else if (t.kind === '|') { p++; const inner = expression(); expect('|'); out = (s) => Math.abs(inner(s)); }
      else if (t.kind === '√') { p++; const inner = primary(); out = (s) => Math.sqrt(inner(s)); }
      else if (t.kind === 'id') {
        p++;
        const kind = nameKind(t.value);
        if (kind === 'fn') out = call(t.value);
        else if (kind) out = leaf(t.value);
        else {
          const parts = split(t.value);
          if (!parts) { p--; fail('unknownName', { name: t.value }); }
          const leaves = parts.map(leaf);
          out = (s) => leaves.reduce((acc, f) => acc * f(s), 1);
        }
      } else fail('unexpected', { near: t.kind });
      depth--;
      return out;
    }

    function powered() {
      const base = primary();
      if (peek() && peek().kind === '^') { p++; const exponent = unary(); return (s) => power(base(s), exponent(s)); }
      return base;
    }
    function unary() {
      if (peek() && (peek().kind === '-' || peek().kind === '+')) {
        const negative = tokens[p++].kind === '-';
        const operand = unary();
        return negative ? (s) => -operand(s) : operand;
      }
      return powered();
    }
    // A product written without its sign: 2x, 3(x+1), x(x-1), sin(x)cos(y).
    const startsOperand = (t) => t && (t.kind === 'id' || t.kind === '(' || t.kind === 'num' || t.kind === '√');
    function term() {
      let left = unary();
      for (;;) {
        const t = peek();
        if (t && (t.kind === '*' || t.kind === '/')) {
          p++;
          const right = unary();
          const l = left;
          left = t.kind === '*' ? (s) => l(s) * right(s) : (s) => l(s) / right(s);
        } else if (startsOperand(t)) {
          if (t.kind === 'num' && tokens[p - 1] && tokens[p - 1].kind === 'num') fail('unexpected', { near: String(t.value) });
          const right = powered();
          const l = left;
          left = (s) => l(s) * right(s);
        } else return left;
      }
    }
    function expression() {
      let left = term();
      while (peek() && (peek().kind === '+' || peek().kind === '-')) {
        const minus = tokens[p++].kind === '-';
        const right = term();
        const l = left;
        left = minus ? (s) => l(s) - right(s) : (s) => l(s) + right(s);
      }
      return left;
    }

    try {
      const fn = expression();
      if (p < tokens.length) fail('unexpected', { near: tokens[p].kind === 'num' || tokens[p].kind === 'id' ? String(tokens[p].value) : tokens[p].kind });
      return { ok: true, fn, uses: [...uses] };
    } catch (error) {
      return { ok: false, error: error && error.fault ? error.fault : { code: 'syntax' } };
    }
  }

  // ── Sampling ────────────────────────────────────────────────────────────

  const finite = (v) => (Number.isFinite(v) ? v : null);
  const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

  // The range most of the values sit in, so one asymptote does not flatten
  // the rest of the curve.
  function robustRange(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
    const lo = at(0.03), hi = at(0.97);
    const span = Math.max(hi - lo, 1e-9);
    return { lo, hi, span, min: sorted[0], max: sorted[sorted.length - 1] };
  }

  function sampleFunction(f, [a, b], n = 801) {
    const xs = linspace(a, b, n);
    const raw = xs.map((x) => f({ x }));
    const range = robustRange(raw);
    if (!range) return { x: xs, y: raw.map(() => null), clip: null };
    const lo = range.lo - range.span, hi = range.hi + range.span;
    const clipped = range.min < lo || range.max > hi;
    const x = [], y = [];
    for (let i = 0; i < xs.length; i++) {
      const v = Number.isFinite(raw[i]) && raw[i] >= lo && raw[i] <= hi ? raw[i] : null;
      // A jump across an asymptote is a break, not a vertical line: the
      // value halfway along is nowhere near the two either side of it.
      if (i > 0 && v !== null && y[y.length - 1] !== null && Math.abs(v - y[y.length - 1]) > range.span * 0.5) {
        const mid = f({ x: (xs[i - 1] + xs[i]) / 2 });
        const prev = y[y.length - 1];
        if (!Number.isFinite(mid) || mid > Math.max(prev, v) + range.span || mid < Math.min(prev, v) - range.span) { x.push((xs[i - 1] + xs[i]) / 2); y.push(null); }
      }
      x.push(xs[i]);
      y.push(v);
    }
    return { x, y, clip: clipped ? [range.lo - range.span * 0.15, range.hi + range.span * 0.15] : null };
  }

  function sampleCurve(fs, [a, b], n = 601) {
    const out = { x: [], y: [], z: [] };
    for (const t of linspace(a, b, n)) {
      const s = { t };
      out.x.push(finite(fs[0](s)));
      out.y.push(finite(fs[1](s)));
      if (fs[2]) out.z.push(finite(fs[2](s)));
    }
    if (!fs[2]) delete out.z;
    return out;
  }

  function samplePolar(r, [a, b], n = 721) {
    const out = { x: [], y: [] };
    for (const theta of linspace(a, b, n)) {
      const v = r({ theta, t: theta });
      out.x.push(finite(v * Math.cos(theta)));
      out.y.push(finite(v * Math.sin(theta)));
    }
    return out;
  }

  function sampleSurface(f, xr, yr, n = 64) {
    const x = linspace(xr[0], xr[1], n), y = linspace(yr[0], yr[1], n);
    const z = y.map((yv) => x.map((xv) => f({ x: xv, y: yv })));
    const range = robustRange(z.flat());
    if (range) {
      const lo = range.lo - range.span, hi = range.hi + range.span;
      for (const row of z) for (let i = 0; i < row.length; i++) row[i] = Number.isFinite(row[i]) && row[i] >= lo && row[i] <= hi ? row[i] : null;
    }
    return { x, y, z: z.map((row) => row.map(finite)) };
  }

  function sampleGrid(fs, ur, vr, nu = 72, nv = 48) {
    const us = linspace(ur[0], ur[1], nu), vs = linspace(vr[0], vr[1], nv);
    const grid = (k) => vs.map((v) => us.map((u) => finite(fs[k]({ u, v }))));
    return { x: grid(0), y: grid(1), z: grid(2) };
  }

  // Where F(x, y) = 0 crosses a grid: marching squares, a segment per cell.
  function contour2d(F, xr, yr, n = 181) {
    const xs = linspace(xr[0], xr[1], n), ys = linspace(yr[0], yr[1], n);
    const v = ys.map((y) => xs.map((x) => F({ x, y })));
    const out = { x: [], y: [] };
    const lerp = (a, b, fa, fb) => a + (b - a) * (fa / (fa - fb));
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const c = [v[j][i], v[j][i + 1], v[j + 1][i + 1], v[j + 1][i]];
        if (!c.every(Number.isFinite)) continue;
        const p = [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]];
        const cross = [];
        for (let k = 0; k < 4; k++) {
          const a = c[k], b = c[(k + 1) % 4];
          if ((a < 0) !== (b < 0)) {
            const [p0, p1] = [p[k], p[(k + 1) % 4]];
            cross.push([lerp(p0[0], p1[0], a, b), lerp(p0[1], p1[1], a, b)]);
          }
        }
        // A sign change across a pole (1/x = y) is not a curve: where it
        // crosses, the function is nowhere near zero. (A grid seldom lands
        // close enough to a pole for its values alone to show it.)
        const scale = Math.max(...c.map(Math.abs));
        if (cross.some(([x, y]) => { const f = F({ x, y }); return !Number.isFinite(f) || Math.abs(f) > scale; })) continue;
        for (let k = 0; k + 1 < cross.length; k += 2) {
          out.x.push(cross[k][0], cross[k + 1][0], null);
          out.y.push(cross[k][1], cross[k + 1][1], null);
        }
      }
    }
    return out;
  }

  function grid3d(F, xr, yr, zr, n = 34) {
    const xs = linspace(xr[0], xr[1], n), ys = linspace(yr[0], yr[1], n), zs = linspace(zr[0], zr[1], n);
    const out = { x: [], y: [], z: [], value: [] };
    for (const x of xs) for (const y of ys) for (const z of zs) {
      const f = F({ x, y, z });
      out.x.push(x); out.y.push(y); out.z.push(z); out.value.push(Number.isFinite(f) ? Math.max(-1e6, Math.min(1e6, f)) : 1e6);
    }
    return out;
  }

  // ── Solids ──────────────────────────────────────────────────────────────

  const TWO_PI = 2 * Math.PI;
  function revolve(profile, center, axis, nu = 64, nv = 24) {
    // profile(v) → [radius, height along the axis]; turned once round the axis.
    const us = linspace(0, TWO_PI, nu), vs = linspace(0, 1, nv);
    const point = (u, v) => {
      const [r, h] = profile(v);
      const a = r * Math.cos(u), b = r * Math.sin(u);
      const local = axis === 'x' ? [h, a, b] : axis === 'y' ? [b, h, a] : [a, b, h];
      return local.map((c, k) => c + center[k]);
    };
    const pts = vs.map((v) => us.map((u) => point(u, v)));
    return { x: pts.map((row) => row.map((q) => q[0])), y: pts.map((row) => row.map((q) => q[1])), z: pts.map((row) => row.map((q) => q[2])) };
  }

  function sphere(center, radii, nu = 64, nv = 40) {
    const [a, b, c] = radii;
    const us = linspace(0, TWO_PI, nu), vs = linspace(0, Math.PI, nv);
    return {
      x: vs.map((v) => us.map((u) => center[0] + a * Math.cos(u) * Math.sin(v))),
      y: vs.map((v) => us.map((u) => center[1] + b * Math.sin(u) * Math.sin(v))),
      z: vs.map((v) => us.map(() => center[2] + c * Math.cos(v)))
    };
  }

  function torus(center, R, r, nu = 72, nv = 36) {
    const us = linspace(0, TWO_PI, nu), vs = linspace(0, TWO_PI, nv);
    return {
      x: vs.map((v) => us.map((u) => center[0] + (R + r * Math.cos(v)) * Math.cos(u))),
      y: vs.map((v) => us.map((u) => center[1] + (R + r * Math.cos(v)) * Math.sin(u))),
      z: vs.map((v) => us.map(() => center[2] + r * Math.sin(v)))
    };
  }

  // A polyhedron as triangles, with its edges to draw over it.
  function box(center, size) {
    const [a, b, c] = size.map((s) => s / 2);
    const v = [[-a, -b, -c], [a, -b, -c], [a, b, -c], [-a, b, -c], [-a, -b, c], [a, -b, c], [a, b, c], [-a, b, c]].map((q) => q.map((x, k) => x + center[k]));
    const faces = [[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    return mesh(v, faces, edges);
  }

  function pyramid(center, base, height) {
    const [a, b] = base.map((s) => s / 2);
    const v = [[-a, -b, 0], [a, -b, 0], [a, b, 0], [-a, b, 0], [0, 0, height]].map((q) => q.map((x, k) => x + center[k]));
    const faces = [[0, 1, 2], [0, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]];
    return mesh(v, faces, edges);
  }

  function mesh(vertices, faces, edges) {
    const edge = { x: [], y: [], z: [] };
    for (const [p, q] of edges) for (const k of [0, 1, 2]) edge['xyz'[k]].push(vertices[p][k], vertices[q][k], null);
    return {
      x: vertices.map((q) => q[0]), y: vertices.map((q) => q[1]), z: vertices.map((q) => q[2]),
      i: faces.map((f) => f[0]), j: faces.map((f) => f[1]), k: faces.map((f) => f[2]), edges: edge
    };
  }

  // A square of a plane through a point, at right angles to its normal.
  function planePatch(normal, point, half) {
    const n = normal.map((x) => x / Math.hypot(...normal));
    const helper = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const e1 = cross(n, helper), len = Math.hypot(...e1);
    const u = e1.map((x) => x / len), w = cross(n, u);
    const at = (s, t) => [0, 1, 2].map((k) => point[k] + s * u[k] + t * w[k]);
    const ss = [-half, half];
    const pts = ss.map((t) => ss.map((s) => at(s, t)));
    return { x: pts.map((r) => r.map((q) => q[0])), y: pts.map((r) => r.map((q) => q[1])), z: pts.map((r) => r.map((q) => q[2])) };
  }

  // ── Reading a description ───────────────────────────────────────────────

  // Text the page puts into the figure: no markup reaches Plotly's labels.
  const label = (v) => (v == null ? '' : String(v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120));
  const COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\(\s*[\d.\s,%]+\))$/i;

  const TYPES = new Set(['function', 'curve', 'polar', 'implicit', 'points', 'vector', 'surface', 'parametric', 'sphere', 'cylinder', 'cone', 'torus', 'box', 'cube', 'pyramid', 'plane']);
  const TYPE_ALIASES = { fn: 'function', graph: 'function', line: 'curve', parametric2d: 'curve', parametric3d: 'curve', helix: 'curve', point: 'points', arrow: 'vector', ellipsoid: 'sphere', cuboid: 'box', prism: 'box' };

  function readSpec(spec) {
    const plot = (index) => (where) => ({ index, ...where });
    /** @type {(fault: any) => never} */
    const fail = (fault) => { throw problem(fault); };

    const constant = (value, where) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const e = parseExpression(value, []);
        if (e.ok) { const v = e.fn({}); if (Number.isFinite(v)) return v; }
      }
      return fail({ code: 'number', ...where });
    };
    const vector = (value, size, where) => {
      if (!Array.isArray(value) || (size && value.length !== size) || value.length < 2 || value.length > 3) fail({ code: 'vector', ...where });
      return value.map((v) => constant(v, where));
    };
    const range = (value, fallback, where) => {
      if (value == null) return fallback;
      if (!Array.isArray(value) || value.length !== 2) fail({ code: 'range', ...where });
      const [a, b] = value.map((v) => constant(v, where));
      if (!(b > a) || b - a > 1e6) fail({ code: 'range', ...where });
      return [a, b];
    };
    const expr = (text, variables, where) => {
      if (typeof text === 'number') return () => text;
      if (typeof text !== 'string') fail({ code: 'missing', ...where });
      const e = parseExpression(text, variables);
      if (e.ok === false) fail({ code: 'expression', text: label(text), detail: e.error, ...where });
      return e.fn;
    };
    // "y = x^2" written where an expression goes: the side that is not the name.
    const rhs = (text, name) => (typeof text === 'string' ? text.replace(new RegExp(`^\\s*${name}\\s*(?:\\(\\s*\\w+\\s*\\))?\\s*=`), '') : text);
    const equation = (text, variables, where) => {
      if (typeof text !== 'string' || !text.trim()) fail({ code: 'missing', ...where });
      const sides = text.split('=');
      if (sides.length > 2) fail({ code: 'expression', text: label(text), detail: { code: 'unexpected', near: '=' }, ...where });
      const left = expr(sides[0], variables, where);
      const right = sides.length === 2 ? expr(sides[1], variables, where) : () => 0;
      return (s) => left(s) - right(s);
    };

    if (!spec || typeof spec !== 'object') fail({ code: 'unreadable' });
    const list = Array.isArray(spec) ? spec : Array.isArray(spec.plots) ? spec.plots : spec.type ? [spec] : null;
    if (!list || !list.length) fail({ code: 'noPlots' });
    if (list.length > MAX_PLOTS) fail({ code: 'tooManyPlots', max: MAX_PLOTS });

    const items = [];
    const dims = new Set();
    list.forEach((raw, index) => {
      const at = plot(index);
      if (!raw || typeof raw !== 'object') fail({ code: 'unknownType', ...at({}) });
      const rawType = String(raw.type || '').toLowerCase().trim();
      const type = own(TYPE_ALIASES, rawType) ? TYPE_ALIASES[rawType] : rawType;
      if (!TYPES.has(type)) fail({ code: 'unknownType', type: label(raw.type), ...at({}) });
      const base = { name: label(raw.name || raw.label), color: typeof raw.color === 'string' && COLOR.test(raw.color.trim()) ? raw.color.trim() : '', opacity: typeof raw.opacity === 'number' && raw.opacity > 0 && raw.opacity <= 1 ? raw.opacity : null, index };
      const item = buildItem(type, raw, base, { at, constant, vector, range, expr, equation, rhs, fail });
      dims.add(item.dim);
      items.push(item);
    });
    if (dims.size > 1) fail({ code: 'mixed' });
    const dim = [...dims][0];
    const axes = Array.isArray(spec.axes) ? spec.axes.map(label).slice(0, 3) : [];
    // Shapes are drawn to scale — a circle round, a cube square; a function
    // and the points on it fill the figure.
    const shaped = items.some((it) => /^(?:mesh|solid|iso|arrow)/.test(it.kind) || ['curve', 'polar', 'implicit'].includes(it.type));
    return { dim, title: label(spec.title), axes, aspect: spec.aspect === 'equal' || (spec.aspect !== 'auto' && shaped) ? 'equal' : 'auto', items };
  }

  function buildItem(type, raw, base, h) {
    const where = (field) => h.at({ field, type });
    if (['function', 'polar', 'curve', 'implicit'].includes(type)) return buildLine(type, raw, base, h, where);
    if (type === 'points' || type === 'vector') return buildMarks(type, raw, base, h, where);
    if (type === 'surface') {
      const f = h.expr(h.rhs(raw.z != null ? raw.z : raw.expression, '(?:z|f)'), ['x', 'y'], where('z'));
      return { ...base, type, dim: 3, kind: 'surface', ...sampleSurface(f, h.range(raw.x, [-5, 5], where('x')), h.range(raw.y, [-5, 5], where('y'))) };
    }
    if (type === 'parametric') {
      const fs = ['x', 'y', 'z'].map((k) => h.expr(raw[k], ['u', 'v'], where(k)));
      return { ...base, type, dim: 3, kind: 'surface', ...sampleGrid(fs, h.range(raw.u, [0, TWO_PI], where('u')), h.range(raw.v, [0, TWO_PI], where('v'))) };
    }
    return buildSolid(type, raw, base, h, where);
  }

  // A line: a function, a polar or parametric curve, an implicit equation.
  function buildLine(type, raw, base, h, where) {
    if (type === 'function') {
      const f = h.expr(h.rhs(raw.y != null ? raw.y : raw.f != null ? raw.f : raw.expression, '(?:y|f)'), ['x'], where('y'));
      const s = sampleFunction(f, h.range(raw.x || raw.domain, [-10, 10], where('x')));
      return { ...base, type, dim: 2, kind: 'line2d', x: s.x, y: s.y, clip: s.clip };
    }
    if (type === 'polar') {
      const r = h.expr(h.rhs(raw.r, 'r'), ['theta', 't'], where('r'));
      return { ...base, type, dim: 2, kind: 'line2d', ...samplePolar(r, h.range(raw.theta || raw.t, [0, TWO_PI], where('theta'))) };
    }
    if (type === 'curve') {
      const three = raw.z != null;
      const fs = ['x', 'y', ...(three ? ['z'] : [])].map((k) => h.expr(raw[k], ['t'], where(k)));
      return { ...base, type, dim: three ? 3 : 2, kind: three ? 'line3d' : 'line2d', ...sampleCurve(fs, h.range(raw.t, [0, TWO_PI], where('t'))) };
    }
    const text = raw.equation || raw.expression;
    const three = typeof text === 'string' && /(?<![a-z])z(?![a-z])/i.test(text);
    const F = h.equation(text, three ? ['x', 'y', 'z'] : ['x', 'y'], where('equation'));
    const xr = h.range(raw.x, [-5, 5], where('x')), yr = h.range(raw.y, [-5, 5], where('y'));
    if (!three) return { ...base, type, dim: 2, kind: 'line2d', ...contour2d(F, xr, yr) };
    return { ...base, type, dim: 3, kind: 'iso', ...grid3d(F, xr, yr, h.range(raw.z, [-5, 5], where('z'))) };
  }

  // Points and vectors, flat or in space by how many coordinates they have.
  function buildMarks(type, raw, base, h, where) {
    if (type === 'vector') {
      const to = h.vector(raw.to || raw.vector, null, where('to'));
      const from = raw.from == null ? to.map(() => 0) : h.vector(raw.from, to.length, where('from'));
      return { ...base, type, dim: to.length, kind: to.length === 3 ? 'arrow3d' : 'arrow2d', from, to };
    }
    const list = Array.isArray(raw.points) ? raw.points : Array.isArray(raw.at) ? [raw.at] : null;
    if (!list || !list.length || list.length > 500) h.fail({ code: 'missing', ...where('points') });
    const pts = list.map((q) => h.vector(q, null, where('points')));
    const three = pts[0].length === 3;
    if (pts.some((q) => q.length !== pts[0].length)) h.fail({ code: 'vector', ...where('points') });
    const labels = Array.isArray(raw.labels) ? raw.labels.map(label) : [];
    return { ...base, type, dim: three ? 3 : 2, kind: three ? 'points3d' : 'points2d', x: pts.map((q) => q[0]), y: pts.map((q) => q[1]), ...(three ? { z: pts.map((q) => q[2]) } : {}), labels };
  }

  function buildSolid(type, raw, base, h, where) {
    const center = raw.center == null ? [0, 0, 0] : h.vector(raw.center, 3, where('center'));
    const positive = (v, field, fallback) => {
      const n = v == null ? fallback : h.constant(v, where(field));
      if (!(n > 0)) h.fail({ code: 'number', ...where(field) });
      return n;
    };
    const axis = ['x', 'y', 'z'].includes(raw.axis) ? raw.axis : 'z';
    const solid = { ...base, type, dim: 3 };
    switch (type) {
      case 'sphere': {
        const radii = Array.isArray(raw.radii || raw.radius) ? h.vector(raw.radii || raw.radius, 3, where('radius')).map((r) => positive(r, 'radius')) : Array(3).fill(positive(raw.radius, 'radius', 1));
        return { ...solid, kind: 'solid', parts: [sphere(center, radii)] };
      }
      case 'cylinder': {
        const r = positive(raw.radius, 'radius', 1), height = positive(raw.height, 'height', 2);
        return { ...solid, kind: 'solid', parts: [revolve((v) => [r, v * height], center, axis), revolve((v) => [v * r, 0], center, axis, 64, 8), revolve((v) => [v * r, height], center, axis, 64, 8)] };
      }
      case 'cone': {
        const r = positive(raw.radius, 'radius', 1), height = positive(raw.height, 'height', 2);
        return { ...solid, kind: 'solid', parts: [revolve((v) => [(1 - v) * r, v * height], center, axis), revolve((v) => [v * r, 0], center, axis, 64, 8)] };
      }
      case 'torus': {
        const R = positive(raw.R != null ? raw.R : raw.major, 'R', 2), r = positive(raw.r != null ? raw.r : raw.minor, 'r', 0.6);
        return { ...solid, kind: 'solid', parts: [torus(center, R, r)] };
      }
      case 'box': case 'cube': {
        const size = Array.isArray(raw.size) ? h.vector(raw.size, 3, where('size')).map((s) => positive(s, 'size')) : Array(3).fill(positive(raw.size != null ? raw.size : raw.side, 'size', 2));
        return { ...solid, kind: 'mesh', ...box(center, size) };
      }
      case 'pyramid': {
        const side = Array.isArray(raw.base) ? h.vector(raw.base, 2, where('base')).map((s) => positive(s, 'base')) : Array(2).fill(positive(raw.base, 'base', 2));
        return { ...solid, kind: 'mesh', ...pyramid(center, side, positive(raw.height, 'height', 2)) };
      }
      case 'plane': {
        const half = positive(raw.size, 'size', 3);
        if (raw.normal != null) {
          const normal = h.vector(raw.normal, 3, where('normal'));
          if (!normal.some((x) => x !== 0)) h.fail({ code: 'vector', ...where('normal') });
          const point = raw.point == null ? [0, 0, 0] : h.vector(raw.point, 3, where('point'));
          return { ...solid, kind: 'solid', parts: [planePatch(normal, point, half)] };
        }
        // ax + by + cz = d, read off the equation itself.
        const F = h.equation(raw.equation, ['x', 'y', 'z'], where('equation'));
        const f0 = F({ x: 0, y: 0, z: 0 });
        const normal = [F({ x: 1, y: 0, z: 0 }) - f0, F({ x: 0, y: 1, z: 0 }) - f0, F({ x: 0, y: 0, z: 1 }) - f0];
        const linear = Math.abs(F({ x: 2, y: -3, z: 5 }) - (f0 + 2 * normal[0] - 3 * normal[1] + 5 * normal[2])) < 1e-9;
        const norm2 = normal.reduce((a, x) => a + x * x, 0);
        if (!linear || !(norm2 > 0)) h.fail({ code: 'notPlane', ...where('equation') });
        const point = normal.map((x) => (-f0 * x) / norm2);
        return { ...solid, kind: 'solid', parts: [planePatch(normal, point, half)] };
      }
      default: return h.fail({ code: 'unknownType', ...where('type') });
    }
  }

  // What part of a figure drew nothing: every value undefined over its range.
  function emptyItems(items) {
    const has = (a) => Array.isArray(a) && a.flat(2).some((v) => v !== null && Number.isFinite(v));
    return items.filter((it) => {
      if (it.kind === 'iso') return !(it.value.some((v) => v < 0) && it.value.some((v) => v > 0));
      if (it.kind === 'solid' || it.kind.startsWith('arrow') || it.kind.startsWith('points') || it.kind === 'mesh') return false;
      return !has(it.y) || (it.z && !has(it.z));
    }).map((it) => ({ index: it.index, name: it.name }));
  }

  /**
   * A block's text → the figure to draw, or what is wrong with it.
   * @param {string} text the block as the answer wrote it
   * @param {(raw: string) => {ok: boolean, value?: any, error?: string}} [readJson]
   * @returns {{ok: true, figure: any} | {ok: false, error: any}}
   */
  function buildFigure(text, readJson) {
    const reader = readJson || ((raw) => {
      const relaxed = typeof module !== 'undefined' && module.exports ? require('./relaxedJson.js') : /** @type {any} */ (window).QjoDomain.relaxedJson;
      return relaxed.readLoose(raw);
    });
    const parsed = reader(String(text || ''));
    if (!parsed.ok) return { ok: false, error: { code: 'unreadable', detail: parsed.error } };
    try {
      const figure = readSpec(parsed.value);
      const empty = emptyItems(figure.items);
      if (empty.length === figure.items.length) return { ok: false, error: { code: 'nothingDrawn', index: empty[0].index } };
      return { ok: true, figure: { ...figure, empty } };
    } catch (error) {
      if (error && error.fault) return { ok: false, error: error.fault };
      throw error;
    }
  }

  // ── Which messages ask for one ──────────────────────────────────────────

  // Arabic words are whole words: "رسم" is in "رسمية", "كرة" in "كرة قدم".
  const ar = (words) => `(?<![\\u0600-\\u06FF])(?:و|ب|ف)?(?:ال)?(?:${words})(?![\\u0600-\\u06FF])`;
  const DRAW = new RegExp(`\\b(?:plot|graph|draw|sketch|visuali[sz]e|render)\\b|${ar('[اأتين]?رسو?م(?:ل(?:ي|نا|ه|ها)|ها|ه|ة|ات|وا|ي)?|مثّل(?:ي|لي|ها)?|تمثيل|بيانيا|بيانياً')}`, 'i');
  // An equation, or a figure only mathematics draws.
  const EQUATION = /(?:^|[^a-z])[xyzr]\s*=|\bf\s*\(\s*x\s*\)|\b(?:sin|cos|tan|ln|log|exp|sqrt)\s*\(|[a-z0-9)]\s*(?:\^|\*\*)\s*[-\d(a-z]|[a-z]\s*[²³]/i;
  const STRONG = new RegExp(`\\b(?:paraboloids?|hyperboloids?|ellipsoids?|torus|helix|parametric|polar|parabolas?|hyperbolas?|ellipses?|asymptotes?|unit circle|vector field|surface plot|3d (?:surface|plot|graph|curve)|level curves?)\\b|${ar('أسطوانة|اسطوانة|مخروط|طارة|حلزون|قطبي|قطبية|وسيطي|وسيطية|بارامتري|بارامترية|قطع مكافئ|قطع زائد|قطع ناقص|خط مقارب|خطوط مقاربة|متجهات|منحنى ثلاثي الأبعاد|سطح ثلاثي الأبعاد')}`, 'i');
  // Shapes that are also things — a football, a pyramid in Giza, a plane in
  // the sky — count with a sign of mathematics beside them.
  const AMBIGUOUS = new RegExp(`\\b(?:spheres?|cylinders?|cones?|cubes?|cuboids?|pyramids?|prisms?|planes?|circles?|vectors?|spirals?|surfaces?|solids?|3d|lines?)\\b|${ar('كرة|كره|مكعب|هرم|منشور|دائرة|مستوى|سطح|حلقة|متجه|مجسم|خط مستقيم')}|ثلاثي الأبعاد|ثلاثية الأبعاد|ثلاثي الابعاد|ثلاثية الابعاد`, 'i');
  const CUE = new RegExp(`\\b(?:equations?|radius|radii|heights?|volumes?|areas?|coordinates?|axis|axes|origin|normal|centered|centred|cent(?:er|re)d? at|intersect\\w*|tangent)\\b|(?<![\\w.])-?\\d+(?:\\.\\d+)?(?![a-z\\d])|\\(\\s*-?\\d+(?:\\.\\d+)?\\s*,\\s*-?\\d|${ar('معادلة|معادلته|معادلتها|نصف قطر|نصف قطرها|نصف قطره|ارتفاع|ارتفاعه|ارتفاعها|حجم|حجمه|حجمها|مساحة|إحداثيات|احداثيات|محور|محاور|نقطة الأصل|نقطة الاصل|مركز|مركزها|مركزه|هندسي|هندسية|متعامد|مماس|تقاطع')}|[٠-٩]`, 'i');
  const CURVE = new RegExp(`\\b(?:functions?|curves?)\\b|${ar('دالة|دالتين|اقتران|منحنى|منحني|منحنيات')}`, 'i');
  const DATA = new RegExp(`\\b(?:sales|revenue|profits?|data|dataset|survey|population|prices?|budget|monthly|yearly|per month|statistics|percent(?:age)?s?|bar|pie|histogram|table|chart)\\b|${ar('مبيعات|أرباح|ارباح|إيرادات|ايرادات|بيانات|إحصائيات|احصائيات|استبيان|سكان|أسعار|اسعار|ميزانية|شهري|شهرية|سنوي|سنوية|نسب|نسبة|أعمدة|اعمدة|دائري|جدول|درجات|مخطط')}`, 'i');

  /**
   * Whether a person's words ask for a figure of mathematics to be drawn.
   * @param {string} own the person's own words
   */
  function asksForPlot(own) {
    const text = String(own || '');
    if (!DRAW.test(text)) return false;
    if (EQUATION.test(text) || STRONG.test(text)) return true;
    // Two shapes named together are geometry: "a sphere and a cone in 3D".
    const shapes = new Set([...text.matchAll(new RegExp(AMBIGUOUS.source, 'gi'))].map((m) => m[0].toLowerCase().replace(/^(?:و|ب|ف)?(?:ال)?/, '')));
    if (shapes.size && (CUE.test(text) || CURVE.test(text) || shapes.size > 1)) return true;
    return CURVE.test(text) && !DATA.test(text);
  }

  /**
   * What is wrong with a block, in the person's language.
   * @param {any} error from buildFigure
   * @param {(key: string, vars?: Record<string, string | number>) => string} t
   */
  function explain(error, t) {
    const e = error || {};
    const part = { n: (e.index || 0) + 1, type: e.type || '', field: e.field || '' };
    switch (e.code) {
      case 'unreadable': return t('mpUnreadable');
      case 'noPlots': return t('mpNoPlots');
      case 'tooManyPlots': return t('mpTooMany', { max: e.max || MAX_PLOTS });
      case 'unknownType': return t('mpUnknownType', { ...part, type: e.type || '?' });
      case 'missing': return t('mpMissing', part);
      case 'range': return t('mpRange', part);
      case 'number': return t('mpNumber', part);
      case 'vector': return t('mpVector', part);
      case 'mixed': return t('mpMixed');
      case 'nothingDrawn': return t('mpNothingDrawn', part);
      case 'notPlane': return t('mpNotPlane', part);
      case 'expression': {
        const d = e.detail || {};
        const why = d.code === 'unknownName' ? t('mpWhyUnknownName', { name: d.name })
          : d.code === 'needsParens' ? t('mpWhyNeedsParens', { name: d.name })
            : d.code === 'arity' ? t('mpWhyArity', { name: d.name })
              : d.code === 'tooLong' || d.code === 'tooDeep' ? t('mpWhyTooLong') : t('mpWhySyntax');
        return t('mpExpression', { ...part, text: e.text || '', why });
      }
      default: return t('mpUnreadable');
    }
  }

  /** The same, of a message as the page sent it. @param {string} message @param {(text: string) => string} own ownWords */
  const plotMessage = (message, own) => asksForPlot(own(String(message || '')));

  const BLOCK = /```(?:mathplot|math3d|math2d|plot3d)\b/i;
  /** Whether an answer drew one: a follow-up ("make it red") keeps the format. */
  const answerHasPlot = (text) => BLOCK.test(String(text || ''));

  const api = { parseExpression, buildFigure, explain, asksForPlot, plotMessage, answerHasPlot, MAX_PLOTS };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.mathPlot = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

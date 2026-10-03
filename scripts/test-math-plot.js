// Math plots (public/domain/mathPlot.js): the expressions an answer writes,
// the figure they describe, and which messages ask for one.
//
// The expression reader is the part that must be right and must be safe: it
// is checked against mathjs (the server's own maths library) on thousands of
// random expressions, and against code written to escape it. The geometry is
// checked by what it is — every point of a sphere at its radius, every point
// of an implicit circle on the circle — not by snapshots of numbers.
'use strict';

const assert = require('assert');
const { create, all } = require('mathjs');
const plot = require('../public/domain/mathPlot.js');

// Real numbers only, as the page draws them: sqrt(-1) is a gap, not 1i.
const math = create(all, { predictable: true });

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${String(error.message).split('\n').slice(0, 4).join('\n     ')}`);
  }
}

const value = (text, vars, scope) => {
  const r = plot.parseExpression(text, vars);
  if (!r.ok) throw new Error(`${text}: ${JSON.stringify(r.error)}`);
  return r.fn(scope);
};
const close = (a, b, tol = 1e-9) => (Number.isNaN(a) && Number.isNaN(b)) || a === b || Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

console.log('\nExpressions read as mathematics, checked against mathjs:');

// A random expression, written twice: once as an answer writes it, once for mathjs.
function randomExpression(rand, depth) {
  const leaf = () => {
    const r = rand();
    if (r < 0.35) return ['x', 'x'];
    if (r < 0.6) return ['y', 'y'];
    if (r < 0.7) return ['pi', 'pi'];
    if (r < 0.75) return ['e', 'e'];
    const n = String(Math.round(rand() * 900) / 100);
    return [n, n];
  };
  if (depth <= 0 || rand() < 0.25) return leaf();
  const r = rand();
  if (r < 0.37) {
    const op = ['+', '-', '*', '/'][Math.floor(rand() * 4)];
    const [a1, a2] = randomExpression(rand, depth - 1);
    const [b1, b2] = randomExpression(rand, depth - 1);
    return [`(${a1}) ${op} (${b1})`, `(${a2}) ${op} (${b2})`];
  }
  if (r < 0.45) {
    // Powers with a real answer: any exponent of a base that is not negative,
    // and of any base an integer or a fraction with an odd denominator (a
    // negative base to 2.883 is complex, and both sides would only differ in
    // how they say "not a real number").
    const [a1, a2] = randomExpression(rand, depth - 1);
    if (rand() < 0.5) {
      const [b1, b2] = randomExpression(rand, depth - 1);
      return [`abs(${a1}) ^ (${b1})`, `abs(${a2}) ^ (${b2})`];
    }
    const e = ['2', '3', '0', '-1', '(1/3)', '(2/3)', '(-1/5)', '(1/2)'][Math.floor(rand() * 8)];
    return [`(${a1}) ^ ${e}`, `(${a2}) ^ ${e}`];
  }
  if (r < 0.55) {
    const [a1, a2] = randomExpression(rand, depth - 1);
    return [`-(${a1})`, `-(${a2})`];
  }
  const fns = [['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['exp', 'exp'], ['sqrt', 'sqrt'], ['abs', 'abs'], ['ln', 'log'], ['log', 'log10'], ['atan', 'atan'], ['sinh', 'sinh'], ['tanh', 'tanh'], ['floor', 'floor'], ['cbrt', 'cbrt']];
  const [ours, theirs] = fns[Math.floor(rand() * fns.length)];
  const [a1, a2] = randomExpression(rand, depth - 1);
  return [`${ours}(${a1})`, `${theirs}(${a2})`];
}

test('2,000 random expressions agree with mathjs at five points each', () => {
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let compared = 0;
  const disagreements = [];
  for (let k = 0; k < 2000; k++) {
    const [ours, theirs] = randomExpression(rand, 4);
    const fn = plot.parseExpression(ours, ['x', 'y']);
    assert.ok(fn.ok, `${ours}: ${JSON.stringify(fn.error)}`);
    const compiled = math.compile(theirs);
    for (let i = 0; i < 5; i++) {
      const scope = { x: rand() * 8 - 4, y: rand() * 8 - 4 };
      let expected = compiled.evaluate({ ...scope });
      if (typeof expected !== 'number') expected = NaN;
      const got = fn.fn(scope);
      if (!Number.isFinite(expected) && !Number.isFinite(got)) continue;
      compared++;
      if (!close(got, expected, 1e-7)) disagreements.push(`${ours} at ${JSON.stringify(scope)}: ${got} vs ${expected}`);
    }
  }
  assert.ok(compared > 5000, `only ${compared} finite comparisons`);
  assert.ok(!disagreements.length, `${disagreements.length} disagreements:\n${disagreements.slice(0, 4).join("\n")}`);
});

test('precedence as on paper: -x^2, right-associative powers, e^-x^2, 2^-1', () => {
  assert.strictEqual(value('-x^2', ['x'], { x: 3 }), -9);
  assert.strictEqual(value('2^3^2', [], {}), 512);
  assert.ok(close(value('e^-x^2', ['x'], { x: 1 }), Math.exp(-1)));
  assert.strictEqual(value('2^-1', [], {}), 0.5);
  assert.strictEqual(value('10 - 4 - 3', [], {}), 3);
  assert.strictEqual(value('12 / 3 / 2', [], {}), 2);
});

test('school notation: 2x, 3(x+1), x(x-1), sin(x)cos(y), 2pi, xy, sin^2(x), |x|, √', () => {
  assert.strictEqual(value('2x^2 + 3(x+1)', ['x'], { x: 2 }), 17);
  assert.strictEqual(value('x(x-1)', ['x'], { x: 5 }), 20);
  assert.ok(close(value('sin(x)cos(y)', ['x', 'y'], { x: 1, y: 2 }), Math.sin(1) * Math.cos(2)));
  assert.ok(close(value('2pi', [], {}), 2 * Math.PI));
  assert.strictEqual(value('xy + 2', ['x', 'y'], { x: 3, y: 4 }), 14);
  assert.ok(close(value('sin^2(x) + cos^2(x)', ['x'], { x: 0.7 }), 1));
  assert.strictEqual(value('|x - 5|', ['x'], { x: 2 }), 3);
  assert.strictEqual(value('√4 + 2√x + √(x+7)', ['x'], { x: 9 }), 2 + 6 + 4);
});

test('the way people type maths: × ÷ − ² ³ π θ **', () => {
  assert.strictEqual(value('3×x² − 2÷4', ['x'], { x: 2 }), 11.5);
  assert.strictEqual(value('x³', ['x'], { x: 2 }), 8);
  assert.ok(close(value('2π', [], {}), 2 * Math.PI));
  assert.strictEqual(value('1 + cos(θ)', ['theta'], { theta: 0 }), 2);
  assert.strictEqual(value('x**2', ['x'], { x: 3 }), 9);
});

test('ln is natural, log is base 10, log(x, b) any base; mod is never negative', () => {
  assert.strictEqual(value('log(1000)', [], {}), 3);
  assert.ok(close(value('ln(e^2)', [], {}), 2));
  assert.ok(close(value('log(8, 2)', [], {}), 3));
  assert.strictEqual(value('mod(-1, 3)', [], {}), 2);
  assert.strictEqual(value('max(1, x, 3)', ['x'], { x: 7 }), 7);
});

test('outside its domain a value is not a number — a gap, never an error', () => {
  assert.ok(Number.isNaN(value('sqrt(x)', ['x'], { x: -1 })));
  assert.ok(Number.isNaN(value('ln(x)', ['x'], { x: -1 })));
  assert.strictEqual(value('1/x', ['x'], { x: 0 }), Infinity);
  assert.ok(Number.isNaN(value('x^(1/2)', ['x'], { x: -4 })));
});

test('the real odd root of a negative number, as on paper: x^(1/3), x^(2/3)', () => {
  assert.ok(close(value('x^(1/3)', ['x'], { x: -8 }), -2));
  assert.ok(close(value('x^(2/3)', ['x'], { x: -8 }), 4));
  assert.ok(close(value('pow(x, 3/5)', ['x'], { x: -32 }), -8));
});

console.log('\nAn expression is mathematics and nothing else:');

test('names that are not maths are refused by name, Object.prototype included', () => {
  for (const name of ['alert', 'window', 'globalThis', 'process', 'require', 'constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'a']) {
    const r = plot.parseExpression(`${name}(x) + 1`, ['x']);
    assert.ok(!r.ok && r.error.code === 'unknownName' && r.error.name === name, `${name}: ${JSON.stringify(r)}`);
  }
});

test('code is refused, and none of it runs', () => {
  delete globalThis.__qjoPlotRan;
  const attempts = [
    'x.constructor', "x['constructor']", '"x"', "'x'", '`x`', 'x; 1', 'x = 1', '(() => 1)()', 'x => x',
    "constructor.constructor('globalThis.__qjoPlotRan = 1')()", '[].map', '{}', 'x ? 1 : 2', 'x && 1', 'new Date', 'x\n1'
  ];
  for (const text of attempts) {
    const r = plot.parseExpression(text, ['x']);
    assert.ok(!r.ok || text === 'x\n1', `accepted: ${text}`);
  }
  assert.strictEqual(globalThis.__qjoPlotRan, undefined);
});

test('a function needs its brackets and its number of arguments; long and deep input is refused', () => {
  assert.strictEqual(plot.parseExpression('sin x', ['x']).error.code, 'needsParens');
  assert.strictEqual(plot.parseExpression('atan2(x)', ['x']).error.code, 'arity');
  assert.strictEqual(plot.parseExpression('sin(x, x)', ['x']).error.code, 'arity');
  assert.strictEqual(plot.parseExpression('x+'.repeat(200) + 'x', ['x']).error.code, 'tooLong');
  assert.strictEqual(plot.parseExpression('('.repeat(80) + 'x' + ')'.repeat(80), ['x']).error.code, 'tooDeep');
  assert.strictEqual(plot.parseExpression('2 3', []).error.code, 'unexpected');
  assert.strictEqual(plot.parseExpression('(x + 1', ['x']).error.code, 'expected');
  assert.strictEqual(plot.parseExpression('', ['x']).error.code, 'empty');
});

console.log('\nA figure is what it says:');

const figure = (spec) => {
  const r = plot.buildFigure(typeof spec === 'string' ? spec : JSON.stringify(spec));
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.figure;
};
const pointsOf = (item) => {
  const out = [];
  const xs = item.x.flat(), ys = item.y.flat(), zs = item.z ? item.z.flat() : null;
  for (let i = 0; i < xs.length; i++) if (xs[i] !== null && ys[i] !== null && (!zs || zs[i] !== null)) out.push(zs ? [xs[i], ys[i], zs[i]] : [xs[i], ys[i]]);
  return out;
};

test('a function: its values over its range, "y =" written or not', () => {
  const f = figure({ title: 'Parabola', plots: [{ type: 'function', y: 'y = x^2 - 3x + 2', x: [-1, 4] }] });
  const item = f.items[0];
  assert.strictEqual(f.dim, 2);
  assert.strictEqual(item.x[0], -1);
  assert.strictEqual(item.x[item.x.length - 1], 4);
  for (let i = 0; i < item.x.length; i++) assert.ok(close(item.y[i], item.x[i] ** 2 - 3 * item.x[i] + 2));
  assert.strictEqual(item.clip, null, 'nothing runs off to infinity');
});

test('an asymptote is a gap, not a vertical line, and the view keeps to the curve', () => {
  const item = figure({ plots: [{ type: 'function', y: 'tan(x)', x: [-3, 3] }] }).items[0];
  const gaps = item.y.filter((v) => v === null).length;
  assert.ok(gaps >= 2, `${gaps} gaps`);
  for (let i = 1; i < item.y.length; i++) {
    if (item.y[i] === null || item.y[i - 1] === null) continue;
    assert.ok(Math.abs(item.y[i] - item.y[i - 1]) < 20, `a line drawn across the asymptote near x = ${item.x[i]}`);
  }
  assert.ok(item.clip && item.clip[1] < 100, `view ${item.clip}`);
  // Over a wide range the values either side of an asymptote are ordinary
  // ones (±12): only the value halfway between shows the jump is not a line.
  const wide = figure({ plots: [{ type: 'function', y: 'tan(x)', x: [-30, 30] }] }).items[0];
  for (let i = 1; i < wide.y.length; i++) {
    if (wide.y[i] === null || wide.y[i - 1] === null) continue;
    assert.ok(!(Math.sign(wide.y[i]) !== Math.sign(wide.y[i - 1]) && Math.abs(wide.y[i] - wide.y[i - 1]) > 10), `a line across an asymptote near x = ${wide.x[i]}`);
  }
  const hyperbola = figure({ plots: [{ type: 'function', y: '1/x', x: [-2, 2] }] }).items[0];
  assert.ok(hyperbola.y.includes(null) && hyperbola.clip);
});

test('polar, implicit and parametric curves lie where their equations say', () => {
  const polar = figure({ plots: [{ type: 'polar', r: '2' }] }).items[0];
  for (const [x, y] of pointsOf(polar)) assert.ok(close(Math.hypot(x, y), 2, 1e-9));
  const circle = figure({ plots: [{ type: 'implicit', equation: 'x^2 + y^2 = 9' }] }).items[0];
  const pts = pointsOf(circle);
  assert.ok(pts.length > 300, `${pts.length} points`);
  for (const [x, y] of pts) assert.ok(Math.abs(Math.hypot(x, y) - 3) < 0.01, `${x}, ${y}`);
  const helix = figure({ plots: [{ type: 'curve', x: 'cos(t)', y: 'sin(t)', z: 't/4', t: [0, '4pi'] }] });
  assert.strictEqual(helix.dim, 3);
  for (const [x, y] of pointsOf(helix.items[0])) assert.ok(close(Math.hypot(x, y), 1, 1e-9));
  // Off the grid's own points, so x = 0 is never sampled and the pole has to be seen for what it is.
  for (const x of [[-3, 3], [-2.95, 3.05]]) {
    const pole = figure({ plots: [{ type: 'implicit', equation: 'y = 1/x', x, y: [-3, 3] }] }).items[0];
    const pts = pointsOf(pole);
    assert.ok(pts.length > 100, `${pts.length} points`);
    for (const [px, py] of pts) assert.ok(Math.abs(px * py - 1) < 0.2, `a pole drawn as a line at ${px}, ${py} (x in ${x})`);
  }
});

test('a surface and a parametric surface: a grid of their values', () => {
  const s = figure({ plots: [{ type: 'surface', z: 'sin(x)*cos(y)', x: [-3, 3], y: [-2, 2] }] }).items[0];
  assert.strictEqual(s.z.length, s.y.length);
  assert.strictEqual(s.z[0].length, s.x.length);
  assert.ok(close(s.z[5][7], Math.sin(s.x[7]) * Math.cos(s.y[5])));
  const p = figure({ plots: [{ type: 'parametric', x: 'cos(u)*sin(v)', y: 'sin(u)*sin(v)', z: 'cos(v)', u: [0, '2pi'], v: [0, 'pi'] }] }).items[0];
  for (const q of pointsOf(p)) assert.ok(close(Math.hypot(...q), 1, 1e-9));
});

test('solids: a sphere at its radius, a cone narrowing to its apex, a torus, a box, a pyramid', () => {
  const f = figure({ plots: [
    { type: 'sphere', center: [1, 2, 3], radius: 2 },
    { type: 'cone', center: [0, 0, 0], radius: 1, height: 3 },
    { type: 'torus', R: 2, r: 0.5 },
    { type: 'box', center: [0, 0, 0], size: [2, 4, 6] },
    { type: 'pyramid', base: 4, height: 3 },
    { type: 'cylinder', radius: 1.5, height: 2, axis: 'x' }
  ] });
  assert.strictEqual(f.aspect, 'equal', 'solids are drawn to scale');
  const [sphere, cone, torus, box, pyramid, cylinder] = f.items;
  for (const [x, y, z] of pointsOf(sphere.parts[0])) assert.ok(close(Math.hypot(x - 1, y - 2, z - 3), 2, 1e-9));
  for (const [x, y, z] of pointsOf(cone.parts[0])) assert.ok(close(Math.hypot(x, y), 1 - z / 3, 1e-9));
  for (const [x, y, z] of pointsOf(torus.parts[0])) assert.ok(close(Math.hypot(Math.hypot(x, y) - 2, z), 0.5, 1e-9));
  assert.deepStrictEqual([Math.min(...box.x), Math.max(...box.x), Math.min(...box.z), Math.max(...box.z)], [-1, 1, -3, 3]);
  assert.strictEqual(box.i.length, 12, 'six faces, two triangles each');
  assert.strictEqual(Math.max(...pyramid.z), 3);
  for (const [x, y, z] of pointsOf(cylinder.parts[0])) assert.ok(close(Math.hypot(y, z), 1.5, 1e-9) && x >= 0 && x <= 2);
});

test('a function fills the figure, its roots marked or not; a circle is drawn round', () => {
  assert.strictEqual(figure({ plots: [{ type: 'function', y: 'x^2 - 3x + 2' }, { type: 'points', points: [[1, 0], [2, 0]] }] }).aspect, 'auto', 'points stretched a function to scale');
  assert.strictEqual(figure({ plots: [{ type: 'implicit', equation: 'x^2 + y^2 = 9' }] }).aspect, 'equal');
  assert.strictEqual(figure({ plots: [{ type: 'surface', z: 'x^2 + y^2' }] }).aspect, 'auto');
  assert.strictEqual(figure({ aspect: 'equal', plots: [{ type: 'function', y: 'x' }] }).aspect, 'equal', 'asked for');
});

test('a plane by its normal and point, or by its equation, holds the equation', () => {
  const [byNormal, byEquation] = figure({ plots: [
    { type: 'plane', normal: [1, 2, -1], point: [0, 0, -3] },
    { type: 'plane', equation: 'x + 2y - z = 3' }
  ] }).items;
  for (const item of [byNormal, byEquation]) for (const [x, y, z] of pointsOf(item.parts[0])) assert.ok(close(x + 2 * y - z, 3, 1e-9), `${x}, ${y}, ${z}`);
  assert.strictEqual(plot.buildFigure(JSON.stringify({ type: 'plane', equation: 'x^2 + y = z' })).error.code, 'notPlane');
});

test('vectors, points and implicit surfaces', () => {
  const f = figure({ plots: [{ type: 'vector', to: [1, 2, 3] }, { type: 'vector', from: [1, 1, 1], to: [2, 0, 1] }, { type: 'points', points: [[1, 2, 3], [0, 0, 0]], labels: ['A', 'O'] }, { type: 'implicit', equation: 'x^2 + y^2 + z^2 = 4' }] });
  assert.deepStrictEqual([f.items[0].from, f.items[0].to], [[0, 0, 0], [1, 2, 3]]);
  assert.deepStrictEqual(f.items[2].labels, ['A', 'O']);
  const iso = f.items[3];
  assert.strictEqual(iso.kind, 'iso');
  assert.ok(iso.value.some((v) => v < 0) && iso.value.some((v) => v > 0));
  const flat = figure({ plots: [{ type: 'vector', to: [3, 4] }] });
  assert.strictEqual(flat.dim, 2);
  assert.strictEqual(flat.items[0].kind, 'arrow2d');
});

test('words reach the figure as text: no markup, no odd colours', () => {
  const f = figure({ title: '<img src=x onerror=alert(1)>Paraboloid', axes: ['<b>x</b>', 'y', 'z'], plots: [{ type: 'surface', z: 'x^2+y^2', name: '<a href="javascript:alert(1)">z</a>', color: 'red; background: url(x)' }, { type: 'sphere', color: '#ff8800', opacity: 0.5 }] });
  assert.ok(!/[<>]/.test(f.title + f.axes.join('') + f.items[0].name), JSON.stringify([f.title, f.axes, f.items[0].name]));
  assert.strictEqual(f.items[0].color, '');
  assert.strictEqual(f.items[1].color, '#ff8800');
  assert.strictEqual(f.items[1].opacity, 0.5);
});

test('relaxed as models write it: bare keys, single quotes, a comment, a fence', () => {
  const f = figure("```mathplot\n{title: 'Waves', plots: [{type: 'surface', z: 'sin(x)', x: [-3, 3], y: [-3, 3],}], // the surface\n}\n```");
  assert.strictEqual(f.title, 'Waves');
  assert.strictEqual(figure("{type: 'function', y: 'x'}").items.length, 1, 'a single plot without a list');
});

console.log('\nWhat is wrong is said, by what it is:');

test('each fault has its own code', () => {
  const err = (spec) => plot.buildFigure(typeof spec === 'string' ? spec : JSON.stringify(spec)).error;
  assert.strictEqual(err('{plots: [').code, 'unreadable');
  assert.strictEqual(err({ plots: [] }).code, 'noPlots');
  assert.strictEqual(err({ plots: Array(13).fill({ type: 'sphere' }) }).code, 'tooManyPlots');
  assert.deepStrictEqual(err({ plots: [{ type: 'sphere' }, { type: 'sufrace', z: 'x' }] }), { code: 'unknownType', type: 'sufrace', index: 1 });
  assert.deepStrictEqual(err({ plots: [{ type: 'function' }] }), { code: 'missing', index: 0, field: 'y', type: 'function' });
  const bad = err({ plots: [{ type: 'function', y: 'foo(x) + 1' }] });
  assert.strictEqual(bad.code, 'expression');
  assert.deepStrictEqual([bad.field, bad.text, bad.detail.code, bad.detail.name], ['y', 'foo(x) + 1', 'unknownName', 'foo']);
  assert.strictEqual(err({ plots: [{ type: 'function', y: 'x', x: [3, 1] }] }).code, 'range');
  assert.strictEqual(err({ plots: [{ type: 'sphere', radius: -1 }] }).code, 'number');
  assert.strictEqual(err({ plots: [{ type: 'vector', to: [1] }] }).code, 'vector');
  assert.strictEqual(err({ plots: [{ type: 'function', y: 'x' }, { type: 'sphere' }] }).code, 'mixed');
  assert.deepStrictEqual(err({ plots: [{ type: 'function', y: 'sqrt(-1 - x^2)' }] }), { code: 'nothingDrawn', index: 0 });
});

test('a plot that draws nothing beside one that draws is named, not dropped silently', () => {
  const f = figure({ plots: [{ type: 'function', y: 'x', name: 'line' }, { type: 'function', y: 'ln(-1 - x^2)', name: 'nothing' }] });
  assert.deepStrictEqual(f.empty, [{ index: 1, name: 'nothing' }]);
});

test('a big figure is quick enough to draw on a phone', () => {
  const started = Date.now();
  figure({ plots: [
    { type: 'implicit', equation: 'x^4 + y^4 + z^4 - 5(x^2 + y^2 + z^2) = -10' },
    { type: 'surface', z: 'sin(sqrt(x^2 + y^2))', x: [-8, 8], y: [-8, 8] },
    { type: 'parametric', x: '(2 + cos(v))cos(u)', y: '(2 + cos(v))sin(u)', z: 'sin(v)' }
  ] });
  const ms = Date.now() - started;
  assert.ok(ms < 1500, `${ms} ms`);
});

test('every fault is said in both languages, with nothing left unfilled', () => {
  const { createTranslator, CATALOG } = require('../public/domain/i18n.js');
  const faults = [
    { code: 'unreadable' }, { code: 'noPlots' }, { code: 'tooManyPlots', max: 12 }, { code: 'unknownType', type: 'sufrace', index: 1 },
    { code: 'missing', field: 'y', type: 'function', index: 0 }, { code: 'range', field: 'x', index: 0 }, { code: 'number', field: 'radius', index: 2 },
    { code: 'vector', field: 'to', index: 0 }, { code: 'mixed' }, { code: 'nothingDrawn', index: 0 }, { code: 'notPlane', field: 'equation', index: 0 },
    ...['unknownName', 'needsParens', 'arity', 'tooLong', 'tooDeep', 'syntax', 'unexpected'].map((code) => ({ code: 'expression', field: 'y', text: 'foo(x)', index: 0, detail: { code, name: 'foo' } }))
  ];
  for (const lang of ['en', 'ar']) {
    const t = createTranslator(() => lang);
    for (const fault of faults) {
      const said = plot.explain(fault, t);
      assert.ok(said && !/[{}]/.test(said) && !/^mp[A-Z]/.test(said), `${lang} ${JSON.stringify(fault)}: ${said}`);
    }
    assert.ok(plot.explain(faults[faults.length - 7], t).includes(t('mpWhyUnknownName', { name: 'foo' })), 'the unknown name is named as unknown');
  }
  const keys = (lang) => Object.keys(CATALOG[lang]).filter((k) => /^(?:mp|mathPlot)/.test(k)).sort();
  assert.deepStrictEqual(keys('ar'), keys('en'), 'every figure string exists in both languages');
});

console.log('\nWhich messages ask for one (asksForPlot):');

const YES = [
  'ارسملي منحنى الدالة y = x^2 - 3x + 2 وحدد جذورها', 'ارسملي سطح z = sin(x) cos(y) ثلاثي الأبعاد', 'ارسم كرة ومخروط بشكل ثلاثي الأبعاد',
  'ارسم الدائرة x^2 + y^2 = 9', 'ارسملي الحلزون x=cos t, y=sin t, z=t', 'وضحلي المتجهات (1,2,3) و (2,0,1) بالرسم', 'ارسملي e^-t',
  'ارسم كرة نصف قطرها 3', 'ارسم الاقتران ق(س) = س٢', 'ارسم قطع مكافئ', 'ارسملي منحنى دالة الجيب', 'ارسم كرة ومكعب',
  'Plot the surface z = x^2 - y^2', 'Draw a sphere and a cone in 3D and explain their volumes', 'graph r = 1 + cos(theta) in polar',
  'plot e^-t', 'draw a pyramid with height 5 and base 4', 'Draw the plane x + 2y - z = 3', 'sketch the graph of the function sin(x)/x'
];
const NO = [
  'ارسملي مخطط المبيعات الشهرية: يناير 10 فبراير 15 مارس 12', 'اكتبلي رسالة رسمية عن مستوى الأداء', 'ارسملي كرة قدم', 'ارسم هرم',
  'ارسملي خريطة وانا متجه لعمان', 'اكتبلي رسالة رسمية عن الدالة الأسية', 'ما هو حجم الكرة', 'ارسملي منحنى المبيعات', 'صمملي موقع شخصي', 'ارسملي شعار لمطعم', 'مرسوم ملكي جديد',
  'draw a 3d cat', 'write a story with an interesting plot about a circle of friends', 'what is the volume of a sphere of radius 3',
  'draw me a cute cat', 'Draw a bar chart of our monthly sales', 'Explain the function of the liver'
];
test(`${YES.length} requests for a figure of mathematics, in Arabic and English`, () => {
  assert.deepStrictEqual(YES.filter((t) => !plot.asksForPlot(t)), []);
});
test(`${NO.length} that are not: data charts, pictures, a football, a word inside another word`, () => {
  assert.deepStrictEqual(NO.filter((t) => plot.asksForPlot(t)), []);
});
test('an answer that drew one is known by its block', () => {
  assert.ok(plot.answerHasPlot('Here:\n```mathplot\n{}\n```') && plot.answerHasPlot('```math3d\n{}\n```'));
  assert.ok(!plot.answerHasPlot('```chart\n{}\n```'));
});

console.log('\n========================================');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

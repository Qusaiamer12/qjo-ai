#!/usr/bin/env node
// Opens the office page in a real Chromium with a stand-in database and
// checks that what it shows is what is true: where each person stands, and
// what is written over them. Run it before every publish of the page.
// Usage: node .claude/company/office/check-office.js [--shot out.png]
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const staff = [
  { id: 'manager', order: 1, name: 'المدير', status: 'idle' },
  { id: 'token-officer', order: 2, name: 'المحاسب', status: 'idle', next: 'قراءات' },
  { id: 'backend', order: 3, name: 'باك إند', status: 'working', task: 'بند 18' },
  { id: 'frontend', order: 4, name: 'فرونت', status: 'idle', next: 'بند 26' },
  { id: 'ux', order: 5, name: 'ux', status: 'idle', next: 'بند 24' },
  { id: 'data-quality', order: 6, name: 'جودة', status: 'blocked', task: 'مستني موافقة' },
];
const stub = (schedule) => `
  (() => {
    const docs = { staff: ${JSON.stringify(staff)}, approvals: [] };
    const meta = { budget: { sessionPct: 10, weeklyPct: 40 }, schedule: ${JSON.stringify(schedule)} };
    const snapOf = (list) => ({ docs: list.map((d) => ({ id: d.id, data: () => d, ref: { update: async () => {} } })), forEach(f) { this.docs.forEach(f); } });
    const coll = (name) => { const q = { orderBy: () => q, limit: () => q, where: () => q, onSnapshot: (ok) => { setTimeout(() => ok(snapOf(docs[name] || [])), 10); return () => {}; } }; return q; };
    const db = { collection: coll, doc: (p) => ({ onSnapshot: (ok) => { const d = meta[p.split('/')[1]]; setTimeout(() => ok({ exists: !!d, data: () => d }), 10); return () => {}; } }) };
    window.claude = { use: async () => db, user: async () => ({ id: 'u' }) };
  })();`;

async function look(browser, schedule) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(stub(schedule));
  await page.goto('file://' + path.join(__dirname, 'qjo-office.html'));
  await page.waitForTimeout(6000); // walking takes time
  const where = await page.evaluate(() => {
    if (typeof people === 'undefined' || typeof ROOMS === 'undefined') return null;
    const inRoom = (p) => Object.entries(ROOMS).find(([, r]) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)?.[0] || 'hall';
    return Object.fromEntries([...people.values()].map((p) => [p.id, { room: inRoom(p), goalRoom: inRoom(p.goal), status: p.status }]));
  });
  return { page, errors, where };
}

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  const expect = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
  const off = await look(browser, { running: false, hours: [2, 7, 12, 21], minute: 7, days: [0, 1, 2, 3, 4, 6] });
  expect(off.where !== null, 'the page exposes its people (the probe sees real state)');
  expect(off.errors.length === 0, 'no page errors off shift: ' + off.errors.join(' | '));
  if (off.where) {
    expect(off.where.backend.goalRoom === 'backend', 'a working employee goes to its own desk');
    expect(off.where.frontend.goalRoom === 'lounge', 'off shift, an idle employee goes to the lounge');
    expect(off.where['token-officer'].goalRoom === 'lounge', 'off shift, the accountant is in the lounge, not at the door');
  }
  const on = await look(browser, { running: true, runningSince: new Date().toISOString(), hours: [2, 7, 12, 21], minute: 7, days: [0, 1, 2, 3, 4, 6] });
  expect(on.errors.length === 0, 'no page errors on shift: ' + on.errors.join(' | '));
  if (on.where) {
    expect(on.where.frontend.goalRoom === 'frontend', 'on shift, an idle employee waits at its own desk');
    expect(on.where.backend.goalRoom === 'backend', 'on shift, a working employee is at its desk');
  }
  const shot = process.argv.indexOf('--shot');
  if (shot > 0) await on.page.screenshot({ path: process.argv[shot + 1] });
  await browser.close();
  console.log(failed ? `${failed} failed` : 'all passed');
  process.exit(failed ? 1 : 0);
})();

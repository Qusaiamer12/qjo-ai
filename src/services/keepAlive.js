// ─────────────────────────────────────────────────────────────────────────────
// Keep-alive — stops Render's free instance from spinning down mid-day.
//
// THE PROBLEM
//   A Render free web service spins down after 15 minutes with no *inbound*
//   traffic. The next visitor then waits ~50-60s for a cold start, which reads
//   as "the site is broken".
//
// THE CONSTRAINT THAT SHAPES THIS FILE
//   Render grants 750 free instance hours per calendar month, per WORKSPACE
//   (not per service). A 31-day month is 744 hours. So keeping one service
//   awake 24/7 consumes ~all of the allowance, and when it runs out Render
//   SUSPENDS every free web service until the 1st of next month. A suspended
//   service is strictly worse than a sleeping one.
//
//   The default here is ALWAYS-ON (start === end === 0, no window): 744 h in a
//   31-day month against the 750 h cap. That is deliberate and safe only while
//   this is the workspace's only free service -- a second one exhausts the pool
//   and suspends both. Set KEEP_ALIVE_START_HOUR/END_HOUR to a real window
//   (e.g. 7 and 1 => 558 h/month) to buy headroom back.
//
//   Deploys are NOT a meaningful cost here: builds bill to build minutes, not
//   instance hours, and the old/new instance overlap during a zero-downtime
//   deploy is only ~2-3 minutes. The real risk is simply running 24/7.
//
// TWO THINGS THAT SILENTLY BREAK NAIVE IMPLEMENTATIONS
//   1. Pinging 127.0.0.1 does NOT work. The idle timer is reset by traffic
//      arriving at Render's router; a loopback request never reaches it. The
//      ping MUST go to the public URL, so we require RENDER_EXTERNAL_URL.
//   2. Never ping /robots.txt. While a free service is spun down, Render
//      answers that path itself with a disallow-all and the request never
//      reaches (or wakes) your app.
//
// WHAT THIS CAN AND CANNOT DO
//   It keeps a RUNNING process awake. It cannot wake a process that already
//   went to sleep — the pinger dies with it. Waking from cold requires an
//   external pinger (see docs/RENDER_KEEP_AWAKE.md).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// 10 min, comfortably under Render's 15 min idle timer. The margin absorbs a
// ping that is slow, times out, or is missed entirely without ever letting the
// idle timer reach 15.
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const MAX_SAFE_INTERVAL_MS = 14 * 60 * 1000;
const PING_TIMEOUT_MS = 20 * 1000;
// Budget is judged against the WORST case (a 31-day month = 744 h), not an
// average. Using 30.44 would under-report by ~14 h and hide the fact that a
// 24/7 window overruns the cap in long months.
const MAX_DAYS_PER_MONTH = 31;
const FREE_HOURS_PER_MONTH = 750;
// Leave room for restarts and any other free service in the workspace. Going
// past this is what gets a workspace suspended.
const BUDGET_WARN_HOURS = 700;

function parseHour(value, fallback) {
  // Guard the empty string explicitly: Number('') is 0, not NaN, so an unset or
  // blank env var would otherwise parse as hour 0 and turn the intended
  // 07:00-01:00 default into an unintended 24/7 window.
  const raw = String(value ?? '').trim();
  if (raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
}

/**
 * Hour-of-day (0-23) in an IANA timezone, without pulling in a date library.
 * Falls back to server-local time if the zone is unknown.
 */
function hourIn(timeZone, now = new Date()) {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false
    }).format(now);
    const hour = Number(formatted);
    // Some ICU builds render midnight as "24".
    return Number.isFinite(hour) ? hour % 24 : now.getHours();
  } catch {
    return now.getHours();
  }
}

/** Window may wrap past midnight (e.g. 07 -> 01). startHour === endHour means 24/7. */
function isWithinWindow(hour, startHour, endHour) {
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

function windowHours(startHour, endHour) {
  if (startHour === endHour) return 24;
  return startHour < endHour ? endHour - startHour : 24 - startHour + endHour;
}

function createKeepAliveService(options = {}) {
  const env = options.env || process.env;
  const log = options.logger || console;

  const explicitlyEnabled = String(env.KEEP_ALIVE_ENABLED ?? '').trim().toLowerCase();
  const baseUrl = String(
    env.KEEP_ALIVE_URL || env.RENDER_EXTERNAL_URL || ''
  ).trim().replace(/\/+$/, '');

  // Default ON when running on Render with a known public URL, OFF otherwise so
  // local dev and CI never spray requests at themselves.
  const enabled = explicitlyEnabled === 'true'
    ? true
    : explicitlyEnabled === 'false'
      ? false
      : Boolean(env.RENDER && baseUrl);

  const timeZone = String(env.KEEP_ALIVE_TIMEZONE || 'Asia/Amman').trim() || 'Asia/Amman';
  // Default 0/0 == always-on: start === end disables windowing entirely, so
  // the service never sleeps. Set both to a real window (e.g. 7 and 1) to trade
  // some uptime for free-hours headroom.
  const startHour = parseHour(env.KEEP_ALIVE_START_HOUR, 0);
  const endHour = parseHour(env.KEEP_ALIVE_END_HOUR, 0);

  const rawInterval = Number(env.KEEP_ALIVE_INTERVAL_MS);
  const intervalMs = Number.isFinite(rawInterval) && rawInterval >= MIN_INTERVAL_MS
    ? Math.min(rawInterval, MAX_SAFE_INTERVAL_MS)
    : DEFAULT_INTERVAL_MS;

  const path = String(env.KEEP_ALIVE_PATH || '/api/health').trim() || '/api/health';
  const targetUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const activeHours = windowHours(startHour, endHour);
  const estimatedMonthlyHours = Math.round(activeHours * MAX_DAYS_PER_MONTH);
  const alwaysOn = activeHours === 24;

  const state = {
    enabled,
    running: false,
    pings: 0,
    failures: 0,
    skippedOutsideWindow: 0,
    lastPingAt: null,
    lastStatus: null,
    lastError: null
  };

  let timer = null;

  async function pingOnce() {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    try {
      const res = await fetch(targetUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'qjo-keepalive/1.0',
          'X-Qjo-Keepalive': '1',
          'Cache-Control': 'no-cache'
        }
      });
      state.pings += 1;
      state.lastPingAt = new Date().toISOString();
      state.lastStatus = res.status;
      if (!res.ok) {
        state.failures += 1;
        state.lastError = `HTTP ${res.status}`;
      } else {
        state.lastError = null;
      }
      return res.ok;
    } catch (error) {
      state.pings += 1;
      state.failures += 1;
      state.lastPingAt = new Date().toISOString();
      state.lastStatus = null;
      state.lastError = error?.name === 'AbortError' ? 'timeout' : String(error?.message || error);
      return false;
    } finally {
      clearTimeout(abortTimer);
    }
  }

  async function tick() {
    const hour = hourIn(timeZone);
    if (!isWithinWindow(hour, startHour, endHour)) {
      state.skippedOutsideWindow += 1;
      return;
    }
    await pingOnce();
  }

  function start() {
    if (!enabled) {
      log.log('[keep-alive] disabled.');
      return false;
    }
    if (!baseUrl) {
      log.warn('[keep-alive] no RENDER_EXTERNAL_URL or KEEP_ALIVE_URL set — refusing to start. A loopback ping does not reset Render\'s idle timer.');
      state.enabled = false;
      return false;
    }
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(baseUrl)) {
      log.warn(`[keep-alive] target ${baseUrl} is loopback — refusing to start. Traffic must reach Render's router to reset the idle timer.`);
      state.enabled = false;
      return false;
    }
    if (/robots\.txt$/i.test(targetUrl)) {
      log.warn('[keep-alive] refusing to ping /robots.txt — Render answers it while the service is asleep, so it never wakes anything.');
      state.enabled = false;
      return false;
    }
    if (timer) return true;

    if (alwaysOn || estimatedMonthlyHours > FREE_HOURS_PER_MONTH) {
      // 24/7 lands here: 24 * 31 = 744 h against a 750 h cap leaves 6 h for the
      // whole workspace, so a second free service or a stretch of unplanned
      // restarts overruns it. A 30-day month (720 h) is comfortable; the risk
      // is specifically the long months.
      log.warn(
        `[keep-alive] ⚠️ ALWAYS-ON: ${activeHours}h/day = ~${estimatedMonthlyHours} instance-hours in a 31-day month, ` +
        `leaving only ${FREE_HOURS_PER_MONTH - estimatedMonthlyHours}h of Render's ${FREE_HOURS_PER_MONTH}h free cap for the ENTIRE workspace. ` +
        'Running out SUSPENDS every free web service until the 1st of next month. ' +
        'Fine if this is the only free service and you watch Billing; otherwise set ' +
        'KEEP_ALIVE_START_HOUR/KEEP_ALIVE_END_HOUR to a daily window, or upgrade to Starter ($7/mo).'
      );
    } else if (estimatedMonthlyHours > BUDGET_WARN_HOURS) {
      log.warn(
        `[keep-alive] window of ${activeHours}h/day is ~${estimatedMonthlyHours} instance-hours/month, close to Render's ${FREE_HOURS_PER_MONTH}h free cap. ` +
        'Exhausting it SUSPENDS every free web service in the workspace until next month. Narrow KEEP_ALIVE_START_HOUR/KEEP_ALIVE_END_HOUR.'
      );
    }

    timer = setInterval(() => { tick().catch(() => {}); }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    state.running = true;

    log.log(
      `[keep-alive] on — ${targetUrl} every ${Math.round(intervalMs / 60000)}min, ` +
      `${String(startHour).padStart(2, '0')}:00-${String(endHour).padStart(2, '0')}:00 ${timeZone} ` +
      `(~${estimatedMonthlyHours}h/month of ${FREE_HOURS_PER_MONTH}h free).`
    );
    return true;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    state.running = false;
  }

  function health() {
    return {
      enabled: state.enabled,
      running: state.running,
      target: state.enabled ? targetUrl : null,
      intervalMinutes: Math.round(intervalMs / 60000),
      window: `${String(startHour).padStart(2, '0')}:00-${String(endHour).padStart(2, '0')}:00`,
      timeZone,
      withinWindowNow: isWithinWindow(hourIn(timeZone), startHour, endHour),
      alwaysOn,
      estimatedMonthlyHours,
      freeHoursCap: FREE_HOURS_PER_MONTH,
      // Negative means the configured window cannot fit inside the free tier.
      freeHoursMargin: FREE_HOURS_PER_MONTH - estimatedMonthlyHours,
      // always-on is flagged over-cap even at 744 <= 750, because a 6h margin
      // covers the whole workspace and leaves nothing for a second service.
      budgetRisk: (alwaysOn || estimatedMonthlyHours > FREE_HOURS_PER_MONTH)
        ? 'over-cap'
        : estimatedMonthlyHours > BUDGET_WARN_HOURS ? 'tight' : 'ok',
      pings: state.pings,
      failures: state.failures,
      lastPingAt: state.lastPingAt,
      lastStatus: state.lastStatus,
      lastError: state.lastError
    };
  }

  return { start, stop, health, pingOnce, isWithinWindow: () => isWithinWindow(hourIn(timeZone), startHour, endHour) };
}

module.exports = {
  createKeepAliveService,
  // exported for tests
  isWithinWindow,
  windowHours,
  hourIn
};

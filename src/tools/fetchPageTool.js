// Reading a page is what turns search into research. Search gives titles and a
// two-line snippet; anything that needs the actual argument, the actual number
// or the actual wording has to open the page.
//
// This tool reaches arbitrary URLs chosen by a language model, which makes it
// the most security-sensitive surface in the app. A model can be talked into
// fetching a URL by anything it reads — a search result, an uploaded document,
// a page it just opened. So the guards here assume the URL is hostile:
//
//   - http/https only: no file://, no gopher://, no data:
//   - private, loopback and link-local addresses are refused, which includes
//     169.254.169.254 (cloud metadata — the credentials endpoint)
//   - DNS is resolved and the resolved addresses are checked, so a public
//     hostname that points at 127.0.0.1 is refused too
//   - redirects are followed by hand and every hop is re-checked, because a
//     public URL is allowed to redirect to a private one
//   - responses are capped and streamed, so a multi-gigabyte body cannot
//     exhaust the instance
const dns = require('dns').promises;
const net = require('net');

const FETCH_PAGE_TOOL = {
  type: 'function',
  function: {
    name: 'fetch_page',
    description: 'Open a web page and read its text. Use after web_search when the snippet is not enough: to read an argument in full, check an exact figure, quote wording precisely, or follow a source you were given. Returns readable text, not HTML.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The absolute http(s) URL to open.' }
      },
      required: ['url']
    }
  }
};

const MAX_BYTES = 900 * 1024;
const MAX_TEXT_CHARS = 20000;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 12000;

function isBlockedAddress(address) {
  const type = net.isIP(address);
  if (!type) return true;

  if (type === 4) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;          // this host, private, loopback
    if (a === 169 && b === 254) return true;                     // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;            // private
    if (a === 192 && b === 168) return true;                     // private
    if (a === 100 && b >= 64 && b <= 127) return true;           // carrier-grade NAT
    if (a >= 224) return true;                                   // multicast and reserved
    return false;
  }

  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return true;            // unspecified, loopback
  if (lower.startsWith('fe80')) return true;                     // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('ff')) return true;                       // multicast
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) must be judged as the IPv4 it carries.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedAddress(mapped[1]);
  return false;
}

async function assertUrlIsFetchable(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || ''));
  } catch (_) {
    throw new Error('That is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs can be opened.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  // A literal IP needs no lookup, and must be checked before one.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error('That address is not reachable from here.');
    return url;
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true });
  } catch (_) {
    throw new Error('That host could not be resolved.');
  }
  if (!records.length) throw new Error('That host could not be resolved.');
  // Every resolved address must be public: one private answer is enough to
  // make the request unsafe.
  for (const record of records) {
    if (isBlockedAddress(record.address)) throw new Error('That address is not reachable from here.');
  }
  return url;
}

// Turns a page into something worth spending context on: no scripts, no style
// blocks, no navigation soup, and block-level tags become line breaks so the
// structure survives.
function htmlToText(html) {
  let text = String(html || '');
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ');
  text = text.replace(/<(nav|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre)>/gi, '\n');
  text = text.replace(/<li\b[^>]*>/gi, '\n- ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  text = text.replace(/[ \t\u00a0]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n+/g, '\n\n');
  return text.trim();
}

function titleOf(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]).slice(0, 200) : '';
}

// Reads at most MAX_BYTES, then stops — a body that never ends must not be
// able to hold the instance open or fill its memory.
async function readCapped(response) {
  const reader = response.body?.getReader?.();
  if (!reader) return (await response.text()).slice(0, MAX_BYTES);
  const chunks = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    chunks.push(value);
  }
  try { await reader.cancel(); } catch (_) { /* already closed */ }
  return Buffer.concat(chunks.map(c => Buffer.from(c))).subarray(0, MAX_BYTES).toString('utf8');
}

async function fetchPage(rawUrl, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  let url = await assertUrlIsFetchable(rawUrl);
  const visited = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    visited.push(url.toString());
    // One clock per hop covering the whole exchange, body included. It used to
    // be cleared as soon as headers arrived, so a page that then sent nothing
    // held the socket open for as long as it liked.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const outcome = await fetchHop(url, { fetchImpl, signal: controller.signal, timeoutMs });
      if (outcome.redirectTo) {
        url = outcome.redirectTo;
        continue;
      }
      return { ...outcome.page, redirects: visited.slice(0, -1) };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('That URL redirected too many times.');
}

async function fetchHop(url, { fetchImpl, signal, timeoutMs }) {
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      redirect: 'manual',
      signal,
      headers: {
        // Identify honestly; some sites serve a different page to unknown agents.
        'User-Agent': 'QjoAI/1.0 (+https://github.com/Qusaiamer12/qjo-ai)',
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5'
      }
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`The page did not respond within ${timeoutMs / 1000}s.`);
    throw new Error(`Could not open the page: ${error?.message || error}`);
  }

  // A public URL is allowed to redirect somewhere private, so each hop is
  // re-validated rather than trusted because the first one passed.
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error(`The page returned ${response.status} with no destination.`);
    return { redirectTo: await assertUrlIsFetchable(new URL(location, url).toString()) };
  }

  if (!response.ok) throw new Error(`The page returned HTTP ${response.status}.`);

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType && !/text\/html|text\/plain|application\/xhtml|application\/json|text\/markdown|application\/xml|text\/xml/.test(contentType)) {
    throw new Error(`That URL is ${contentType.split(';')[0] || 'a binary file'}, which cannot be read as text.`);
  }

  let body;
  try {
    body = await readCapped(response);
  } catch (error) {
    if (signal.aborted) throw new Error(`The page did not finish loading within ${timeoutMs / 1000}s.`);
    throw new Error(`The page stopped sending before it finished: ${error?.message || error}`);
  }
  const isHtml = /html|xml/.test(contentType) || /^\s*<(!doctype|html)/i.test(body);
  const text = isHtml ? htmlToText(body) : body.trim();
  const title = isHtml ? titleOf(body) : '';
  const clipped = text.length > MAX_TEXT_CHARS;

  return {
    page: {
      url: url.toString(),
      title,
      text: clipped ? text.slice(0, MAX_TEXT_CHARS) : text,
      truncated: clipped
    }
  };
}

// What the model actually sees. The header matters: without the resolved URL
// and the truncation flag it will cite a redirect source or quote a page it
// only read half of.
function formatForModel(page) {
  const header = [
    `PAGE: ${page.url}`,
    page.title ? `TITLE: ${page.title}` : '',
    page.redirects.length ? `REDIRECTED FROM: ${page.redirects.join(' -> ')}` : '',
    page.truncated ? 'NOTE: truncated — this is the beginning of the page, not all of it.' : ''
  ].filter(Boolean).join('\n');
  return `${header}\n\n${page.text}`;
}

module.exports = { FETCH_PAGE_TOOL, fetchPage, formatForModel, assertUrlIsFetchable, isBlockedAddress, htmlToText };

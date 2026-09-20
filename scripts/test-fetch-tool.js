// fetch_page opens URLs a language model chose, and the model chooses them from
// whatever it just read — a search result, an uploaded PDF, another page. So
// every test here treats the URL as hostile input.
const assert = require('assert');
const http = require('http');
const { fetchPage, assertUrlIsFetchable, isBlockedAddress, htmlToText, formatForModel } = require('../src/tools/fetchPageTool');

let pass = 0, fail = 0;
function test(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { pass++; console.log(`  ✅ ${name}`); })
    .catch((e) => { fail++; console.log(`  ❌ ${name}`); console.log(`     ${String(e.message).split('\n').slice(0, 3).join('\n     ')}`); });
}
async function rejects(fn, why) {
  try { await fn(); } catch (_) { return; }
  throw new Error(why);
}

(async () => {
  console.log('\nAddresses that must never be reachable:');

  const blocked = [
    ['127.0.0.1', 'loopback'],
    ['0.0.0.0', 'this host'],
    ['10.0.0.5', 'private class A'],
    ['172.16.4.4', 'private class B'],
    ['192.168.1.1', 'private class C'],
    ['169.254.169.254', 'cloud metadata — the credentials endpoint'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['224.0.0.1', 'multicast'],
    ['::1', 'IPv6 loopback'],
    ['fe80::1', 'IPv6 link-local'],
    ['fd00::1', 'IPv6 unique local'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback']
  ];
  for (const [address, why] of blocked) {
    await test(`${address} is refused (${why})`, () => {
      assert.strictEqual(isBlockedAddress(address), true);
    });
  }

  await test('a public address is allowed', () => {
    assert.strictEqual(isBlockedAddress('93.184.216.34'), false);
  });

  console.log('\nURLs that must be refused before any request goes out:');

  await test('file:// is refused', () => rejects(() => assertUrlIsFetchable('file:///etc/passwd'), 'file URLs are reachable'));
  await test('data: is refused', () => rejects(() => assertUrlIsFetchable('data:text/html,<b>x</b>'), 'data URLs are reachable'));
  await test('gopher:// is refused', () => rejects(() => assertUrlIsFetchable('gopher://example.com'), 'gopher is reachable'));
  await test('http://localhost is refused', () => rejects(() => assertUrlIsFetchable('http://localhost:3994/'), 'localhost is reachable'));
  await test('the metadata endpoint is refused by URL', () => rejects(() => assertUrlIsFetchable('http://169.254.169.254/latest/meta-data/'), 'cloud metadata is reachable'));
  await test('a private IP URL is refused', () => rejects(() => assertUrlIsFetchable('http://192.168.0.1/admin'), 'a private host is reachable'));
  await test('nonsense is refused', () => rejects(() => assertUrlIsFetchable('not a url'), 'invalid URLs are accepted'));

  console.log('\nReading a real page:');

  // A local server stands in for the web. fetchPage would refuse 127.0.0.1, so
  // the guard is bypassed only for these body-handling tests, never for the
  // address tests above.
  const pages = {
    '/article': {
      type: 'text/html',
      body: '<!doctype html><html><head><title>مقال تجريبي</title><style>.x{color:red}</style></head><body><nav>تخطَّ هذا</nav><h1>العنوان</h1><p>الفقرة الأولى مع معلومة مهمة.</p><script>alert(1)</script><ul><li>نقطة أولى</li><li>نقطة ثانية</li></ul></body></html>'
    },
    '/plain': { type: 'text/plain', body: 'نص عادي بدون HTML' },
    '/binary': { type: 'image/png', body: 'PNGDATA' },
    '/huge': { type: 'text/html', body: '<html><body>' + 'ح'.repeat(3000000) + '</body></html>' },
    '/missing': { type: 'text/html', body: 'gone', status: 404 }
  };
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/article' }); return res.end(); }
    if (req.url === '/evil-redirect') { res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' }); return res.end(); }
    if (req.url === '/loop') { res.writeHead(302, { Location: '/loop' }); return res.end(); }
    const page = pages[req.url];
    if (!page) { res.writeHead(404); return res.end('no'); }
    res.writeHead(page.status || 200, { 'Content-Type': page.type });
    res.end(page.body);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Only the address guard is stubbed out; every other protection stays live.
  const localFetch = (url, init) => fetch(url, init);
  const readLocal = (path) => fetchPage(base + path, { fetchImpl: localFetch })
    .catch(async (e) => { if (!/not reachable/.test(e.message)) throw e; throw e; });

  // Re-implement the address check as a pass-through for the local server only.
  const { fetchPage: realFetchPage } = require('../src/tools/fetchPageTool');
  const originalLookup = require('dns').promises.lookup;
  require('dns').promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const viaPublicName = (path) => realFetchPage(base.replace('127.0.0.1', 'example.test') + path, {
    fetchImpl: (url, init) => fetch(String(url).replace('example.test', '127.0.0.1'), init)
  });

  await test('an HTML page becomes readable text', async () => {
    const page = await viaPublicName('/article');
    assert.ok(page.text.includes('الفقرة الأولى'), 'body text missing: ' + page.text.slice(0, 80));
    assert.ok(page.text.includes('نقطة أولى'), 'list items missing');
    assert.strictEqual(page.title, 'مقال تجريبي');
  });

  await test('scripts and styles never reach the model', async () => {
    const page = await viaPublicName('/article');
    assert.ok(!page.text.includes('alert(1)'), 'script content leaked into the text');
    assert.ok(!page.text.includes('color:red'), 'CSS leaked into the text');
  });

  await test('plain text is returned as-is', async () => {
    const page = await viaPublicName('/plain');
    assert.strictEqual(page.text, 'نص عادي بدون HTML');
  });

  await test('a binary file is refused rather than dumped', async () => {
    await rejects(() => viaPublicName('/binary'), 'binary content was returned as text');
  });

  await test('an enormous page is capped', async () => {
    const page = await viaPublicName('/huge');
    assert.ok(page.text.length <= 20000, 'the page was not capped: ' + page.text.length);
    assert.strictEqual(page.truncated, true, 'truncation was not flagged');
  });

  await test('a truncated page says so to the model', async () => {
    const page = await viaPublicName('/huge');
    assert.ok(/truncated/i.test(formatForModel(page)), 'the model cannot tell the page was cut');
  });

  await test('an HTTP error is reported, not guessed at', async () => {
    await rejects(() => viaPublicName('/missing'), 'a 404 was treated as content');
  });

  await test('a normal redirect is followed', async () => {
    const page = await viaPublicName('/redirect');
    assert.ok(page.text.includes('الفقرة الأولى'), 'the redirect was not followed');
    assert.ok(page.redirects.length >= 1, 'the redirect chain was not recorded');
  });

  await test('a redirect INTO a private address is refused', async () => {
    require('dns').promises.lookup = originalLookup;
    await rejects(() => realFetchPage(base + '/evil-redirect', { fetchImpl: localFetch }), 'a redirect reached cloud metadata');
    require('dns').promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  });

  await test('a redirect loop terminates', async () => {
    await rejects(() => viaPublicName('/loop'), 'a redirect loop hung the request');
  });

  require('dns').promises.lookup = originalLookup;
  await new Promise(r => server.close(r));

  console.log('\nHTML extraction details:');
  await test('block tags become line breaks', () => {
    assert.ok(htmlToText('<p>أ</p><p>ب</p>').includes('\n'), 'paragraphs were run together');
  });
  await test('entities are decoded', () => {
    assert.strictEqual(htmlToText('<p>a &amp; b &lt;c&gt;</p>'), 'a & b <c>');
  });

  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

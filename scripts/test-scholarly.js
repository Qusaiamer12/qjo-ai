// Papers and books from the catalogues that hold them, through the real
// search service, against a fake of each catalogue over real HTTP.
//
// A research or medical question used to be searched on the general web only,
// where the study itself sits three links deep. What is checked here: which
// questions reach which catalogues, what each response becomes (title, link,
// journal, year, authors, abstract), that a catalogue failing in any way
// costs only its own results, and that the papers reach the model beside the
// web results, labelled as what they are.
'use strict';

const http = require('http');
const assert = require('assert');
const { createScholarlyProviders, abstractFrom } = require('../src/search/scholarly');
const { createProviderHealth } = require('../src/search/providers');
const { createSearchService } = require('../src/services/searchService');
const { formatSearchResultsForTool } = require('../src/agents/toolAnswer');

let pass = 0, fail = 0;
function test(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { pass++; console.log(`  ✅ ${name}`); })
    .catch((e) => { fail++; console.log(`  ❌ ${name}`); console.log(`     ${String(e.message).split('\n').slice(0, 4).join('\n     ')}`); });
}

// ── One fake server standing in for every catalogue, by path ──
const hits = [];
let behaviour = {};
const RESPONSES = {
  '/openalex': () => ({ results: [{ id: 'https://openalex.org/W1', display_name: 'Global prevalence of diabetes', doi: 'https://doi.org/10.1016/S0140-6736(24)02317-1', publication_year: 2024, publication_date: '2024-11-13',
    primary_location: { source: { display_name: 'The Lancet' }, landing_page_url: 'https://www.thelancet.com/x' }, authorships: [{ author: { display_name: 'A. Author' } }, { author: { display_name: 'B. Author' } }],
    cited_by_count: 412, abstract_inverted_index: { Diabetes: [0], prevalence: [1], doubled: [2], since: [3], '1990.': [4] } }] }),
  '/s2': () => ({ data: [{ title: 'Metformin and cardiovascular outcomes', url: 'https://www.semanticscholar.org/paper/abc', abstract: 'A randomised trial of 4,000 patients.', year: 2023, venue: 'NEJM',
    authors: [{ name: 'C. Doe' }], citationCount: 88, externalIds: { DOI: '10.1056/NEJMoa2300000' }, publicationDate: '2023-05-02' }] }),
  '/esearch': () => ({ esearchresult: { idlist: ['38000001', '38000002'] } }),
  '/esummary': () => ({ result: { uids: ['38000001', '38000002'],
    38000001: { uid: '38000001', title: 'Metformin in type 2 diabetes: a <i>systematic</i> review', fulljournalname: 'BMJ', pubdate: '2024 Jan', sortpubdate: '2024/01/15 00:00', authors: [{ name: 'Smith J' }], pubtype: ['Review'] },
    38000002: { uid: '38000002', title: 'Second paper', fulljournalname: 'Lancet', pubdate: '2023', sortpubdate: '2023/03/01 00:00', authors: [], pubtype: [] } } }),
  '/arxiv': () => `<?xml version="1.0"?><feed><entry><id>http://arxiv.org/abs/2401.00001v1</id><published>2024-01-02T00:00:00Z</published><title>Attention &amp; transformers
      revisited</title><summary>We revisit attention.</summary><author><name>D. Researcher</name></author></entry></feed>`,
  '/openlibrary': () => ({ docs: [{ key: '/works/OL1W', title: 'Fundamentals of Physics', author_name: ['David Halliday', 'Robert Resnick'], first_publish_year: 1960, publisher: ['Wiley'] }] }),
  '/books': () => ({ items: [{ volumeInfo: { title: 'Guyton and Hall Textbook of Medical Physiology', authors: ['John E. Hall'], publishedDate: '2020', publisher: 'Elsevier', description: '<b>Classic</b> text.', infoLink: 'http://books.google.com/books?id=x' } }] })
};
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  hits.push({ path, url: req.url, ua: req.headers['user-agent'] });
  const mode = behaviour[path];
  if (mode === 'stall') return; // headers never come
  if (mode === 'error') { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"message":"down"}'); return; }
  if (mode === 'garbage') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('<html>not json'); return; }
  const body = RESPONSES[path] ? RESPONSES[path]() : {};
  res.writeHead(200, { 'content-type': typeof body === 'string' ? 'application/atom+xml' : 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const endpoints = { openAlex: `${base}/openalex`, semanticScholar: `${base}/s2`, pubmedSearch: `${base}/esearch`, pubmedSummary: `${base}/esummary`, arxiv: `${base}/arxiv`, openLibrary: `${base}/openlibrary`, googleBooks: `${base}/books` };
  const make = () => createScholarlyProviders({ endpoints, health: createProviderHealth({ log: () => {} }) });

  console.log('\nWhich questions reach which catalogues:');
  await test('research reaches papers; medicine reaches PubMed first; a book reaches the libraries; the rest reach none', () => {
    const s = make();
    const names = (mode, q) => s.catalogsFor(mode, q).map(([n]) => n).join(',');
    assert.strictEqual(names('academic', 'transformer attention study'), 'openalex,semantic-scholar,arxiv,pubmed');
    assert.strictEqual(names('medical', 'metformin side effects'), 'pubmed,openalex,semantic-scholar');
    assert.strictEqual(names('general', 'best physics textbook for beginners'), 'openlibrary,google-books');
    assert.strictEqual(names('general', 'اقترح كتاب عن الفيزياء'), 'openlibrary,google-books');
    assert.strictEqual(names('news', 'latest news today'), '');
    assert.strictEqual(names('general', 'مين هداف ريال مدريد'), '');
  });

  console.log('\nWhat each catalogue\'s answer becomes:');
  await test('OpenAlex: the DOI, the journal, the year, the authors, the abstract put back in order', async () => {
    const [r] = await make().openAlex('diabetes prevalence');
    assert.strictEqual(r.url, 'https://doi.org/10.1016/S0140-6736(24)02317-1');
    assert.ok(/The Lancet · 2024 · A\. Author, B\. Author · cited by 412\. Diabetes prevalence doubled since 1990\./.test(r.content), r.content);
    assert.strictEqual(r.publishedDate, '2024-11-13');
  });
  await test('Semantic Scholar: a DOI link when there is one', async () => {
    const [r] = await make().semanticScholar('metformin');
    assert.strictEqual(r.url, 'https://doi.org/10.1056/NEJMoa2300000');
    assert.ok(/NEJM · 2023 · C\. Doe · cited by 88\. A randomised trial/.test(r.content), r.content);
  });
  await test('PubMed: two calls, a PubMed link each, markup out of the title', async () => {
    const before = hits.length;
    const rs = await make().pubmed('metformin');
    assert.deepStrictEqual(hits.slice(before).map((h) => h.path), ['/esearch', '/esummary']);
    assert.ok(/id=38000001%2C38000002/.test(hits[hits.length - 1].url), hits[hits.length - 1].url);
    assert.strictEqual(rs[0].url, 'https://pubmed.ncbi.nlm.nih.gov/38000001/');
    assert.strictEqual(rs[0].title, 'Metformin in type 2 diabetes: a systematic review');
    assert.strictEqual(rs[0].publishedDate, '2024-01-15');
    assert.ok(/BMJ · 2024 Jan · Smith J · Review/.test(rs[0].content), rs[0].content);
  });
  await test('arXiv: the abstract page over https, entities decoded, whitespace folded', async () => {
    const [r] = await make().arxiv('attention');
    assert.strictEqual(r.url, 'https://arxiv.org/abs/2401.00001v1');
    assert.strictEqual(r.title, 'Attention & transformers revisited');
    assert.ok(/arXiv preprint · 2024 · D\. Researcher\. We revisit attention\./.test(r.content), r.content);
  });
  await test('books: Open Library and Google Books, over https, description as text', async () => {
    const [ol] = await make().openLibrary('physics');
    const [gb] = await make().googleBooks('physiology');
    assert.strictEqual(ol.url, 'https://openlibrary.org/works/OL1W');
    assert.ok(/Book · David Halliday, Robert Resnick · 1960 · Wiley/.test(ol.content), ol.content);
    assert.strictEqual(gb.url, 'https://books.google.com/books?id=x');
    assert.ok(/Book · John E\. Hall · 2020 · Elsevier\. Classic text\./.test(gb.content) && !/<b>/.test(gb.content), gb.content);
  });
  await test('an abstract with no words is empty, not "undefined"', () => {
    assert.strictEqual(abstractFrom(null), '');
    assert.strictEqual(abstractFrom({ b: [1], a: [0] }), 'a b');
  });
  await test('every catalogue is asked as this app, not as a browser pretending', () => {
    assert.ok(hits.length && hits.every((h) => /^QjoAI\//.test(h.ua)), [...new Set(hits.map((h) => h.ua))].join(' | '));
  });

  console.log('\nA catalogue failing costs only its own results:');
  await test('one down, one stalled, one sending garbage: the others still answer, in time, and each failure is named', async () => {
    behaviour = { '/openalex': 'error', '/s2': 'stall', '/arxiv': 'garbage' };
    const started = Date.now();
    const { results, attempts } = await make().search('attention study', { mode: 'academic', deadlineMs: Date.now() + 3000 });
    behaviour = {};
    assert.ok(Date.now() - started < 3500, `took ${Date.now() - started}ms`);
    assert.ok(results.some((r) => r.provider === 'pubmed'), 'PubMed\'s results were lost with the others');
    const failed = attempts.filter((a) => a.ok === false).map((a) => a.provider).sort();
    assert.deepStrictEqual(failed, ['openalex', 'semantic-scholar'], JSON.stringify(attempts));
    assert.ok(attempts.find((a) => a.provider === 'arxiv' && a.ok && a.count === 0), 'garbage from arXiv is no results, not a crash');
  });

  console.log('\nThrough the search service, to the model:');
  await test('a medical question: web results and papers side by side, papers labelled academic or medical', async () => {
    const svc = createSearchService({
      stableCacheKey: (...p) => p.join('|'), cacheGet: () => null, cacheSet: (_c, _k, v) => v, memoryCaches: { search: new Map(), deepSearch: new Map() },
      tavilyApiKey: 'tv', searchEndpoints: { tavily: `${base}/tavily` }, scholarlyEndpoints: endpoints,
      fetchImpl: (url, init) => (String(url).startsWith(`${base}/tavily`)
        ? Promise.resolve(new Response(JSON.stringify({ results: [{ title: 'Metformin side effects', url: 'https://www.healthline.com/metformin', content: 'metformin side effects include nausea', score: 0.8 }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
        : fetch(url, init))
    });
    const payload = await svc.performSearch({ rawQuery: 'metformin side effects', originalQuestion: 'metformin side effects', queryFromModel: true });
    const urls = payload.results.map((r) => r.url);
    assert.ok(urls.includes('https://www.healthline.com/metformin'), 'the web result was lost');
    assert.ok(urls.includes('https://pubmed.ncbi.nlm.nih.gov/38000001/'), `no paper reached the results: ${urls.join(' ')}`);
    const told = formatSearchResultsForTool(payload);
    assert.ok(/pubmed\.ncbi\.nlm\.nih\.gov\/38000001[^\n]*medical authority/.test(told), told.slice(0, 600));
  });
  await test('control: a question about football reaches no catalogue', async () => {
    const before = hits.length;
    const svc = createSearchService({
      stableCacheKey: (...p) => p.join('|'), cacheGet: () => null, cacheSet: (_c, _k, v) => v, memoryCaches: { search: new Map(), deepSearch: new Map() },
      tavilyApiKey: 'tv', searchEndpoints: { tavily: `${base}/tavily` }, scholarlyEndpoints: endpoints,
      fetchImpl: (url, init) => (String(url).startsWith(`${base}/tavily`)
        ? Promise.resolve(new Response(JSON.stringify({ results: [{ title: 'Real Madrid top scorers', url: 'https://www.espn.com/x', content: 'Mbappe leads Real Madrid top scorers', score: 0.8 }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
        : fetch(url, init))
    });
    await svc.performSearch({ rawQuery: 'Real Madrid top scorer', originalQuestion: 'Real Madrid top scorer', queryFromModel: true });
    assert.strictEqual(hits.length, before, hits.slice(before).map((h) => h.path).join(','));
  });

  server.close();
  console.log(`\n========================================\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// Papers, trials and books, from the catalogues that hold them, without keys.
//
// A research or medical question was searched on the general web, where the
// study itself is a PDF three links deep and the first page of results is
// news about it, blogs about the news, and a forum. OpenAlex, Semantic
// Scholar, PubMed and arXiv index the papers; Open Library and Google Books
// the books. All six answer a server without a key. They run beside the web
// search for academic and medical questions and for books, never instead of
// it, and each result says what it is: journal, year, authors, citations.
'use strict';

const { request, stripHtml, decodeEntities } = require('./providers');

const DEFAULT_ENDPOINTS = {
  openAlex: 'https://api.openalex.org/works',
  semanticScholar: 'https://api.semanticscholar.org/graph/v1/paper/search',
  pubmedSearch: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
  pubmedSummary: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
  arxiv: 'https://export.arxiv.org/api/query',
  openLibrary: 'https://openlibrary.org/search.json',
  googleBooks: 'https://www.googleapis.com/books/v1/volumes'
};

const UA = { 'User-Agent': 'QjoAI/1.0 (+https://github.com/Qusaiamer12/qjo-ai)', Accept: 'application/json' };
const authorsOf = (names) => {
  const list = (names || []).filter(Boolean);
  return list.length > 3 ? `${list.slice(0, 3).join(', ')} et al.` : list.join(', ');
};
const describe = (parts) => parts.filter(Boolean).join(' · ');

// OpenAlex sends an abstract as word → positions; this puts it back in order.
function abstractFrom(inverted) {
  if (!inverted || typeof inverted !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(inverted)) for (const p of positions || []) words[p] = word;
  return words.filter(Boolean).join(' ');
}

/**
 * @param {object} options
 * @param {Partial<typeof DEFAULT_ENDPOINTS>} [options.endpoints] Overrides, for tests.
 * @param {typeof fetch} [options.fetchImpl]
 * @param {{ ok: Function, failed: Function, resting: Function }} options.health shared with the web providers
 */
function createScholarlyProviders({ endpoints = {}, fetchImpl = fetch, health }) {
  const url = { ...DEFAULT_ENDPOINTS, ...endpoints };

  async function openAlex(query, { maxResults = 5, timeoutMs = 5000 } = {}) {
    const params = new URLSearchParams({ search: query, 'per-page': String(maxResults), select: 'display_name,doi,publication_date,publication_year,primary_location,authorships,cited_by_count,abstract_inverted_index,id' });
    const res = await request(fetchImpl, 'openalex', `${url.openAlex}?${params}`, { headers: UA }, timeoutMs, 'json');
    return ((res.body && res.body.results) || []).map((w, i) => {
      const venue = w.primary_location && w.primary_location.source && w.primary_location.source.display_name;
      const link = w.doi || (w.primary_location && w.primary_location.landing_page_url) || w.id;
      return {
        title: stripHtml(w.display_name).slice(0, 220),
        url: String(link || ''),
        content: describe([venue, w.publication_year, authorsOf((w.authorships || []).map((a) => a.author && a.author.display_name)), `cited by ${w.cited_by_count || 0}`])
          + (abstractFrom(w.abstract_inverted_index) ? `. ${abstractFrom(w.abstract_inverted_index).slice(0, 700)}` : ''),
        publishedDate: String(w.publication_date || w.publication_year || ''),
        score: Math.max(0.3, 0.7 - i * 0.05), query, provider: 'openalex'
      };
    }).filter((r) => r.title && /^https?:\/\//.test(r.url));
  }

  async function semanticScholar(query, { maxResults = 5, timeoutMs = 5000 } = {}) {
    const params = new URLSearchParams({ query, limit: String(maxResults), fields: 'title,url,abstract,year,venue,authors,citationCount,externalIds,publicationDate' });
    const res = await request(fetchImpl, 'semantic-scholar', `${url.semanticScholar}?${params}`, { headers: UA }, timeoutMs, 'json');
    return ((res.body && res.body.data) || []).map((p, i) => ({
      title: String(p.title || '').slice(0, 220),
      url: p.externalIds && p.externalIds.DOI ? `https://doi.org/${p.externalIds.DOI}` : String(p.url || ''),
      content: describe([p.venue, p.year, authorsOf((p.authors || []).map((a) => a.name)), `cited by ${p.citationCount || 0}`]) + (p.abstract ? `. ${String(p.abstract).slice(0, 700)}` : ''),
      publishedDate: String(p.publicationDate || p.year || ''),
      score: Math.max(0.3, 0.68 - i * 0.05), query, provider: 'semantic-scholar'
    })).filter((r) => r.title && /^https?:\/\//.test(r.url));
  }

  // Two calls: the search gives IDs, the summary gives what they are.
  async function pubmed(query, { maxResults = 5, timeoutMs = 5000 } = {}) {
    const started = Date.now();
    const found = await request(fetchImpl, 'pubmed', `${url.pubmedSearch}?${new URLSearchParams({ db: 'pubmed', term: query, retmode: 'json', retmax: String(maxResults), sort: 'relevance' })}`, { headers: UA }, timeoutMs, 'json');
    const ids = ((found.body && found.body.esearchresult && found.body.esearchresult.idlist) || []).slice(0, maxResults);
    if (!ids.length) return [];
    const res = await request(fetchImpl, 'pubmed', `${url.pubmedSummary}?${new URLSearchParams({ db: 'pubmed', id: ids.join(','), retmode: 'json' })}`, { headers: UA }, Math.max(500, timeoutMs - (Date.now() - started)), 'json');
    const byId = (res.body && res.body.result) || {};
    return ids.map((id, i) => byId[id]).filter(Boolean).map((p, i) => ({
      title: stripHtml(p.title).slice(0, 220),
      url: `https://pubmed.ncbi.nlm.nih.gov/${p.uid}/`,
      content: describe([p.fulljournalname || p.source, p.pubdate, authorsOf((p.authors || []).map((a) => a.name)), (p.pubtype || []).join(', ')]),
      publishedDate: String(p.sortpubdate || p.pubdate || '').slice(0, 10).replace(/\//g, '-'),
      score: Math.max(0.3, 0.7 - i * 0.05), query, provider: 'pubmed'
    })).filter((r) => r.title);
  }

  async function arxiv(query, { maxResults = 5, timeoutMs = 5000 } = {}) {
    const params = new URLSearchParams({ search_query: `all:${query}`, start: '0', max_results: String(maxResults) });
    const res = await request(fetchImpl, 'arxiv', `${url.arxiv}?${params}`, { headers: { ...UA, Accept: 'application/atom+xml' } }, timeoutMs, 'text');
    const entries = String(res.body || '').match(/<entry>[\s\S]*?<\/entry>/g) || [];
    const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : ''; };
    return entries.map((e, i) => ({
      title: tag(e, 'title').slice(0, 220),
      url: tag(e, 'id').replace(/^http:/, 'https:'),
      content: describe(['arXiv preprint', tag(e, 'published').slice(0, 4), authorsOf((e.match(/<name>([\s\S]*?)<\/name>/g) || []).map((n) => tag(n, 'name')))]) + `. ${tag(e, 'summary').slice(0, 700)}`,
      publishedDate: tag(e, 'published').slice(0, 10),
      score: Math.max(0.3, 0.62 - i * 0.05), query, provider: 'arxiv'
    })).filter((r) => r.title && /^https:\/\/arxiv\.org\//.test(r.url));
  }

  async function openLibrary(query, { maxResults = 5, timeoutMs = 5000 } = {}) {
    const params = new URLSearchParams({ q: query, limit: String(maxResults), fields: 'key,title,author_name,first_publish_year,publisher,subject' });
    const res = await request(fetchImpl, 'openlibrary', `${url.openLibrary}?${params}`, { headers: UA }, timeoutMs, 'json');
    return ((res.body && res.body.docs) || []).map((d, i) => ({
      title: String(d.title || '').slice(0, 220),
      url: `https://openlibrary.org${d.key}`,
      content: describe(['Book', authorsOf(d.author_name), d.first_publish_year, (d.publisher || [])[0], (d.subject || []).slice(0, 4).join(', ')]),
      publishedDate: String(d.first_publish_year || ''),
      score: Math.max(0.3, 0.6 - i * 0.05), query, provider: 'openlibrary'
    })).filter((r) => r.title && /^\/works\//.test(String(r.url).replace('https://openlibrary.org', '')));
  }

  async function googleBooks(query, { maxResults = 5, timeoutMs = 5000 } = {}) {
    const params = new URLSearchParams({ q: query, maxResults: String(maxResults), printType: 'books' });
    const res = await request(fetchImpl, 'google-books', `${url.googleBooks}?${params}`, { headers: UA }, timeoutMs, 'json');
    return ((res.body && res.body.items) || []).map((b, i) => {
      const v = b.volumeInfo || {};
      return {
        title: [v.title, v.subtitle].filter(Boolean).join(': ').slice(0, 220),
        url: String(v.infoLink || v.canonicalVolumeLink || '').replace(/^http:/, 'https:'),
        content: describe(['Book', authorsOf(v.authors), v.publishedDate, v.publisher]) + (v.description ? `. ${stripHtml(v.description).slice(0, 600)}` : ''),
        publishedDate: String(v.publishedDate || ''),
        score: Math.max(0.3, 0.58 - i * 0.05), query, provider: 'google-books'
      };
    }).filter((r) => r.title && /^https:\/\//.test(r.url));
  }

  const BOOKS = /\b(?:book|books|textbook|novel|author|edition|isbn)\b|(?<![؀-ۿ])(?:كتاب|كتب|الكتاب|رواية|مؤلف|مرجع|المرجع)(?![؀-ۿ])/i;

  /** Which catalogues a question calls for. */
  function catalogsFor(mode, question) {
    const list = [];
    if (mode === 'academic') list.push(['openalex', openAlex], ['semantic-scholar', semanticScholar], ['arxiv', arxiv], ['pubmed', pubmed]);
    if (mode === 'medical') list.push(['pubmed', pubmed], ['openalex', openAlex], ['semantic-scholar', semanticScholar]);
    if (BOOKS.test(question)) list.push(['openlibrary', openLibrary], ['google-books', googleBooks]);
    return list;
  }

  /**
   * The catalogues a question calls for, side by side, within the time left.
   * @returns {Promise<{results: object[], attempts: object[]}>}
   */
  async function search(query, { mode = 'general', question = '', maxResults = 4, deadlineMs = 0 } = {}) {
    const attempts = [];
    const catalogs = catalogsFor(mode, `${question} ${query}`);
    const budget = Math.min(5000, (deadlineMs ? deadlineMs - Date.now() : 6000) - 250);
    if (!catalogs.length || budget < 500) return { results: [], attempts };
    const settled = await Promise.all(catalogs.map(async ([name, fn]) => {
      if (health.resting(name)) { attempts.push({ provider: name, skipped: 'resting' }); return []; }
      try {
        const results = await fn(query, { maxResults, timeoutMs: budget });
        health.ok(name);
        attempts.push({ provider: name, ok: true, count: results.length });
        return results;
      } catch (error) {
        health.failed(name, error);
        attempts.push({ provider: name, ok: false, status: error && error.status || 0, error: String(error && error.message || error).slice(0, 160) });
        return [];
      }
    }));
    return { results: settled.flat(), attempts };
  }

  return { search, catalogsFor, openAlex, semanticScholar, pubmed, arxiv, openLibrary, googleBooks };
}

module.exports = { createScholarlyProviders, abstractFrom, DEFAULT_ENDPOINTS };

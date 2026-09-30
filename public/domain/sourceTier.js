/**
 * How much a source can be leaned on, by who publishes it.
 *
 * Two separate guesses used to answer this: scoreSource() ranked results and
 * sourceKind() labelled them, and they disagreed. Neither knew a ministry in
 * Amman (moh.gov.jo was "web" because only a bare ".gov" counted), neither had
 * a medical tier (WHO, NIH, Mayo Clinic were "web" or "government" by
 * accident), any ".org" got an official's bonus, and any domain containing
 * "help" was labelled official documentation. One classifier now feeds the
 * ranking, what the model is told about each result, and the source strip.
 *
 * The server and the page both load this file. Pure: a URL in, a tier out.
 */
(function () {
'use strict';

/**
 * @typedef {'official'|'academic'|'medical'|'news'|'reference'|'docs'|'code'|'community'|'web'} Tier
 */

// Checked in this order: a medical journal is medical before it is academic,
// and who.int is medical before it is an international organisation.
/** @type {Array<[Tier, string[]]>} */
const HOSTS = [
  ['medical', ['who.int', 'cdc.gov', 'nih.gov', 'ncbi.nlm.nih.gov', 'pubmed.ncbi.nlm.nih.gov', 'medlineplus.gov', 'fda.gov', 'nhs.uk', 'nice.org.uk',
    'ema.europa.eu', 'ecdc.europa.eu', 'mayoclinic.org', 'clevelandclinic.org', 'hopkinsmedicine.org', 'msdmanuals.com', 'merckmanuals.com', 'medscape.com',
    'uptodate.com', 'cochrane.org', 'cochranelibrary.com', 'nejm.org', 'thelancet.com', 'bmj.com', 'jamanetwork.com', 'moh.gov.jo', 'moh.gov.sa', 'mohap.gov.ae',
    'heart.org', 'cancer.org', 'cancer.gov', 'diabetes.org', 'aafp.org', 'drugs.com', 'rxlist.com', 'dailymed.nlm.nih.gov']],
  ['academic', ['arxiv.org', 'doi.org', 'nature.com', 'science.org', 'sciencedirect.com', 'springer.com', 'link.springer.com', 'wiley.com',
    'onlinelibrary.wiley.com', 'ieee.org', 'ieeexplore.ieee.org', 'acm.org', 'dl.acm.org', 'jstor.org', 'semanticscholar.org', 'openalex.org',
    'scholar.google.com', 'plos.org', 'journals.plos.org', 'frontiersin.org', 'mdpi.com', 'tandfonline.com', 'cambridge.org', 'academic.oup.com',
    'pnas.org', 'cell.com', 'biorxiv.org', 'medrxiv.org', 'ssrn.com', 'researchgate.net', 'openlibrary.org', 'books.google.com', 'acs.org', 'pubs.acs.org',
    'rsc.org', 'aps.org', 'iop.org', 'sagepub.com', 'emerald.com', 'hindawi.com', 'elifesciences.org', 'europepmc.org']],
  ['official', ['un.org', 'europa.eu', 'worldbank.org', 'imf.org', 'oecd.org', 'unesco.org', 'unicef.org', 'wto.org', 'ilo.org', 'iaea.org', 'unhcr.org',
    'petra.gov.jo', 'dos.gov.jo', 'cbj.gov.jo', 'jo.gov.jo']],
  ['news', ['reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'aljazeera.com', 'aljazeera.net', 'bloomberg.com', 'ft.com', 'nytimes.com', 'washingtonpost.com',
    'theguardian.com', 'economist.com', 'cnn.com', 'npr.org', 'france24.com', 'dw.com', 'skynewsarabia.com', 'alarabiya.net', 'aawsat.com', 'asharq.com',
    'jordantimes.com', 'alghad.com', 'alrai.com', 'ammonnews.net', 'royanews.tv', 'techcrunch.com', 'theverge.com', 'wired.com', 'arstechnica.com',
    'espn.com', 'kooora.com', 'goal.com', 'wsj.com', 'cnbc.com', 'forbes.com', 'axios.com', 'politico.com', 'afp.com']],
  ['reference', ['wikipedia.org', 'britannica.com', 'investopedia.com', 'merriam-webster.com', 'dictionary.cambridge.org', 'oxfordreference.com',
    'khanacademy.org', 'mathworld.wolfram.com', 'wolframalpha.com', 'libretexts.org', 'openstax.org', 'worldometers.info', 'statista.com', 'ourworldindata.org']],
  ['docs', ['developer.mozilla.org', 'learn.microsoft.com', 'docs.microsoft.com', 'cloud.google.com', 'firebase.google.com', 'developer.android.com',
    'developer.apple.com', 'nodejs.org', 'docs.python.org', 'react.dev', 'reactjs.org', 'vuejs.org', 'angular.dev', 'kubernetes.io', 'docker.com', 'docs.docker.com',
    'postgresql.org', 'mysql.com', 'php.net', 'go.dev', 'rust-lang.org', 'doc.rust-lang.org', 'typescriptlang.org', 'w3.org', 'whatwg.org', 'tc39.es']],
  ['code', ['github.com', 'gitlab.com', 'bitbucket.org', 'npmjs.com', 'pypi.org', 'crates.io', 'packagist.org', 'rubygems.org', 'nuget.org', 'pkg.go.dev']],
  ['community', ['reddit.com', 'quora.com', 'medium.com', 'stackoverflow.com', 'stackexchange.com', 'facebook.com', 'x.com', 'twitter.com', 'youtube.com',
    'tiktok.com', 'instagram.com', 'linkedin.com', 'pinterest.com', 'tumblr.com', 'substack.com', 'blogspot.com', 'wordpress.com', 'dev.to', 'hashnode.dev']]
];

// Government and university domains by their suffix, in any country:
// .gov, .gov.jo, .gouv.fr, .go.jp, .gob.mx, .mil; .edu, .edu.jo, .ac.uk.
const OFFICIAL_SUFFIX = /(^|\.)(gov|mil)(\.[a-z]{2})?$|(^|\.)(gouv|gob|go|govt)\.[a-z]{2}$|(^|\.)gv\.at$/;
const ACADEMIC_SUFFIX = /(^|\.)edu(\.[a-z]{2})?$|(^|\.)ac\.[a-z]{2}$|(^|\.)uni-[a-z-]+\.de$/;
// A documentation site by its own name: docs.x, developer(s).x, a vendor's
// help centre (support.google.com, help.github.com), x.readthedocs.io. As the
// first label only: "helpguide.org" is a health blog, not documentation.
const DOCS_HOST = /^(docs|developer|developers|devdocs|support|help)\./;

/** How far each tier is trusted, for ranking: 1 is the most. */
const TIER_WEIGHT = { official: 1, medical: 0.95, academic: 0.9, docs: 0.85, reference: 0.7, news: 0.65, code: 0.6, web: 0.4, community: 0.2 };

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (_) { return ''; }
}

const matches = (host, domain) => host === domain || host.endsWith('.' + domain);

/**
 * @param {string} url
 * @returns {Tier}
 */
function tierOf(url) {
  const host = hostOf(url);
  if (!host) return 'web';
  for (const [tier, domains] of HOSTS) {
    if (domains.some((d) => matches(host, d))) return tier;
  }
  if (OFFICIAL_SUFFIX.test(host)) return 'official';
  if (ACADEMIC_SUFFIX.test(host)) return 'academic';
  if (DOCS_HOST.test(host) || host.endsWith('.readthedocs.io')) return 'docs';
  return 'web';
}

// The name a reader knows a site by, for the citation chips.
const SITE_NAMES = {
  'pubmed.ncbi.nlm.nih.gov': 'PubMed', 'ncbi.nlm.nih.gov': 'NCBI', 'who.int': 'WHO', 'cdc.gov': 'CDC', 'nih.gov': 'NIH', 'nhs.uk': 'NHS',
  'mayoclinic.org': 'Mayo Clinic', 'wikipedia.org': 'Wikipedia', 'arxiv.org': 'arXiv', 'nature.com': 'Nature', 'sciencedirect.com': 'ScienceDirect',
  'bbc.com': 'BBC', 'bbc.co.uk': 'BBC', 'reuters.com': 'Reuters', 'apnews.com': 'AP', 'aljazeera.net': 'Al Jazeera', 'aljazeera.com': 'Al Jazeera',
  'github.com': 'GitHub', 'stackoverflow.com': 'Stack Overflow', 'developer.mozilla.org': 'MDN', 'youtube.com': 'YouTube', 'britannica.com': 'Britannica',
  'semanticscholar.org': 'Semantic Scholar', 'openalex.org': 'OpenAlex', 'openlibrary.org': 'Open Library', 'books.google.com': 'Google Books',
  'petra.gov.jo': 'Petra', 'moh.gov.jo': 'MoH Jordan', 'jordantimes.com': 'Jordan Times', 'thelancet.com': 'The Lancet', 'nejm.org': 'NEJM', 'bmj.com': 'BMJ'
};

/** A short name for a site: "PubMed", "WHO", else its domain's main label ("BBC", "Healthline"). */
function siteName(url) {
  const host = hostOf(url);
  if (!host) return '';
  const known = Object.keys(SITE_NAMES).find((d) => matches(host, d));
  if (known) return SITE_NAMES[known];
  const labels = host.split('.');
  const main = labels.length > 2 && /^(co|com|org|gov|edu|ac|net)$/.test(labels[labels.length - 2]) ? labels[labels.length - 3] : labels[labels.length - 2] || labels[0];
  return main.length <= 3 ? main.toUpperCase() : main.charAt(0).toUpperCase() + main.slice(1);
}

const api = { tierOf, siteName, hostOf, TIER_WEIGHT };
if (typeof window !== 'undefined') {
  const host = /** @type {any} */ (window);
  host.QjoDomain = host.QjoDomain || {};
  host.QjoDomain.sourceTier = api;
}
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

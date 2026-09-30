// MathJax's settings, read when MathJax loads — so this file loads first.
//
// They used to be set at the top of app.js, which runs after MathJax: MathJax
// had already started with its defaults and never saw them. "$x^2$" reached
// the page as dollar signs. The renderer (public/domain/markdown.js) now turns
// "$…$" into "\\(…\\)" by Pandoc's rule, so MathJax itself never treats a
// dollar as math and "$5 and $10" stay prices.
window.MathJax = {
  loader: { load: ['[tex]/mhchem'] },
  tex: {
    inlineMath: [['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    packages: { '[+]': ['mhchem'] }
  },
  options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] }
};

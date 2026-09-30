// Puppeteer keeps its browser inside the project. Render keeps only the
// project folder from the build to the running server: in the default
// ~/.cache the browser downloaded at build time was gone at runtime, and every
// PDF fell back to the plain renderer. /api/status → pdf shows which ran.
const { join } = require('path');

module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer')
};

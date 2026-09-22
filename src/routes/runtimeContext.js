// What the model is told about "now" and "where", and which language the
// person is writing in.
'use strict';

const { languageOfText } = require('../../public/domain/language');

/** An IANA time zone the runtime accepts, or null. */
function validTimeZone(value) {
  const zone = typeof value === 'string' ? value.trim().slice(0, 64) : '';
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return zone;
  } catch (_) {
    return null;
  }
}

function placeOf(geo) {
  if (!geo) return '';
  return `${geo.city || ''}, ${geo.country || ''}`.replace(/^,\s*|,\s*$/g, '');
}

/**
 * The runtime line, in English, the processing language.
 *
 * The first request from an address has no geo yet (the lookup runs in the
 * background), and it used to be told it came from Amman. The page's own time
 * zone is the better fallback, and an unknown place is said to be unknown
 * rather than guessed.
 *
 * @param {{geo?: {timezone?: string, city?: string, country?: string} | null, cachedGeo?: {city?: string, country?: string} | null, clientTimeZone?: string, now?: Date}} input
 */
function describeRuntime({ geo, cachedGeo, clientTimeZone, now = new Date() }) {
  const timeZone = (geo && geo.timezone) || validTimeZone(clientTimeZone) || 'UTC';
  const locationText = placeOf(geo) || placeOf(cachedGeo) || 'unknown';
  const localTimeString = now.toLocaleString('en-GB', { timeZone, dateStyle: 'full', timeStyle: 'short' });
  const runtimeLine = `${localTimeString} (approximate location: ${locationText}; time zone: ${timeZone})`;
  return { timeZone, locationText, localTimeString, runtimeLine };
}

// The same judgement the page makes (public/domain/language.js), so a message
// is never Arabic on one side and English on the other. English when unclear.
function lastUserLanguage(messages) {
  const last = [...(messages || [])].reverse().find(m => m?.role === 'user');
  return languageOfText(typeof last?.content === 'string' ? last.content : '') || 'en';
}

module.exports = { describeRuntime, validTimeZone, lastUserLanguage };

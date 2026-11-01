// A CV answer read into its parts: who, what they do, how to reach them, and
// the sections the CV playbook writes (Summary, Experience, Education, Skills,
// Languages) plus any others. The templates lay the parts out; they never
// guess at the text.
//
// The shape is the playbook's (src/services/playbooks.js):
//   # Name / **Job title** / contact line / ## Section ... / ### Entry ...
// and the headings are recognised by public/domain/fileRequest.js, the same
// reading the download menu uses to offer CV templates. An answer that is not
// quite that shape still comes out as a document: what has no home is kept in
// a section of its own, never dropped.
'use strict';

const { cvSection } = require('../../../../public/domain/fileRequest');

const IMAGE_LINE = /^!\[[^\]\n]*\]\([^)\s]+\)\s*$/;
const LOOKS_LIKE_CONTACT = /@|https?:\/\/|www\.|\+?\d[\d\s().-]{6,}|linkedin\.|github\./i;
// Between two contact details: a dot, a bar, a bullet, a spaced dash, a new line.
const CONTACT_SEPARATOR = /\s*[·•●|]\s*|\s+[—–]\s+|\n/;

/**
 * @typedef {{text: string, kind: 'email'|'phone'|'link'|'place', href?: string}} ContactItem
 * @typedef {{key: string, title: string, markdown: string}} CvSection
 * @typedef {{name: string, jobTitle: string, contact: ContactItem[], photo: string|null, sections: CvSection[]}} Cv
 */

/** Markdown marks taken off a one-line text. */
function plain(text) {
  return String(text || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '').replace(/\s+/g, ' ').trim();
}

/** @returns {ContactItem[]} */
function contactItems(lines) {
  const items = [];
  for (const line of lines) {
    const bare = line.replace(/^\s*[-*+]\s+/, '');
    for (const piece of bare.split(CONTACT_SEPARATOR)) {
      const link = /\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/.exec(piece);
      const text = plain(piece);
      if (!text) continue;
      if (/@/.test(text) && !/\s/.test(text.replace(/^.*?:\s*/, ''))) {
        items.push({ text, kind: 'email', href: `mailto:${text.replace(/^.*?:\s*/, '')}` });
      } else if (/^(?:https?:\/\/|www\.)|linkedin\.|github\./i.test(text) || link) {
        const url = link ? link[2] : /^https?:/i.test(text) ? text : `https://${text.replace(/^.*?:\s*/, '')}`;
        items.push({ text, kind: 'link', href: /^(?:https?:|mailto:)/i.test(url) ? url : undefined });
      } else if (/\d[\d\s().-]{5,}\d/.test(text)) {
        items.push({ text, kind: 'phone' });
      } else {
        items.push({ text, kind: 'place' });
      }
    }
  }
  return items;
}

/**
 * @param {string} content the answer's Markdown
 * @param {string} fallbackName the document's title, when the answer has no "# Name"
 * @returns {Cv}
 */
function readCv(content, fallbackName) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  let name = '';
  let photo = null;
  const header = [];
  /** @type {CvSection[]} */
  const sections = [];
  let current = null;
  let fenced = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const h2 = !fenced && /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (h2) {
      current = { key: cvSection(h2[1]) || 'other', title: plain(h2[1]), markdown: '' };
      sections.push(current);
      continue;
    }
    if (current) { current.markdown += `${line}\n`; continue; }
    const h1 = !fenced && /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (h1 && !name) { name = plain(h1[1]); continue; }
    if (IMAGE_LINE.test(line.trim()) && !photo) { photo = line.trim(); continue; }
    if (line.trim()) header.push(line.trim());
  }
  let jobTitle = '';
  if (header.length && !LOOKS_LIKE_CONTACT.test(header[0]) && plain(header[0]).length <= 90) jobTitle = plain(header.shift());
  // An answer with no "##" at all is one section, so nothing it says is lost.
  if (!sections.length && header.length) {
    sections.push({ key: 'other', title: '', markdown: `${header.splice(0).join('\n\n')}\n` });
  }
  return {
    name: name || plain(fallbackName) || 'CV',
    jobTitle,
    contact: contactItems(header),
    photo,
    sections: sections.map((s) => ({ ...s, markdown: s.markdown.trim() })).filter((s) => s.markdown || s.title)
  };
}

module.exports = { readCv, contactItems, plain };

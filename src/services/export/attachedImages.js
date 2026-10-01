// The person's own images, placed where an answer refers to them.
//
// "Put my photo in my CV and make it a PDF" could not work: a model cannot
// type an image, and an export carried only the answer's text. An answer now
// refers to an attachment by id — ![me](attachment:k7f2q9) — and the page
// sends the images it holds with the export. Here they are checked and put in
// place as data, which the PDF's HTML, Word and the plain PDF renderer draw.
//
// Only images, only as base64 data, a few of them and of a bounded size: the
// id and the data come from the page, so they are checked like any input.
'use strict';

const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;
const REFERENCE = /!\[([^\]\n]{0,200})\]\(attachment:([a-z0-9]{4,16})\)/gi;
const ID = /^[a-z0-9]{4,16}$/i;
const MAX_IMAGES = 5;
const MAX_CHARS = 6_000_000; // about 4.5 MB of image

/**
 * The images a request carried, keyed by id; anything else dropped.
 * @param {unknown} raw
 * @returns {Map<string, string>}
 */
function acceptImages(raw) {
  const out = new Map();
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, url] of Object.entries(raw)) {
    if (out.size >= MAX_IMAGES) break;
    if (ID.test(id) && typeof url === 'string' && url.length <= MAX_CHARS && IMAGE_DATA_URL.test(url)) out.set(id.toLowerCase(), url);
  }
  return out;
}

/**
 * The answer with each reference to an attached image replaced by the image
 * itself; one the page did not send is left as its description.
 * @param {string} content
 * @param {Map<string, string>} images
 */
function placeImages(content, images) {
  return String(content || '').replace(REFERENCE, (_, alt, id) => {
    const url = images.get(String(id).toLowerCase());
    return url ? `![${alt}](${url})` : alt;
  });
}

/**
 * An image's bytes, type and size in pixels, from a data URL; null when it is
 * not a PNG or JPEG whose size can be read (what Word and PDFKit both draw).
 * @param {string} url
 * @returns {{ data: Buffer, type: 'png' | 'jpg', width: number, height: number } | null}
 */
function decodeImage(url) {
  const m = IMAGE_DATA_URL.exec(String(url || ''));
  if (!m) return null;
  const data = Buffer.from(m[2], 'base64');
  const size = pngSize(data) || jpegSize(data);
  return size ? { data, ...size } : null;
}

/** @param {Buffer} b @returns {{type: 'png', width: number, height: number} | null} */
function pngSize(b) {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { type: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

// A JPEG's size is in its start-of-frame segment, after any number of others.
/** @param {Buffer} b @returns {{type: 'jpg', width: number, height: number} | null} */
function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const length = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { type: 'jpg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

module.exports = { acceptImages, placeImages, decodeImage, IMAGE_DATA_URL, REFERENCE };

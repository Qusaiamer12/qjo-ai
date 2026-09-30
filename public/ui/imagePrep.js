/**
 * Turns an attached image into what is sent: drawn at the size and in the
 * format public/domain/imagePlan.js chooses, and measured, so an image that
 * would be refused for its size is made smaller before it leaves the page.
 */
(function (global) {
  'use strict';

  /**
   * @param {object} [deps]
   * @param {Document} [deps.document]
   */
  function createImagePrep(deps = {}) {
    const doc = deps.document || global.document;
    const plan = () => global.QjoDomain.imagePlan;

    function load(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
        img.src = url;
      });
    }

    function draw(img, { width, height, format, quality }) {
      const canvas = doc.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      // JPEG has no transparency: a transparent diagram would turn black.
      if (format === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL(format, quality);
    }

    /**
     * The image as a data URL no longer than `cap` characters: the first
     * encoding that fits, or the smallest one tried.
     * @param {File | Blob} file
     * @param {number} cap
     * @returns {Promise<{dataUrl: string, width: number, height: number, format: string}>}
     */
    async function prepare(file, cap) {
      const img = await load(file);
      let best = null;
      for (const step of plan().encodings({ width: img.naturalWidth, height: img.naturalHeight, type: file.type })) {
        const dataUrl = draw(img, step);
        best = { dataUrl, width: step.width, height: step.height, format: step.format };
        if (dataUrl.length <= cap) break;
      }
      return best;
    }

    /**
     * A message's images together within what one request may carry: any
     * that would take it over are drawn again, smaller, from their files.
     * @param {Array<{type: string, file?: File, dataUrl?: string}>} attachments the message's attachments
     */
    async function fitMessage(attachments) {
      const items = attachments.filter((a) => a.type.startsWith('image/') && a.dataUrl).slice(0, plan().LIMITS.maxImages);
      const total = items.reduce((n, item) => n + String(item.dataUrl || '').length, 0);
      if (total <= plan().LIMITS.maxMessageChars) return;
      const cap = plan().capPerImage(items.length);
      for (const item of items) {
        if (item.file && String(item.dataUrl || '').length > cap) item.dataUrl = (await prepare(item.file, cap)).dataUrl;
      }
    }

    return { prepare, fitMessage };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createImagePrep = createImagePrep;
})(typeof window !== 'undefined' ? window : globalThis);

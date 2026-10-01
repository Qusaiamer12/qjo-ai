/**
 * Files into the composer the way people expect to put them there: pasted
 * (a screenshot, Ctrl+V) or dropped anywhere on the page.
 *
 * The paperclip was the only way in. A pasted screenshot did nothing, and a
 * file dropped on the page was opened by the browser in its place — the
 * conversation gone from the tab.
 *
 * A paste that carries text stays a paste of text: cells copied from Excel
 * arrive as text and as a picture of the cells, and the text is what was
 * meant. Only a file name beside the files (what copying a file gives) does
 * not count as text.
 */
(function (global) {
  'use strict';

  /**
   * @param {{input: HTMLElement, addFiles: (files: File[]) => void, label: () => string}} deps
   */
  function createComposerDrop({ input, addFiles, label }) {
    const hasFiles = (transfer) => Boolean(transfer) && [...(transfer.types || [])].includes('Files');

    function onPaste(event) {
      const transfer = event.clipboardData;
      const files = transfer ? [...transfer.files] : [];
      if (!files.length) return;
      const text = (transfer.getData('text/plain') || '').trim();
      if (text && !files.some((file) => file.name === text)) return;
      event.preventDefault();
      addFiles(files);
    }

    const veil = document.createElement('div');
    veil.className = 'qjo-drop-veil';
    veil.hidden = true;
    veil.setAttribute('aria-hidden', 'true');
    const veilText = document.createElement('div');
    veilText.className = 'qjo-drop-veil-text';
    veil.append(veilText);
    document.body.append(veil);

    // dragenter and dragleave fire for every element crossed; the veil
    // stays up until the drag has left the window.
    let depth = 0;
    const show = (on) => {
      veilText.textContent = label();
      veil.hidden = !on;
    };
    window.addEventListener('dragenter', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      depth += 1;
      show(true);
    });
    window.addEventListener('dragleave', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) show(false);
    });
    // Without this the browser opens the file in place of the page.
    window.addEventListener('dragover', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('drop', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth = 0;
      show(false);
      const files = [...event.dataTransfer.files];
      if (files.length) addFiles(files);
    });
    input.addEventListener('paste', onPaste);
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createComposerDrop = createComposerDrop;
})(window);

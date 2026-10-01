/**
 * What Qjo can do, offered before anything is asked: groups of starters that
 * each lead to a real feature — a Word file or a PDF with your own photo in
 * it, a picture of an exercise solved, a quiz, research with its sources,
 * code with a live preview, charts, writing, planning.
 *
 * The starters were eight developer groups (UI components, themes, landing
 * pages…) written into app.js, and on a phone they were behind the tools
 * button: someone opening Qjo on a phone saw a headline and nothing to try.
 * A phone now shows the groups on the welcome screen. The words live in
 * i18n.js, one line per starter; a starter that needs a file of yours starts
 * with 📎, and choosing it opens the file picker once it is in the composer.
 */
(function (global) {
  'use strict';

  const GROUPS = ['files', 'study', 'research', 'code', 'images', 'charts', 'write', 'plan'];
  const NEEDS_FILE = /^📎\s*/u;
  // "files" -> "catFiles", "startersFiles" in i18n.js.
  const key = (prefix, group) => prefix + group[0].toUpperCase() + group.slice(1);

  /**
   * @param {{t: (key: string) => string, input: HTMLTextAreaElement, pickFile: () => void}} deps
   */
  function createStarters({ t, input, pickFile }) {
    const panel = document.getElementById('quickSuggestionsPanel');
    const list = document.getElementById('qsList');
    const header = document.getElementById('qsHeader');
    const strip = document.getElementById('welcomeStarters');
    const groupButtons = () => [...document.querySelectorAll('.quick-cat-btn')];
    let open = null;

    /** The starters of a group, in the page's language. */
    const startersOf = (group) => t(key('starters', group)).split('\n').map((line) => line.trim()).filter(Boolean);

    function close() {
      if (panel) panel.hidden = true;
      open = null;
      groupButtons().forEach((b) => b.classList.remove('active'));
      if (strip) strip.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    }

    function use(starter) {
      const needsFile = NEEDS_FILE.test(starter);
      input.value = starter.replace(NEEDS_FILE, '');
      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      close();
      if (needsFile) pickFile();
    }

    function show(group) {
      if (open === group && panel && !panel.hidden) return close();
      close();
      open = group;
      groupButtons().forEach((b) => b.classList.toggle('active', b.dataset.cat === group));
      if (strip) strip.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === group)));
      if (header) header.textContent = t(key('cat', group));
      if (!list || !panel) return;
      list.replaceChildren(...startersOf(group).map((starter, i) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'qs-item';
        button.dataset.needsFile = String(NEEDS_FILE.test(starter));
        button.textContent = starter;
        button.style.animation = `qjoRise .25s cubic-bezier(.2,.8,.2,1) ${i * 0.03}s both`;
        button.addEventListener('click', (event) => { event.stopPropagation(); use(starter); });
        item.append(button);
        return item;
      }));
      panel.hidden = false;
    }

    // The groups under the composer, and the same groups on a phone's
    // welcome screen, where the composer's row is hidden.
    groupButtons().forEach((button) => {
      button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); show(button.dataset.cat); });
    });
    if (strip) {
      strip.replaceChildren(...groupButtons().map((source) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'welcome-starter';
        chip.dataset.cat = source.dataset.cat;
        chip.setAttribute('aria-pressed', 'false');
        chip.innerHTML = source.innerHTML;
        chip.addEventListener('click', (event) => { event.stopPropagation(); show(chip.dataset.cat); });
        return chip;
      }));
    }
    document.addEventListener('click', (event) => {
      const target = /** @type {Element} */ (event.target);
      if (panel && !panel.hidden && !target.closest('#quickCommandCats, #quickSuggestionsPanel, #welcomeStarters')) close();
    });

    return { show, use, startersOf, GROUPS };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createStarters = createStarters;
})(window);

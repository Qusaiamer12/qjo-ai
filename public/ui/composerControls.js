/**
 * The composer's two controls: the answer mode and the tools.
 *
 * There were five pills beside the composer — Search, Deep Search, Task,
 * Flash, Max — and on a phone none of them: they lived in a sheet two taps
 * away. Now the mode is one button that switches Flash and Max with a tap,
 * showing the one in use, and the tools are one button that opens a short
 * menu: Search or Deep search (one at a time) and Task. The tools button
 * names what is on, so nobody has to open it to know. The same two buttons
 * sit above the composer on a phone.
 *
 * The state is the app's (qjoMode, qjoFunctions in app.js); this only shows
 * it and asks for changes. The app announces a change of mode on <body>
 * (data-qjo-mode) and of tools with "qjo:functions-changed".
 */
(function (global) {
  'use strict';

  const ICONS = {
    normal: '⚡',
    advanced: '◆',
    tools: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4Z"/></svg>',
    search: '🔍',
    deep: '🎯',
    task: '✅'
  };

  /**
   * @param {{
   *   container: HTMLElement,
   *   t: (key: string, vars?: Record<string, string>) => string,
   *   getMode: () => string, setMode: (mode: string) => void,
   *   getFunctions: () => {search?: boolean, deep?: boolean, task?: boolean},
   *   setFunction: (key: string, on: boolean) => void,
   *   toast?: (text: string) => void
   * }} deps
   */
  function createComposerControls({ container, t, getMode, setMode, getFunctions, setFunction, toast }) {
    const doc = container.ownerDocument;
    container.textContent = '';
    container.classList.add('qjo-controls');

    const modeWrap = doc.createElement('div');
    modeWrap.className = 'qjo-mode-wrap';
    modeWrap.style.position = 'relative';

    const mode = doc.createElement('button');
    mode.type = 'button';
    mode.className = 'qjo-mode-btn';
    mode.id = 'modeToggle';
    mode.setAttribute('aria-haspopup', 'menu');
    mode.setAttribute('aria-expanded', 'false');

    const modeMenu = doc.createElement('div');
    modeMenu.className = 'qjo-tools-menu qjo-mode-dropdown';
    modeMenu.id = 'modeMenu';
    modeMenu.setAttribute('role', 'menu');
    modeMenu.hidden = true;
    
    // Left-align the mode menu specifically (tools menu aligns to the end)
    modeMenu.style.insetInlineEnd = 'auto';
    modeMenu.style.insetInlineStart = '0';
    
    const modeItems = ['normal', 'advanced'].map((key) => {
      const item = doc.createElement('button');
      item.type = 'button';
      item.className = 'qjo-tools-item';
      item.dataset.mode = key;
      item.setAttribute('role', 'menuitemradio');
      modeMenu.appendChild(item);
      return item;
    });
    
    modeWrap.append(mode, modeMenu);

    const tools = doc.createElement('button');
    tools.type = 'button';
    tools.className = 'qjo-tools-btn';
    tools.id = 'toolsMenuBtn';
    tools.setAttribute('aria-haspopup', 'menu');
    tools.setAttribute('aria-expanded', 'false');

    const menu = doc.createElement('div');
    menu.className = 'qjo-tools-menu';
    menu.id = 'toolsMenu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    const items = ['search', 'deep', 'task'].map((key) => {
      const item = doc.createElement('button');
      item.type = 'button';
      item.className = 'qjo-tools-item';
      item.dataset.tool = key;
      item.setAttribute('role', 'menuitemcheckbox');
      menu.appendChild(item);
      return item;
    });

    const wrap = doc.createElement('div');
    wrap.className = 'qjo-tools-wrap';
    wrap.append(tools, menu);
    
    container.append(modeWrap, wrap);

    const isMax = () => getMode() === 'advanced';
    // Deep search is a search: the menu shows one of the two as on.
    const onState = () => {
      const f = getFunctions() || {};
      return { search: Boolean(f.search && !f.deep), deep: Boolean(f.deep), task: Boolean(f.task) };
    };

    function render() {
      const max = isMax();
      const current = t(max ? 'advanced' : 'normal');
      const next = t(max ? 'normal' : 'advanced');
      mode.textContent = '';
      const icon = doc.createElement('span');
      icon.className = 'qjo-mode-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = max ? ICONS.advanced : ICONS.normal;
      
      const name = doc.createElement('span');
      name.className = 'qjo-mode-text';
      name.textContent = current;
      
      const chevron = doc.createElement('span');
      chevron.className = 'qjo-mode-chevron';
      chevron.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
      
      mode.append(icon, name, chevron);
      mode.dataset.mode = max ? 'advanced' : 'normal';
      mode.setAttribute('aria-label', t('modeButtonLabel', { current, next }));
      mode.title = t(max ? 'maxModeTitle' : 'flashModeTitle');

      const on = onState();
      const search = on.deep ? 'deep' : on.search ? 'search' : '';
      tools.innerHTML = search ? `<span aria-hidden="true">${ICONS[search]}</span>` : ICONS.tools;
      const label = doc.createElement('span');
      label.textContent = search ? t(search === 'deep' ? 'deepSearchBtn' : 'searchBtn') : t('tools');
      tools.appendChild(label);
      if (on.task) {
        const badge = doc.createElement('span');
        badge.className = 'qjo-tools-badge';
        badge.textContent = t('taskBtn');
        tools.appendChild(badge);
      }
      tools.classList.toggle('is-on', Boolean(search || on.task));
      tools.setAttribute('aria-label', [t('tools'), search && label.textContent, on.task && t('taskBtn')].filter(Boolean).join(' · '));

      // Render mode menu items
      modeItems.forEach((item) => {
        const key = item.dataset.mode;
        const isSelected = (key === 'advanced' && max) || (key === 'normal' && !max);
        
        item.textContent = '';
        const glyph = doc.createElement('span');
        glyph.className = 'qjo-tools-icon';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = ICONS[key];
        
        const text = doc.createElement('span');
        text.className = 'qjo-tools-text';
        const strong = doc.createElement('strong');
        strong.textContent = t(key);
        const small = doc.createElement('small');
        small.textContent = t(key === 'advanced' ? 'maxModeTitle' : 'flashModeTitle');
        text.append(strong, small);
        
        const check = doc.createElement('span');
        check.className = 'qjo-tools-check';
        check.setAttribute('aria-hidden', 'true');
        check.style.borderRadius = '50%'; // Make it look like a radio button
        
        item.append(glyph, text, check);
        item.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      });

      // Render tools menu items
      items.forEach((item) => {
        const key = item.dataset.tool;
        const titles = { search: ['searchBtn', 'searchDesc'], deep: ['deepSearchBtn', 'deepSearchDesc'], task: ['taskBtn', 'taskModeDesc'] }[key];
        item.textContent = '';
        const glyph = doc.createElement('span');
        glyph.className = 'qjo-tools-icon';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = ICONS[key];
        const text = doc.createElement('span');
        text.className = 'qjo-tools-text';
        const strong = doc.createElement('strong');
        strong.textContent = t(titles[0]);
        const small = doc.createElement('small');
        small.textContent = t(titles[1]);
        text.append(strong, small);
        const check = doc.createElement('span');
        check.className = 'qjo-tools-check';
        check.setAttribute('aria-hidden', 'true');
        item.append(glyph, text, check);
        item.setAttribute('aria-checked', on[key] ? 'true' : 'false');
      });
    }

    function openToolsMenu() {
      closeModeMenu(false);
      menu.hidden = false;
      tools.setAttribute('aria-expanded', 'true');
      container.classList.add('menu-open');
      items[0].focus();
    }
    function closeToolsMenu(focusBack) {
      if (menu.hidden) return;
      menu.hidden = true;
      tools.setAttribute('aria-expanded', 'false');
      container.classList.remove('menu-open');
      if (focusBack) tools.focus();
    }
    
    function openModeMenu() {
      closeToolsMenu(false);
      modeMenu.hidden = false;
      mode.setAttribute('aria-expanded', 'true');
      container.classList.add('menu-open');
      modeItems[0].focus();
    }
    function closeModeMenu(focusBack) {
      if (modeMenu.hidden) return;
      modeMenu.hidden = true;
      mode.setAttribute('aria-expanded', 'false');
      container.classList.remove('menu-open');
      if (focusBack) mode.focus();
    }

    mode.addEventListener('click', () => (modeMenu.hidden ? openModeMenu() : closeModeMenu(false)));
    
    modeMenu.addEventListener('click', (event) => {
      const item = /** @type {HTMLElement} */ (event.target).closest('.qjo-tools-item');
      if (!item) return;
      const key = item.dataset.mode;
      if ((key === 'advanced' && !isMax()) || (key === 'normal' && isMax())) {
        setMode(key);
        render();
        if (toast) toast(t(key === 'advanced' ? 'maxModeTitle' : 'flashModeTitle'));
      }
      closeModeMenu(true);
    });

    modeMenu.addEventListener('keydown', (event) => {
      const at = modeItems.indexOf(/** @type {HTMLButtonElement} */ (doc.activeElement));
      if (event.key === 'Escape') { event.preventDefault(); closeModeMenu(true); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); modeItems[(at + 1) % modeItems.length].focus(); }
    });

    tools.addEventListener('click', () => (menu.hidden ? openToolsMenu() : closeToolsMenu(false)));

    menu.addEventListener('click', (event) => {
      const item = /** @type {HTMLElement} */ (event.target).closest('.qjo-tools-item');
      if (!item) return;
      const key = item.dataset.tool;
      const on = onState();
      if (key === 'search' && on.deep) setFunction('deep', false); // from deep to plain search
      else if (key === 'search') setFunction('search', !on.search);
      else if (key === 'deep') setFunction('deep', !on.deep);
      else setFunction('task', !on.task);
      render();
      closeToolsMenu(true);
    });

    menu.addEventListener('keydown', (event) => {
      const at = items.indexOf(/** @type {HTMLButtonElement} */ (doc.activeElement));
      if (event.key === 'Escape') { event.preventDefault(); closeToolsMenu(true); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      }
    });
    // By the event's path, not its target: choosing redraws the item clicked,
    // and its old content is no longer inside the menu by the time this runs.
    doc.addEventListener('click', (event) => { 
      const path = event.composedPath();
      if (!path.includes(wrap)) closeToolsMenu(false); 
      if (!path.includes(modeWrap)) closeModeMenu(false);
    });

    // The app's own changes: a mode set elsewhere, tools turned off by a send.
    new MutationObserver(render).observe(doc.body, { attributes: true, attributeFilter: ['data-qjo-mode'] });
    // The interface language changed: the page's <html lang> follows it.
    new MutationObserver(render).observe(doc.documentElement, { attributes: true, attributeFilter: ['lang'] });
    doc.addEventListener('qjo:functions-changed', render);
    render();

    return {
      render,
      /** Not while an answer is being written: the request already went with the old ones. */
      setBusy(busy) { mode.disabled = Boolean(busy); tools.disabled = Boolean(busy); if (busy) { closeToolsMenu(false); closeModeMenu(false); } }
    };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createComposerControls = createComposerControls;
})(window);

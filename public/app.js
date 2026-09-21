window.MathJax = window.MathJax || {
  tex: {
    inlineMath: [['\\(', '\\)'], ['$', '$']],
    displayMath: [['\\[', '\\]'], ['$$', '$$']],
    processEscapes: true
  },
  options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] }
};

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function openAdminDirect() {
      const modal = document.getElementById('settingsModal');
      if (modal) {
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        const input = document.getElementById('modelInput');
        if (input) input.value = 'openai/gpt-oss-120b';
      } else {
        alert('لم يتم العثور على نافذة الإعدادات. حدّث الصفحة وحاول مرة ثانية.');
      }
    }

    function closeAdminDirect() {
      const modal = document.getElementById('settingsModal');
      if (modal) {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
      }
    }

    // The full XML system prompt used to be inlined here (~35KB). It is no
    // longer sent — the server builds the prompt and strips any client copy —
    // and public/*.js ships with no-store, so every page load paid for it. The
    // canonical text is docs/QJO_SYSTEM_PROMPT_VNEXT_XML.md.

const QJO_FRONTEND_VERSION = 'qjo-premium-lively-v2-2026-09-02-1';
    console.info('Qjo frontend version:', QJO_FRONTEND_VERSION);

    const el = (id) => document.getElementById(id);

    // Tiny UX helpers — warm toast, sparkles, confetti dots
    function showMicroToast(text){
      const t=document.createElement('div');
      t.textContent=text;
      t.style.cssText='position:fixed;bottom:92px;left:50%;transform:translateX(-50%) translateY(12px);background:linear-gradient(135deg,#123B7A,#7B3FE4);color:#fff;padding:10px 18px;border-radius:999px;font-weight:600;font-size:13px;box-shadow:0 18px 40px rgba(123,63,228,.35);z-index:9999;opacity:0;transition:all .35s cubic-bezier(.3,1.4,.4,1);pointer-events:none;';
      document.body.appendChild(t);
      requestAnimationFrame(()=>{ t.style.opacity='1'; t.style.transform='translateX(-50%) translateY(0)'; });
      setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(10px)'; setTimeout(()=>t.remove(),400); }, 1700);
    }
    function sprinkleWelcomeConfetti(){
      const w = document.getElementById('welcome'); if(!w) return;
      const colors=['#38C7DD','#7B3FE4','#FFB86B','#FF7A94','#123B7A'];
      for(let i=0;i<10;i++){
        const d=document.createElement('span');
        d.className='welcome-confetti';
        d.style.background=colors[i%colors.length];
        d.style.top=(10+Math.random()*70)+'%';
        d.style.left=(Math.random()*94)+'%';
        d.style.animationDelay=(Math.random()*3)+'s';
        d.style.animationDuration=(3.5+Math.random()*2)+'s';
        d.style.transform=`rotate(${Math.random()*360}deg)`;
        w.appendChild(d);
      }
    }
    function installTypingSparkle(){
      const input = document.getElementById('input');
      if(!input) return;
      let t;
      input.addEventListener('input', () => {
        document.body.classList.add('typing-active');
        clearTimeout(t);
        t = setTimeout(()=>document.body.classList.remove('typing-active'), 900);
      });
    }
    // Suggestion click "pop" feedback
    function installSuggestionPop(){
      document.querySelectorAll('.suggestion').forEach(btn=>{
        btn.addEventListener('click', () => {
          btn.animate([
            { transform:'translateY(-4px) scale(1)' },
            { transform:'translateY(-4px) scale(.96)' },
            { transform:'translateY(-4px) scale(1.02)' }
          ],{ duration:280, easing:'cubic-bezier(.3,1.4,.4,1)' });
        });
      });
    }

    const messagesEl = el('messages');
    const messagesInner = el('messagesInner');
    const scrollBottomBtn = el('scrollBottomBtn');
    const welcomeEl = el('welcome');
    const inputEl = el('input');
    const sendBtn = el('sendBtn');
    const attachBtn = el('attachBtn');
    const fileInput = el('fileInput');
    const attachmentTray = el('attachmentTray');
    const requestStatus = el('requestStatus');
    const requestStatusText = el('requestStatusText');
    const networkBanner = el('networkBanner');
    const cancelRequestBtn = el('cancelRequestBtn');
    const clearBtn = el('clearBtn');
    const newChatBtn = el('newChatBtn');
    const themeToggleBtn = el('themeToggleBtn');
    const exportChatBtn = el('exportChatBtn');
    const normalModeBtn = el('normalModeBtn');
    const advancedModeBtn = el('advancedModeBtn');
    const mobileMenuBtn = el('mobileMenuBtn');
    const drawerBackdrop = el('drawerBackdrop');
    const qjoLogo = el('qjoLogo');
    const qsparkNavBtn = el('qsparkNavBtn');
    const qcodeNavBtn = el('qcodeNavBtn');

    const settingsModal = el('settingsModal');
    const closeModal = el('closeModal');
    const runtimeTokenInput = el('runtimeTokenInput');
    const modelInput = el('modelInput');
    const saveRuntimeBtn = el('saveRuntimeBtn');
    const forgetRuntimeBtn = el('forgetRuntimeBtn');
    const toggleRuntimeBtn = el('toggleRuntimeBtn');
    const pasteRuntimeBtn = el('pasteRuntimeBtn');
    const runtimeStatus = el('runtimeStatus');
    const activationPill = el('activationPill');
    const adminLink = el('adminLink');
    const copyAdminLinkBtn = el('copyAdminLinkBtn');
    const openAdminLinkBtn = el('openAdminLinkBtn');

    const trainingModal = el('trainingModal');
    const closeTrainingModal = el('closeTrainingModal');
    const trainingText = el('trainingText');
    const saveTrainingBtn = el('saveTrainingBtn');
    const sampleTrainingBtn = el('sampleTrainingBtn');
    const clearTrainingBtn = el('clearTrainingBtn');
    const trainingStatus = el('trainingStatus');

    const authOverlay = el('authOverlay');
    const googleLoginBtn = el('googleLoginBtn');
    const githubLoginBtn = el('githubLoginBtn');
    const emailLoginBtn = el('emailLoginBtn');
    const emailSignupBtn = el('emailSignupBtn');
    const authEmail = el('authEmail');
    const authPassword = el('authPassword');
    const rememberMe = el('rememberMe');
    const authError = el('authError');
    const authBrowserTip = el('authBrowserTip');
    const userSettingsBtn = el('userSettingsBtn');
    const directLogoutBtn = el('directLogoutBtn');
    const userAvatar = el('userAvatar');
    const accountCard = el('accountCard');
    const userName = el('userName');
    const userEmail = el('userEmail');
    const chatList = el('chatList');
    const showAllChatsBtn = el('showAllChatsBtn');
    const allChatsModal = el('allChatsModal');
    const closeAllChatsModal = el('closeAllChatsModal');
    const allChatsList = el('allChatsList');
    const chatSearchInput = el('chatSearchInput');
    const firebaseConfigInput = el('firebaseConfigInput');
    const authLogoImg = el('authLogoImg');
    const userSettingsModal = el('userSettingsModal');
    const closeUserSettingsModal = el('closeUserSettingsModal');
    const languageSelect = el('languageSelect');
    const settingsThemeBtn = el('settingsThemeBtn');
    const settingsLogoutBtn = el('settingsLogoutBtn');
    const settingsAccountEmail = el('settingsAccountEmail');
    const prefTone = el('prefTone');
    const prefExpertise = el('prefExpertise');
    const prefAddressing = el('prefAddressing');
    const prefInterests = el('prefInterests');
    const prefNotes = el('prefNotes');
    const savePreferencesBtn = el('savePreferencesBtn');
    const preferencesStatus = el('preferencesStatus');
    const memoryList = el('memoryList');
    const refreshMemoryBtn = el('refreshMemoryBtn');
    const clearMemoryBtn = el('clearMemoryBtn');

    const OLD_STORAGE_KEY = 'qjo_groqcloud_api_key';
    const STORAGE_KEY = 'qjo_runtime_token'; // legacy only; production uses backend env, not browser storage
    const TRAINING_KEY = 'qjo_training_text';
    const LEARNING_KEY = 'qjo_learning_notes';
    const MODE_KEY = 'qjo_response_mode';
    const THEME_KEY = 'qjo_theme';
    const LANGUAGE_KEY = 'qjo_language';
    const DRAFT_KEY = 'qjo_draft_message';
    const FIREBASE_CONFIG_KEY = 'qjo_firebase_config';
    const RAG_DB_NAME = 'qjo_rag_indexes_v1';
    const RAG_STORE_NAME = 'ragIndexes';
    const DEFAULT_FIREBASE_CONFIG = {
      apiKey: "AIzaSyBo902a2kkFRla-asU2nAzFkBaDW7yJTVI",
      authDomain: "qjo1-8ae37.firebaseapp.com",
      projectId: "qjo1-8ae37",
      storageBucket: "qjo1-8ae37.firebasestorage.app",
      messagingSenderId: "549387435430",
      appId: "1:549387435430:web:563fd4dcb108f360eb6367",
      measurementId: "G-J5RGLP3EG5"
    };

    const GROQ_FLASH_MODEL = 'openai/gpt-oss-20b'; // Groq's replacement for llama-3.1-8b-instant (deprecated, shuts 2026-08-16)
    const GROQ_MODEL = 'openai/gpt-oss-120b'; // Groq's replacement for llama-3.3-70b-versatile (deprecated, shuts 2026-08-16)
    const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
    const TEXT_MAX_TOKENS = 2600;
    const VISION_MAX_TOKENS = 1000;
    const FILE_MAX_TOKENS = 3000;
    // See addFiles(): every readable attachment costs ~18k characters of
    // retrieved evidence in the prompt, so the count has to be bounded.
    const MAX_ATTACHMENTS = 6;
    const PDF_MAX_CHARS = 120000;
    const TEXT_FILE_MAX_CHARS = 30000;

    const runtimeToken = 'server-managed';
    let clientContext = null;
    let lastSearchSources = [];
    let activeRagIndexes = [];
    let ragDbPromise = null;

    // Safari in private browsing refuses script-writable storage: every
    // localStorage call throws instead of no-opping. These reads happen while
    // the script is still evaluating, so an exception here took the entire app
    // down before it rendered — not just sign-in. Nothing below may assume
    // storage works.
    function readStored(key) {
      try { return localStorage.getItem(key); } catch (_) { return null; }
    }

    function writeStored(key, value) {
      try { localStorage.setItem(key, value); } catch (_) { /* storage blocked */ }
    }

    function dropStored(key) {
      try { localStorage.removeItem(key); } catch (_) { /* storage blocked */ }
    }

    // Stored JSON can also be corrupt from an older build, which used to throw
    // from the same top-level position.
    function readJSON(key, fallback) {
      try {
        const raw = readStored(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed === null || parsed === undefined ? fallback : parsed;
      } catch (_) {
        return fallback;
      }
    }

    let qjoTraining = readStored(TRAINING_KEY) || '';
    let qjoLearning = readJSON(LEARNING_KEY, []);
    const remoteConfig = {};
    let userPreferences = {};
    // Only Flash ('normal') and Max ('advanced') are selectable. A 'code' value
    // persisted by an older build normalises to Flash; coding requests are still
    // detected server-side and get the engineering overlay on their own.
    let qjoMode = ['normal', 'advanced'].includes(readStored(MODE_KEY)) ? readStored(MODE_KEY) : 'normal';
    // Composer function toggles. Declared here, alongside the rest of the app
    // state, because needsWebSearch/needsDeepSearch/getGenerationConfig read it
    // and all of them are reachable before installFunctionToggles() runs — a
    // `let` further down the file puts it in the temporal dead zone and throws
    // on load, taking the whole app with it.
    const FUNCTION_TOGGLES_KEY = 'qjo_function_toggles';

    const FUNCTION_TOGGLES = [
      {
        id: 'toggleSearch',
        key: 'search',
        on: { ar: 'البحث المباشر مفعّل — سيتم جلب مصادر حيّة لكل رسالة 🔍', en: 'Live search on — sources will be fetched for every message 🔍' },
        off: { ar: 'تم إيقاف البحث المباشر', en: 'Live search off' }
      },
      {
        id: 'toggleDeep',
        key: 'deep',
        on: { ar: 'البحث العميق مفعّل — استعلامات متعددة ومصادر موسّعة 🎯', en: 'Deep search on — multi-query research with extended sources 🎯' },
        off: { ar: 'تم إيقاف البحث العميق', en: 'Deep search off' }
      },
      {
        id: 'toggleTask',
        key: 'task',
        on: { ar: 'وضع المهمة مفعّل — الطلب القادم سينفَّذ على عدة خطوات 🎯', en: 'Task mode on — your next request runs as a multi-step task 🎯' },
        off: { ar: 'تم إيقاف وضع المهمة', en: 'Task mode off' }
      }
    ];

    let qjoFunctions = { search: false, deep: false, task: false };
    let qjoTheme = readStored(THEME_KEY) || 'light';
    let qjoLanguage = readStored(LANGUAGE_KEY) || 'ar';
    let busy = false;
    const logoClicks = 0;
    const logoClickTimer = null;
    const history = [];
    let pendingAttachments = [];
    let firebaseReady = false;
    let firebaseInitAttempts = 0;
    let authPersistenceReady = false;
    let authStateSettled = false;
    let authInProgress = false;
    let authNullTimer = null;
    const AUTH_GRACE_KEY = 'qjo_auth_grace_until';
    const AUTH_GRACE_MS = 15000;
    // Set once a real user has been observed on this page, so a later null is
    // treated as a restoration hiccup rather than a sign-out.
    let hasAuthenticatedThisSession = false;
    // A redirect sign-in lands the user on a brand-new page, where the flag
    // above has reset to false. This marker survives that hop so the page
    // receiving the redirect knows a real user just signed in. It is bounded,
    // so a genuinely signed-out visitor is not left staring at an empty shell.
    const AUTH_RECENT_USER_KEY = 'qjo_auth_recent_user';
    const AUTH_RECENT_USER_MS = 120000;
    let auth = null;
    let db = null;
    let currentUser = null;
    let currentChatId = null;
    let chatUnsubscribe = null;
    const savingChat = false;
    let allChatsCache = [];
    let chatSearchQuery = '';
    let messageSeq = 0;
    let didAutoLoadChat = false;
    let activeRequestController = null;
    let fileProcessing = false;
    let lastFailedRequest = null;
    // Set when a request fails in a way worth replaying once on the user's
    // behalf; consumed after the failed attempt has finished tearing down.
    let pendingAutoRetry = null;
    let requestTimer = null;
    let requestStartedAt = 0;

    function escapeHtml(text) {
      return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function sanitizeStoredMessageContent(content, role) {
      if (role !== 'user' || typeof content !== 'string') return content;
      // Strip any leaked internal search injection, source pack, or scraper excerpts
      const searchMarkerRegex = /\n\n(?:Connected\s+(?:Deep\s+)?Search\s+executed|Web\s+search\s+note:|SOURCE\s+PACK:|Search\s+instructions:|تعليمات\s+البحث:)/i;
      const match = content.match(searchMarkerRegex);
      if (match && match.index !== undefined) {
        return content.slice(0, match.index).trim();
      }
      return content;
    }

    function parseInlineMarkdown(text) {
      let value = String(text);

      // Markdown links: [label](https://example.com)
      value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      });

      // Raw URLs, while avoiding URLs already inside href="..."
      value = value.replace(/(^|\s)(https?:\/\/[^\s<]+[^\s<.,؛،)])/g, (match, prefix, url) => {
        if (match.includes('href=')) return match;
        return `${prefix}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      });

      return value
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }

    function isTableSeparator(line) {
      const trimmed = String(line || '').trim();
      if (!trimmed.includes('|') && !trimmed.includes('-')) return false;
      const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      return cells.length >= 2 && cells.every(c => /^:?-+:?$/.test(c));
    }

    function parseTableCells(line) {
      const trimmed = String(line || '').trim();
      const content = (trimmed.startsWith('|') ? trimmed.slice(1) : trimmed)
        .replace(/\|$/, '');
      return content.split('|').map(cell => parseInlineMarkdown(cell.trim()));
    }

    function renderMarkdownTable(lines, startIndex) {
      if (!lines[startIndex] || !lines[startIndex].includes('|')) return null;
      if (!isTableSeparator(lines[startIndex + 1])) return null;

      const headers = parseTableCells(lines[startIndex]);
      if (headers.length < 2) return null;

      const rows = [];
      let index = startIndex + 2;
      while (index < lines.length) {
        const line = lines[index];
        if (!line || !line.trim() || !line.includes('|') || isTableSeparator(line)) break;
        const cells = parseTableCells(line);
        if (cells.length < 2) break;
        rows.push(cells);
        index++;
      }

      const thead = '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
      const tbody = '<tbody>' + rows.map(row => '<tr>' + headers.map((_, i) => `<td>${row[i] !== undefined ? row[i] : ''}</td>`).join('') + '</tr>').join('') + '</tbody>';
      return { html: `<div class="md-table-wrap" id="table-instance-${startIndex}"><table class="md-table">${thead}${tbody}</table></div>`, nextIndex: index };
    }

    function isPreviewableHtml(normalizedLang, code, extractedPath) {
      const lang = String(normalizedLang || '').toLowerCase();
      const ext = extractedPath ? extractedPath.split('.').pop().toLowerCase() : '';
      if (lang === 'html' || lang === 'htm' || ext === 'html' || ext === 'htm' || lang === 'svg' || ext === 'svg') {
        return true;
      }
      const trimmed = String(code || '').trim();
      if ((lang === 'xml' || lang === 'jsx' || lang === 'tsx' || lang === 'javascript' || lang === 'js' || !lang || lang === 'code') &&
          (/<!doctype\s+html/i.test(trimmed) || /<html\b/i.test(trimmed) || (trimmed.startsWith('<') && /<\/[a-z][a-z0-9]*>$/i.test(trimmed)))) {
        return true;
      }
      return false;
    }

    function buildPreviewHtml(rawCode) {
      let trimmed = String(rawCode || '').trim();
      if (trimmed.startsWith('<svg') || trimmed.includes('xmlns="http://www.w3.org/2000/svg"')) {
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;background:#f8fafc;}svg{max-width:100%;max-height:85vh;}</style></head><body>${trimmed}</body></html>`;
      }
      if (/<!doctype\s+html/i.test(trimmed) || /<html\b/i.test(trimmed)) {
        if (!trimmed.includes('tailwindcss.com') && !trimmed.includes('tailwind')) {
          trimmed = trimmed.replace(/<\/head>/i, '<script src="https://cdn.tailwindcss.com"><\\/script></head>');
        }
        return trimmed;
      }
      const isRtl = /[\u0600-\u06FF]/.test(trimmed);
      return `<!DOCTYPE html>
<html lang="${isRtl ? 'ar' : 'en'}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      font-family: ${isRtl ? "'IBM Plex Sans Arabic', 'Inter'" : "'Inter', 'IBM Plex Sans Arabic'"}, -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0;
      padding: 16px;
      background-color: #ffffff;
      color: #0f172a;
      min-height: 100vh;
      box-sizing: border-box;
    }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  ${trimmed}
</body>
</html>`;
    }

    function lightMarkdown(text) {
      const codeBlocks = [];
      let safe = String(text || '').replace(/```([^\n\r`]*)\n?([\s\S]*?)```/g, (_, rawLangHeader, code) => {
        const id = codeBlocks.length;
        const rawLang = String(rawLangHeader || '').trim();
        let normalizedLang = rawLang.toLowerCase();
        let extractedPath = '';

        if (rawLang.includes(':')) {
          const parts = rawLang.split(':');
          normalizedLang = parts[0].trim().toLowerCase();
          extractedPath = parts.slice(1).join(':').trim();
        }

        if (!extractedPath) {
          const firstLine = String(code || '').trim().split('\n')[0] || '';
          const pathMatch = firstLine.match(/^(?:\/\/|#|\/\*)\s*(?:path|file|filepath):\s*`?([^\s`*]+)/i);
          if (pathMatch && pathMatch[1]) {
            extractedPath = pathMatch[1].trim();
          }
        }

        if (normalizedLang === 'chart' || normalizedLang === 'json-chart') {
          const chartDataEscaped = encodeURIComponent(code.trim());
          let chartTitle = '';
          try {
            const parsed = safeParseRelaxedJson(code.trim());
            if (parsed && parsed.title) chartTitle = String(parsed.title);
            else if (parsed && parsed.options && parsed.options.plugins && parsed.options.plugins.title && parsed.options.plugins.title.text) {
              chartTitle = String(parsed.options.plugins.title.text);
            }
          } catch (_) {}
          if (chartTitle) {
            chartTitle = chartTitle
              .replace(/\$([^\$]+)\$/g, '$1')
              .replace(/\\([a-zA-Z]+)/g, '$1')
              .replace(/[\{\}]/g, '')
              .trim();
          }
          const defaultTitle = qjoLanguage === 'ar' ? 'مخطط بياني تفاعلي' : 'Interactive Chart';
          const displayTitle = chartTitle || defaultTitle;
          const placeholder = `
            <div class="interactive-chart-card">
              <div class="interactive-chart-header">
                <div class="interactive-chart-title-box">
                  <span class="interactive-chart-icon">📈</span>
                  <span class="interactive-chart-title">${escapeHtml(displayTitle)}</span>
                </div>
              </div>
              <div class="interactive-chart-container" id="chart-instance-${id}" data-chart-config="${chartDataEscaped}">
                <canvas id="canvas-instance-${id}"></canvas>
              </div>
              <div class="chart-error-note text-rose-500 font-bold hidden text-xs p-2"></div>
            </div>
          `.trim();
          codeBlocks.push(placeholder);
        } else if (normalizedLang === 'mermaid') {
          const placeholder = `<div class="mermaid" style="background: white; padding: 12px; border-radius: 8px; margin: 14px 0; overflow-x: auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); color: #0F172A;">${code.trim()}</div>`;
          codeBlocks.push(placeholder);
        } else if (normalizedLang === 'quiz' || normalizedLang === 'json-quiz') {
          const quizDataEscaped = encodeURIComponent(code.trim());
          const placeholder = `<div class="interactive-quiz-container" id="quiz-instance-${id}" data-quiz-config="${quizDataEscaped}"></div>`;
          codeBlocks.push(placeholder);
        } else if (normalizedLang === 'python' || normalizedLang === 'py') {
          const codeEscaped = encodeURIComponent(code.trim());
          const fileChipHtml = extractedPath ? `
            <div class="code-block-file-chip" title="${escapeHtml(extractedPath)}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
              <span class="code-block-filepath">${escapeHtml(extractedPath)}</span>
            </div>` : '';
          const placeholder = `
            <div class="code-block-wrapper python-block-wrapper">
              <div class="code-block-header">
                <div class="code-block-header-left">
                  ${fileChipHtml}
                  <span class="code-block-lang">python</span>
                  <span class="python-wasm-badge">WASM</span>
                </div>
                <div class="code-block-actions">
                  <button type="button" class="toggle-linenums-btn" title="${qjoLanguage === 'ar' ? 'أرقام الأسطر' : 'Toggle line numbers'}">#</button>
                  <button type="button" class="code-focus-btn" title="${qjoLanguage === 'ar' ? 'ملء الشاشة' : 'Focus mode'}">⛶</button>
                  <button type="button" class="run-python-btn" data-code="${codeEscaped}" data-target="py-output-${id}">
                    <svg class="run-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    <span class="run-spinner hidden"></span>
                    <span class="run-label">${qjoLanguage === 'ar' ? 'تشغيل' : 'Run'}</span>
                  </button>
                  <button type="button" class="copy-code-btn" data-code="${codeEscaped}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span>${qjoLanguage === 'ar' ? 'نسخ' : 'Copy'}</span>
                  </button>
                </div>
              </div>
              <pre><code class="language-python">${escapeHtml(code.trim())}</code></pre>
              <div class="python-output-container hidden" id="py-output-${id}"></div>
            </div>
          `.trim();
          codeBlocks.push(placeholder);
        } else {
          const langDisplay = (normalizedLang || 'code').toLowerCase();
          const codeEscaped = encodeURIComponent(code.trim());
          const isPreviewable = isPreviewableHtml(normalizedLang, code, extractedPath);
          const fileChipHtml = extractedPath ? `
            <div class="code-block-file-chip" title="${escapeHtml(extractedPath)}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
              <span class="code-block-filepath">${escapeHtml(extractedPath)}</span>
            </div>` : '';

          let tabsHtml = '';
          let previewContainerHtml = '';
          let expandBtnHtml = '';

          // JavaScript runs in a Web Worker (separate thread), so an infinite
          // loop stalls the worker and not the page — the worker is terminated
          // by a watchdog instead. Previewable HTML blocks keep the live
          // preview instead of a Run button.
          // TypeScript is transpiled (type-stripped) before it reaches the same
          // worker. `tsx` is deliberately excluded along with jsx: those render
          // components and there is no DOM inside a worker to render into.
          const isRunnableTs = !isPreviewable && ['typescript', 'ts'].includes(langDisplay);
          const isRunnableJs = !isPreviewable && (isRunnableTs || ['javascript', 'js', 'node', 'nodejs', 'mjs', 'cjs'].includes(langDisplay));
          const runJsBtnHtml = isRunnableJs ? `
              <button type="button" class="run-js-btn" data-code="${codeEscaped}" data-target="js-output-${id}" data-lang="${isRunnableTs ? 'typescript' : 'javascript'}">
                <svg class="run-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span class="run-spinner hidden"></span>
                <span class="run-label">${qjoLanguage === 'ar' ? 'تشغيل' : 'Run'}</span>
              </button>
            ` : '';
          const jsBadgeHtml = isRunnableJs ? '<span class="js-engine-badge">JS</span>' : '';
          const jsOutputHtml = isRunnableJs
            ? `<div class="python-output-container hidden" id="js-output-${id}"></div>`
            : '';

          // Line numbers live in a CSS-generated gutter rather than in the
          // markup, so toggling them never contaminates a copy or a ZIP export.
          const lineNumbersBtnHtml = `
              <button type="button" class="toggle-linenums-btn" title="${qjoLanguage === 'ar' ? 'أرقام الأسطر' : 'Toggle line numbers'}">#</button>
            `;
          const codeFocusBtnHtml = `
              <button type="button" class="code-focus-btn" title="${qjoLanguage === 'ar' ? 'ملء الشاشة' : 'Focus mode'}">⛶</button>
            `;

          if (isPreviewable) {
            tabsHtml = `
              <div class="code-block-tabs">
                <button type="button" class="code-tab-btn active" data-tab="code" data-target="code-content-${id}">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                  <span>${qjoLanguage === 'ar' ? 'كود' : 'Code'}</span>
                </button>
                <button type="button" class="code-tab-btn live-preview-tab-btn" data-tab="preview" data-target="preview-content-${id}" data-id="${id}">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  <span>${qjoLanguage === 'ar' ? 'معاينة حية' : 'Preview'}</span>
                </button>
              </div>
            `;
            expandBtnHtml = `
              <button type="button" class="preview-expand-btn hidden" data-id="${id}" title="${qjoLanguage === 'ar' ? 'تكبير المعاينة' : 'Fullscreen'}">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              </button>
            `;
            previewContainerHtml = `
              <div class="live-preview-container hidden" id="preview-content-${id}" data-code="${codeEscaped}">
                <div class="preview-toolbar">
                  <div class="preview-viewport-controls">
                    <button type="button" class="preview-size-btn active" data-size="desktop" data-id="${id}" title="${qjoLanguage === 'ar' ? 'سطح المكتب' : 'Desktop view'}">💻</button>
                    <button type="button" class="preview-size-btn" data-size="mobile" data-id="${id}" title="${qjoLanguage === 'ar' ? 'جوال (375px)' : 'Mobile view'}">📱</button>
                  </div>
                  <div class="preview-status-indicator">
                    <span class="preview-dot"></span>
                    <span>${qjoLanguage === 'ar' ? 'معاينة تفاعلية' : 'Live Preview'}</span>
                  </div>
                  <button type="button" class="preview-reload-btn" data-id="${id}" title="${qjoLanguage === 'ar' ? 'إعادة تحميل' : 'Reload'}">🔄</button>
                </div>
                <div class="preview-viewport desktop-view" id="preview-viewport-${id}">
                  <iframe class="live-preview-iframe" id="preview-iframe-${id}" sandbox="allow-scripts allow-modals" loading="lazy"></iframe>
                </div>
              </div>
            `;
          }

          const placeholder = `
            <div class="code-block-wrapper ${isPreviewable ? 'has-live-preview' : ''}">
              <div class="code-block-header">
                <div class="code-block-header-left">
                  ${fileChipHtml}
                  <span class="code-block-lang">${escapeHtml(langDisplay)}</span>
                  ${jsBadgeHtml}
                  ${tabsHtml}
                </div>
                <div class="code-block-actions">
                  ${runJsBtnHtml}
                  ${lineNumbersBtnHtml}
                  ${codeFocusBtnHtml}
                  ${expandBtnHtml}
                  <button type="button" class="copy-code-btn" data-code="${codeEscaped}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span>${qjoLanguage === 'ar' ? 'نسخ' : 'Copy'}</span>
                  </button>
                </div>
              </div>
              <pre id="code-content-${id}"><code class="language-${escapeHtml(langDisplay)}">${escapeHtml(code.trim())}</code></pre>
              ${previewContainerHtml}
              ${jsOutputHtml}
            </div>
          `.trim();
          codeBlocks.push(placeholder);
        }
        return `@@CODE_BLOCK_${id}@@`;
      });

      safe = escapeHtml(safe);
      const lines = safe.replace(/\r\n/g, '\n').split('\n');
      const out = [];
      const paragraph = [];

      const flushParagraph = () => {
        if (!paragraph.length) return;
        out.push(`<p>${parseInlineMarkdown(paragraph.join(' '))}</p>`);
        paragraph.length = 0;
      };

      for (let i = 0; i < lines.length;) {
        const raw = lines[i];
        const trimmed = raw.trim();

        if (!trimmed) {
          flushParagraph();
          i++;
          continue;
        }

        if (/^@@CODE_BLOCK_\d+@@$/.test(trimmed)) {
          flushParagraph();
          out.push(trimmed);
          i++;
          continue;
        }

        const table = renderMarkdownTable(lines, i);
        if (table) {
          flushParagraph();
          out.push(table.html);
          i = table.nextIndex;
          continue;
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          flushParagraph();
          const level = Math.min(4, Math.max(2, heading[1].length + 1));
          out.push(`<h${level}>${parseInlineMarkdown(heading[2])}</h${level}>`);
          i++;
          continue;
        }

        if (/^---+$/.test(trimmed)) {
          flushParagraph();
          out.push('<hr>');
          i++;
          continue;
        }

        if (/^[-*]\s+/.test(trimmed)) {
          flushParagraph();
          const items = [];
          while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
            items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
            i++;
          }
          out.push('<ul>' + items.map(item => `<li>${parseInlineMarkdown(item)}</li>`).join('') + '</ul>');
          continue;
        }

        if (/^\d+[.)]\s+/.test(trimmed)) {
          flushParagraph();
          const items = [];
          while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
            items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
            i++;
          }
          out.push('<ol>' + items.map(item => `<li>${parseInlineMarkdown(item)}</li>`).join('') + '</ol>');
          continue;
        }

        paragraph.push(trimmed);
        i++;
      }

      flushParagraph();
      return out.join('\n').replace(/@@CODE_BLOCK_(\d+)@@/g, (_, id) => codeBlocks[Number(id)] || '');
    }

    // Runs the optional enhancements over a finished assistant bubble. Each is
    // isolated: a malformed chart config or a KaTeX hiccup costs that one
    // enhancement, never the answer it was decorating.
    function decorateAssistantBubble(bubble, wrap, options = {}) {
      if (!bubble) return;
      const steps = [
        ['math', () => typesetMath(bubble)],
        ['charts', () => initializeChartsInElement(bubble)],
        ['code blocks', () => initializeCodeBlockCopyButtons(bubble)],
        ['quizzes', () => initializeQuizzesInElement(bubble)],
        ['diagrams', () => {
          if (typeof mermaid !== 'undefined') mermaid.init(undefined, bubble.querySelectorAll('.mermaid'));
        }]
      ];
      if (options.extras) steps.push(...options.extras);
      for (const [what, run] of steps) {
        try {
          run();
        } catch (error) {
          console.warn('Post-answer ' + what + ' failed (answer kept):', error);
        }
      }
    }

    function typesetMath(node) {
      if (!window.MathJax || !window.MathJax.typesetPromise || !node) return;
      window.MathJax.typesetPromise([node]).catch(() => {});
    }



    function inferLocationFromTimeZone(timeZone) {
      const map = {
        'Asia/Amman': { city: 'Amman', country: 'Jordan', labelAr: 'عمّان، الأردن' },
        'Asia/Riyadh': { city: 'Riyadh', country: 'Saudi Arabia', labelAr: 'الرياض، السعودية' },
        'Asia/Dubai': { city: 'Dubai', country: 'United Arab Emirates', labelAr: 'دبي، الإمارات' },
        'Africa/Cairo': { city: 'Cairo', country: 'Egypt', labelAr: 'القاهرة، مصر' },
        'Asia/Beirut': { city: 'Beirut', country: 'Lebanon', labelAr: 'بيروت، لبنان' },
        'Asia/Jerusalem': { city: 'Jerusalem', country: 'Palestine/Israel', labelAr: 'القدس/فلسطين' },
        'Europe/London': { city: 'London', country: 'United Kingdom', labelAr: 'لندن، بريطانيا' },
        'America/New_York': { city: 'New York', country: 'United States', labelAr: 'نيويورك، الولايات المتحدة' }
      };
      return map[timeZone] || null;
    }

    function getBrowserTimeContext() {
      const now = new Date();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const offsetMinutes = -now.getTimezoneOffset();
      const sign = offsetMinutes >= 0 ? '+' : '-';
      const hh = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0');
      const mm = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');
      const inferred = inferLocationFromTimeZone(timeZone);
      const ipGeo = clientContext?.ipGeo || null;
      return { now, timeZone, utcOffset: `UTC${sign}${hh}:${mm}`, inferred, ipGeo };
    }

    function latestUserTextForPrompt() {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i]?.role === 'user') return String(history[i].content || '');
      }
      return '';
    }

    function hasAny(text, words) {
      const value = String(text || '').toLowerCase();
      return words.some(w => value.includes(String(w).toLowerCase()));
    }

    function buildSkillCapsules() {
      const text = latestUserTextForPrompt();
      const capsules = [];

      const codeTerms = ['code', 'كود', 'برمج', 'debug', 'bug', 'api', 'html', 'css', 'javascript', 'typescript', 'python', 'react', 'node', 'تطبيق', 'موقع', 'لعبة', 'app', 'website', 'game'];
      const neuralTerms = ['neural', 'شبكة عصبية', 'شبكات عصبية', 'transformer', 'cnn', 'rnn', 'gnn', 'attention', 'architecture', 'معمارية', 'نموذج تعلم عميق', 'deep learning'];
      const researchTerms = ['بحث', 'بحث علمي', 'paper', 'دراسة', 'منهجية', 'فرضية', 'literature', 'review', 'academic', 'أكاديمي', 'مصادر', 'توثيق'];
      const tutoringTerms = ['اشرح', 'علمني', 'ادرس', 'طالب', 'امتحان', 'quiz', 'اختبار', 'مذاكرة', 'لخص', 'تلخيص', 'افهم', 'شرح'];
      const mathTerms = ['احسب', 'رياضيات', 'معادلة', 'برهان', 'احتمال', 'إحصاء', 'جبر', 'تفاضل', 'تكامل', 'algorithm', 'خوارزمية'];
      const fileTerms = ['pdf', 'ملف', 'وثيقة', 'صورة', 'مرفق', 'csv', 'json', 'حلل هذا الملف', 'حلل الصورة'];

      if (qjoMode === 'code' || hasAny(text, codeTerms)) {
        capsules.push(`Coding capsule: act as a senior software engineer. For implementation, provide architecture, file structure, clean code, exact placement, tests, edge cases, security, performance, accessibility, and deployment notes. Avoid toy snippets for serious builds. Use targeted patches for existing code.`);
      }

      if (hasAny(text, neuralTerms)) {
        capsules.push(`Neural architecture capsule: act as a deep learning architect. Discuss task type, data modality, tensor shapes, architecture choice, layers/blocks, loss, optimizer, training strategy, evaluation metrics, ablations, deployment latency, memory, and failure modes. Compare alternatives such as MLP, CNN, RNN, Transformer, ViT, U-Net, diffusion, GNN when relevant.`);
      }

      if (hasAny(text, researchTerms)) {
        capsules.push(`Academic research capsule: act as a rigorous research assistant. Structure help around research question, hypothesis, literature review, methodology, variables, dataset/sample, analysis approach, limitations, contribution, and future work. Never fabricate citations. Use search results when current literature is needed.`);
      }

      if (hasAny(text, tutoringTerms)) {
        capsules.push(`Adaptive tutoring capsule: teach from the user's level. Start with intuition, then example, then steps, then common mistakes, then a small exercise if useful. Adjust difficulty based on the user's answer. Summaries should be layered and study-friendly.`);
      }

      if (hasAny(text, mathTerms)) {
        capsules.push(`Math and reasoning capsule: identify givens, unknowns, assumptions, method, calculation, verification, and final answer. Use the calculator tool for exact arithmetic. Avoid skipping critical derivation steps in complex math.`);
      }

      if (hasAny(text, fileTerms)) {
        capsules.push(`File and image analysis capsule: extract concrete facts first, then summarize, analyze risks/issues, and provide actionable recommendations. If extracted text/content exists, analyze it directly. If content is missing or scanned, use available OCR text when provided; if OCR is incomplete, state limits and request a clearer source when needed.`);
      }

      return capsules.length ? `\n\nTask-specific skill capsules:\n${capsules.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : '';
    }

    function buildSystemPrompt() {
      const ownerKnowledge = qjoTraining.trim()
        ? `\n\nOwner-provided instructions:\n${qjoTraining.trim()}\n\nApply only when relevant and safe.`
        : '';

      const remoteTraining = remoteConfig.globalTraining
        ? `\n\nAdmin-managed global instructions:\n${String(remoteConfig.globalTraining).trim()}\n\nApply only when relevant and safe.`
        : '';

      const preferenceContext = buildUserPreferenceContext();
      const skillCapsules = buildSkillCapsules();

      const learnedCorrections = qjoLearning.length
        ? `\n\nSaved user corrections:\n${qjoLearning.slice(-20).map((note, i) => `${i + 1}. ${note}`).join('\n')}\n\nApply only when relevant and safe.`
        : '';

      // Only the per-user layer travels. The base prompt, the runtime date line
      // and the mode overlay are all built server-side by services/systemPrompt,
      // which strips this client copy on arrival anyway — so uploading it bought
      // nothing and the model never saw it. Measured: a 28-byte question was
      // shipping a 39.1KB request, 97.8% of it discarded server-side.
      //
      // QJO_SYSTEM_PROMPT stays defined as the canonical client-side reference
      // (kept in sync with docs/QJO_SYSTEM_PROMPT_VNEXT_XML.md by
      // scripts/sync_prompts.py and locked by the stability audit); it is simply
      // no longer part of the request.
      const personalization = skillCapsules + ownerKnowledge + remoteTraining + preferenceContext + learnedCorrections;
      return personalization.trim();
    }

    function applyTheme() {
      document.body.classList.toggle('dark', qjoTheme === 'dark');
      const themeText = document.getElementById('themeToggleBtnText');
      if (themeText) themeText.textContent = qjoTheme === 'dark' ? t('lightMode') : t('darkMode');
      if (settingsThemeBtn) settingsThemeBtn.textContent = t('toggleAppearance');
    }

    function toggleTheme() {
      qjoTheme = qjoTheme === 'dark' ? 'light' : 'dark';
      writeStored(THEME_KEY, qjoTheme);
      applyTheme();
    }



    const translations = {
      ar: {
        dir: 'rtl', lang: 'ar',
        newChat: 'محادثة جديدة', shortcuts: 'اختصارات', structuredThinking: 'رتّب أفكاري', professionalWriting: 'اكتب محتوى', executionPlan: 'درّبني', system: 'النظام', darkMode: 'الوضع الداكن', lightMode: 'الوضع الفاتح',
        topSubtitle: 'ذكاء واضح بتجربة راقية', welcomeKicker: 'Qjo Assistant', welcomeTitle: 'ابنِ شيئًا <em>مذهلاً</em>', welcomeText: 'ابدأ الكتابة بالأسفل، أو اختر من الأزرار لتبدأ بسرعة. Qjo يساعدك تفكر، تكتب، تتعلم وتبني بذكاء ووضوح.',
        suggest1Title: 'اقترح فكرة مشروع', suggest1Text: 'أفكار عملية قابلة للتنفيذ مع خطوات بداية واضحة.', suggest2Title: 'نظّم يومي', suggest2Text: 'خطة مختصرة تساعدك ترتب الأولويات بسرعة.', suggest3Title: 'اشرح مفهومًا', suggest3Text: 'شرح واضح وبسيط لأي موضوع تريد فهمه.',
        placeholder: 'اكتب رسالتك هنا...', normal: 'Flash', advanced: 'Max', modeGroup: 'وضع الإجابة', customInstructionsTitle: 'التعليمات المخصصة', customInstructionsDesc: 'اكتب تعليمات دائمة يلتزم بها Qjo في كل رد — نبرتك، مجالك، وما تريد تجنّبه.', customInstructionsBtn: 'تحرير التعليمات المخصصة', flashModeTitle: 'فلاش — إجابة سريعة ومباشرة', maxModeTitle: 'ماكس — تحليل أعمق ودقة أعلى', hint: 'Enter للإرسال · Shift + Enter لسطر جديد', settingsTitle: 'الإعدادات', close: 'إغلاق', languageTitle: 'اللغة', languageDesc: 'اختر لغة واجهة Qjo.', appearanceTitle: 'المظهر', appearanceDesc: 'بدّل بين الوضع الفاتح والداكن.', toggleAppearance: 'تبديل المظهر', accountTitle: 'الحساب', logout: 'تسجيل الخروج', notSigned: 'غير مسجل',
        chatsListLabel: 'المحادثات', sidebarText: 'مساعد ذكي يساعدك تفكر، تكتب، تتعلم، وتبني بسرعة ووضوح.', logoutDirectBtn: 'خروج', noInternet: 'لا يوجد اتصال بالإنترنت. سيتم تعطيل الإرسال مؤقتًا.', statusReading: 'Qjo يقرأ...', statusThinking: 'Qjo يفكر...', cancelBtn: 'إلغاء', searchBtn: 'بحث', deepSearchBtn: 'بحث عميق', taskBtn: 'مهمة', reasonBtn: 'تفكير', attachMenuUpload: 'رفع ملف', attachMenuDrive: 'من جوجل درايف', attachMenuUi: 'تصميم UI', attachMenuWeb: 'قراءة صفحة', attachMenuChart: 'رسم بياني', attachMenuQuiz: 'صنع اختبار', attachMenuSearch: 'بحث يوتيوب', attachMenuTts: 'صوت ذكي', qsHeader: 'اقتراحات', soon: 'قريبًا',
        currentAssistant: 'المساعد الحالي', showAllChats: 'عرض كل المحادثات', emptyChats: 'لا توجد محادثات بعد', qsparkSoon: 'Q-Spark — قريبًا', qcodeSoon: 'Qcode — قريبًا', defaultUserName: 'مستخدم', toggleSidebar: 'إخفاء/إظهار الشريط الجانبي', exportChat: 'تصدير المحادثة', scrollToBottom: 'النزول لآخر المحادثة', mobileToolsTitle: 'أدوات وتصنيفات الذكاء', tools: 'أدوات', searchTitle: 'بحث في الويب', deepSearchTitle: 'بحث عميق متعمق', taskModeTitle: 'وضع المهمة', taskModeDesc: 'نفّذ الطلب على عدة خطوات مع خطة تتابعها', reasonTitle: 'تفكير منطقي موسع', attachFile: 'إرفاق ملف', sendBtn: 'إرسال',
        catCode: 'توليد كود', catLaunch: 'إطلاق تطبيق', catUi: 'مكونات UI', catTheme: 'أفكار ثيمات', catDashboard: 'لوحة مستخدم', catLanding: 'صفحة هبوط', catDocs: 'رفع مستندات', catAssets: 'صور وأصول', catIdeas: 'اقتراحات',
        drawerTitle: 'أدوات وميزات Qjo', drawerBlockAi: 'ميزات الذكاء النشطة', drawerBlockCats: 'التصنيفات والإنشاء السريع',
        allChatsTitle: 'كل المحادثات', searchChats: 'ابحث في أسماء المحادثات...', deleteChatPrompt: 'هل أنت متأكد من حذف هذه المحادثة؟', renameChatPrompt: 'أدخل العنوان الجديد للمحادثة:', chatNotFound: 'هذه المحادثة غير موجودة أو تم حذفها.', chatDeleted: 'هذه المحادثة محذوفة.', renameBtnTitle: 'إعادة تسمية', deleteBtnTitle: 'حذف المحادثة', noMatchingChats: 'لا توجد نتائج مطابقة',
        customizationTitle: 'تخصيص Qjo', customizationDesc: 'هذه التفضيلات تحفظ لحسابك وتساعد Qjo يخصص إجاباته لك.', responseStyle: 'أسلوب الرد', styleBalanced: 'متوازن', styleConcise: 'مختصر جدًا', styleDetailed: 'تفصيلي', styleFriendly: 'ودود', styleFormal: 'رسمي',
        expertiseLevel: 'مستوى الخبرة', expGeneral: 'عام', expBeginner: 'مبتدئ', expIntermediate: 'متوسط', expAdvanced: 'متقدم', expExpert: 'خبير', addressingStyle: 'صيغة الخطاب', addrNeutral: 'محايد', addrMasculine: 'مذكر', addrFeminine: 'مؤنث',
        interestsLabel: 'اهتماماتك أو مجالاتك', interestsPlaceholder: 'مثال: برمجة، رياضيات، شبكات عصبية، بزنس...', notesLabel: 'ملاحظات شخصية لـ Qjo', notesPlaceholder: 'مثال: أحب الإجابات المرتبة بجداول، لا تطوّل إلا عند الحاجة...', savePreferences: 'حفظ التفضيلات',
        memoryTitle: 'ذاكرة Qjo المحلية', memoryDesc: 'تصحيحاتك وتعليماتك المحلية المحفوظة على هذا الجهاز. يمكنك مراجعتها أو مسحها.', refreshMemory: 'تحديث الذاكرة', clearMemory: 'مسح الذاكرة المحلية',
        authTitle: 'تسجيل الدخول إلى Qjo', authSub: 'سجّل دخولك لحفظ محادثاتك والوصول لكامل مزايا المنصة.', authOrEmail: 'أو بالبريد الإلكتروني', authEmailLabel: 'البريد الإلكتروني', authPasswordLabel: 'كلمة المرور', authRemember: 'تذكرني على هذا الجهاز', authLoginBtn: 'تسجيل الدخول', authSignupBtn: 'إنشاء حساب جديد', authNote: 'Qjo يحفظ جلساتك بأمان ومحمي بأعلى معايير التشفير.',
        authHeroTitle: 'فكّر بعمق.<br>ابْتَكِر بلا حدود.<br><span>أنجِز بذكاء فائق.</span>', authHeroDesc: 'مساحة العمل المتكاملة للمطورين والمبدعين. سرعة فائقة، دقة استثنائية، وأدوات متقدمة ترتقي بإنتاجيتك إلى أعلى مستوى.', authHeroQuote: '« الإبداع الحقيقي يبدأ عندما تلتقي فكرتك مع الأداة الصحيحة. »',
        avatarTitle: 'اختر صورتك', avatarSub: 'اختر صورة شخصية من الأفاتارات الجاهزة، أو استخدم صورتك من جوجل إذا سجّلت الدخول بها.', avatarMe: 'أنا', avatarChooseFav: 'اختر أفاتارك المفضل', avatarUseGoogle: 'استخدام صورة جوجل', avatarResetInitial: 'إعادة للحرف',
        reasoning: 'مسار التفكير', thinking: 'التفكير...', thoughtFor: 'تم التفكير في', reasoningInit: 'بدء التفكير واستحضار السياق...', stopGen: 'تم إيقاف التوليد.', copyCode: 'نسخ الكود', copied: 'تم النسخ!', generatingResponse: 'جاري توليد الرد...', searchDesc: 'معلومات حية ومصادر', deepSearchDesc: 'تحليل دقيق وموسع', reasonDesc: 'استدلال تسلسلي عميق'
      },
      en: {
        dir: 'ltr', lang: 'en',
        newChat: 'New chat', shortcuts: 'Shortcuts', structuredThinking: 'Organize ideas', professionalWriting: 'Create content', executionPlan: 'Coach me', system: 'System', darkMode: 'Dark mode', lightMode: 'Light mode',
        topSubtitle: 'Clear intelligence, refined experience', welcomeKicker: 'Qjo Assistant', welcomeTitle: 'How can I <em>help you</em> today?', welcomeText: 'Ask, write, plan, learn, or build something new. Qjo is designed to give clear, practical answers without unnecessary complexity.',
        suggest1Title: 'Suggest a project idea', suggest1Text: 'Practical ideas with clear first steps.', suggest2Title: 'Organize my day', suggest2Text: 'A concise plan to help prioritize quickly.', suggest3Title: 'Explain a concept', suggest3Text: 'A clear, simple explanation of any topic.',
        placeholder: 'Message Qjo...', normal: 'Flash', advanced: 'Max', modeGroup: 'Answer mode', customInstructionsTitle: 'Custom instructions', customInstructionsDesc: 'Standing instructions Qjo follows in every answer — your tone, your field, what to avoid.', customInstructionsBtn: 'Edit custom instructions', flashModeTitle: 'Flash — fast, direct answers', maxModeTitle: 'Max — deeper analysis, higher accuracy', hint: 'Enter to send · Shift + Enter for new line', settingsTitle: 'Settings', close: 'Close', languageTitle: 'Language', languageDesc: 'Choose Qjo interface language.', appearanceTitle: 'Appearance', appearanceDesc: 'Switch between light and dark mode.', toggleAppearance: 'Toggle theme', accountTitle: 'Account', logout: 'Log out', notSigned: 'Not signed in',
        chatsListLabel: 'Chats', sidebarText: 'A smart assistant that helps you think, write, learn, and build with speed and clarity.', logoutDirectBtn: 'Log out', noInternet: 'No internet connection. Sending is temporarily disabled.', statusReading: 'Qjo is reading...', statusThinking: 'Qjo is thinking...', cancelBtn: 'Cancel', searchBtn: 'Search', deepSearchBtn: 'Deep Search', taskBtn: 'Task', reasonBtn: 'Think', attachMenuUpload: 'Upload file', attachMenuDrive: 'Google Drive', attachMenuUi: 'UI Design', attachMenuWeb: 'Read Page', attachMenuChart: 'Chart', attachMenuQuiz: 'Create Quiz', attachMenuSearch: 'Search YouTube', attachMenuTts: 'Smart Voice', qsHeader: 'Shortcuts', soon: 'Soon',
        currentAssistant: 'Current Assistant', showAllChats: 'Show all chats', emptyChats: 'No chats yet', qsparkSoon: 'Q-Spark — Coming soon', qcodeSoon: 'Qcode — Coming soon', defaultUserName: 'User', toggleSidebar: 'Toggle sidebar', exportChat: 'Export chat', scrollToBottom: 'Scroll to bottom', mobileToolsTitle: 'AI Tools & Categories', tools: 'Tools', searchTitle: 'Search the web', deepSearchTitle: 'Deep search', taskModeTitle: 'Task mode', taskModeDesc: 'Run the request over several steps with a plan you can follow', reasonTitle: 'Extended reasoning', attachFile: 'Attach file', sendBtn: 'Send',
        catCode: 'Code Gen', catLaunch: 'Launch App', catUi: 'UI Components', catTheme: 'Themes', catDashboard: 'Dashboard', catLanding: 'Landing Page', catDocs: 'Upload Docs', catAssets: 'Assets', catIdeas: 'Ideas',
        drawerTitle: 'Qjo Tools & Features', drawerBlockAi: 'Active AI Features', drawerBlockCats: 'Categories & Quick Actions',
        allChatsTitle: 'All Chats', searchChats: 'Search chats...', deleteChatPrompt: 'Are you sure you want to delete this chat?', renameChatPrompt: 'Enter new chat title:', chatNotFound: 'This chat does not exist or was deleted.', chatDeleted: 'This chat has been deleted.', renameBtnTitle: 'Rename', deleteBtnTitle: 'Delete chat', noMatchingChats: 'No matching chats found',
        customizationTitle: 'Qjo Customization', customizationDesc: 'These preferences are saved to your account and help Qjo tailor responses.', responseStyle: 'Response Style', styleBalanced: 'Balanced', styleConcise: 'Concise', styleDetailed: 'Detailed', styleFriendly: 'Friendly', styleFormal: 'Formal',
        expertiseLevel: 'Expertise Level', expGeneral: 'General', expBeginner: 'Beginner', expIntermediate: 'Intermediate', expAdvanced: 'Advanced', expExpert: 'Expert', addressingStyle: 'Addressing Style', addrNeutral: 'Neutral', addrMasculine: 'Masculine', addrFeminine: 'Feminine',
        interestsLabel: 'Your interests or fields', interestsPlaceholder: 'e.g. coding, math, AI, business...', notesLabel: 'Personal notes for Qjo', notesPlaceholder: 'e.g. prefer structured tables, concise answers...', savePreferences: 'Save Preferences',
        memoryTitle: 'Qjo Local Memory', memoryDesc: 'Your local corrections and instructions saved on this device. You can review or clear them.', refreshMemory: 'Refresh Memory', clearMemory: 'Clear Local Memory',
        authTitle: 'Sign in to Qjo', authSub: 'Sign in to save your chats and access all features.', authOrEmail: 'or with email', authEmailLabel: 'Email address', authPasswordLabel: 'Password', authRemember: 'Remember me on this device', authLoginBtn: 'Sign In', authSignupBtn: 'Create New Account', authNote: 'Qjo keeps your sessions secure and protected.',
        authHeroTitle: 'Think deeply.<br>Create without limits.<br><span>Achieve with super intelligence.</span>', authHeroDesc: 'The integrated workspace for developers and creators. Blazing speed, exceptional precision, and advanced tools elevating your productivity.', authHeroQuote: '“True creativity begins when your idea meets the right tool.”',
        avatarTitle: 'Choose Your Avatar', avatarSub: 'Choose a profile avatar, or use your Google profile photo.', avatarMe: 'Me', avatarChooseFav: 'Choose your avatar', avatarUseGoogle: 'Use Google photo', avatarResetInitial: 'Reset to initial',
        reasoning: 'Thought Process', thinking: 'Thinking...', thoughtFor: 'Thought for', reasoningInit: 'Analyzing request and context...', stopGen: 'Generation stopped.', copyCode: 'Copy code', copied: 'Copied!', generatingResponse: 'Generating response...', searchDesc: 'Live info & sources', deepSearchDesc: 'Deep & detailed analysis', reasonDesc: 'Sequential deep reasoning'
      }
    };

    function t(key) {
      return (translations[qjoLanguage] && translations[qjoLanguage][key]) || translations.ar[key] || key;
    }

    function applyLanguage() {
      const tr = translations[qjoLanguage] || translations.ar;
      document.documentElement.lang = tr.lang;
      document.documentElement.dir = tr.dir;
      document.body.dir = tr.dir;
      if (languageSelect) languageSelect.value = qjoLanguage;

      document.querySelectorAll('[data-i18n]').forEach(node => {
        node.textContent = t(node.dataset.i18n);
      });

      document.querySelectorAll('[data-i18n-html]').forEach(node => {
        node.innerHTML = t(node.dataset.i18nHtml);
      });

      document.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
        node.placeholder = t(node.dataset.i18nPlaceholder);
      });

      document.querySelectorAll('[data-i18n-title]').forEach(node => {
        node.title = t(node.dataset.i18nTitle);
      });

      document.querySelectorAll('[data-i18n-aria-label]').forEach(node => {
        node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
      });

      const map = [
        ['newChatText', 'newChat'], ['themeToggleBtnText', qjoTheme === 'dark' ? 'lightMode' : 'darkMode'], ['topSubtitle', 'topSubtitle'],
        ['welcomeKicker', 'welcomeKicker'], ['welcomeTitle', 'welcomeTitle'], ['welcomeText', 'welcomeText'],
        ['suggest1Title', 'suggest1Title'], ['suggest1Text', 'suggest1Text'], ['suggest2Title', 'suggest2Title'], ['suggest2Text', 'suggest2Text'], ['suggest3Title', 'suggest3Title'], ['suggest3Text', 'suggest3Text'],
        ['normalModeText', 'normal'], ['advancedModeText', 'advanced'], ['codeModeText', 'code'], ['modeCurrentText', qjoMode === 'code' ? 'code' : (qjoMode === 'advanced' ? 'advanced' : 'normal')], ['hintText', 'hint']
      ];
      const RICH_TEXT_IDS = new Set(['welcomeTitle', 'authHeroTitle']);
      map.forEach(([id, key]) => {
        const node = document.getElementById(id);
        if (!node) return;
        if (RICH_TEXT_IDS.has(id)) node.innerHTML = t(key);
        else node.textContent = t(key);
      });

      if (inputEl) {
        inputEl.placeholder = (typeof busy !== 'undefined' && busy) ? t('generatingResponse') : t('placeholder');
      }

      if (settingsAccountEmail && currentUser) settingsAccountEmail.textContent = currentUser.email || currentUser.displayName || t('notSigned');
      else if (settingsAccountEmail) settingsAccountEmail.textContent = t('notSigned');

      // Update select option labels
      const toneMap = { balanced: 'styleBalanced', concise: 'styleConcise', detailed: 'styleDetailed', friendly: 'styleFriendly', formal: 'styleFormal' };
      const expMap = { general: 'expGeneral', beginner: 'expBeginner', intermediate: 'expIntermediate', advanced: 'expAdvanced', expert: 'expExpert' };
      const addrMap = { neutral: 'addrNeutral', masculine: 'addrMasculine', feminine: 'addrFeminine' };

      const updateSelectOptions = (selId, optMap) => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        Array.from(sel.options).forEach(opt => {
          if (optMap[opt.value]) opt.textContent = t(optMap[opt.value]);
        });
      };
      updateSelectOptions('prefTone', toneMap);
      updateSelectOptions('prefExpertise', expMap);
      updateSelectOptions('prefAddressing', addrMap);

      // Re-render chat list to update default titles and action titles
      if (typeof allChatsCache !== 'undefined' && typeof renderChatList === 'function') {
        renderChatList(allChatsCache);
      }

      // Update quick categories active header
      const qsHeader = document.getElementById('qsHeader');
      if (qsHeader) qsHeader.textContent = t('qsHeader');
    }

    function setLanguage(lang) {
      qjoLanguage = lang === 'en' ? 'en' : 'ar';
      writeStored(LANGUAGE_KEY, qjoLanguage);
      applyLanguage();
    }

    function updateModeUI() {
      const isMax = qjoMode === 'advanced';
      if (normalModeBtn) {
        normalModeBtn.classList.toggle('active', !isMax);
        normalModeBtn.setAttribute('aria-checked', !isMax ? 'true' : 'false');
      }
      if (advancedModeBtn) {
        advancedModeBtn.classList.toggle('active', isMax);
        advancedModeBtn.setAttribute('aria-checked', isMax ? 'true' : 'false');
      }
      // Lets CSS react to the active mode without another class hook.
      document.body.dataset.qjoMode = qjoMode;
    }


    // Q-Spark and Qcode moved to their own repos and ship after the Qjo launch.
    // Their sidebar entries stay visible with a "Soon" badge, so a click must be
    // an explicit no-op rather than a navigation to a page that no longer exists.
    const QJO_APPS_COMING_SOON = new Set(['qspark', 'qcode']);

    function setMode(mode) {
      const nextMode = ['normal', 'advanced'].includes(mode) ? mode : 'normal';
      qjoMode = nextMode;
      writeStored(MODE_KEY, qjoMode);
      updateModeUI();
    }

    function setActivationStatus(status, text) {
      activationPill.classList.remove('active', 'checking', 'bad');
      if (status) activationPill.classList.add(status);
      activationPill.textContent = text;
    }

    function updateRuntimeStatus() {
      runtimeStatus.textContent = 'تشغيل الذكاء الاصطناعي يتم عبر الخادم الآمن. لا يتم حفظ رمز التشغيل في المتصفح.';
      setActivationStatus('active', 'آمن');
    }


    function updateTrainingStatus() {
      const count = qjoTraining.trim().length;
      trainingStatus.textContent = count ? 'يوجد تدريب محفوظ: ' + count + ' حرف.' : 'لا يوجد تدريب محفوظ بعد.';
    }

    function closeSettings() {
      settingsModal.classList.remove('show');
      settingsModal.setAttribute('aria-hidden', 'true');
      runtimeTokenInput.value = '';
    }

    function openTraining() {
      trainingText.value = qjoTraining;
      updateTrainingStatus();
      trainingModal.classList.add('show');
      trainingModal.setAttribute('aria-hidden', 'false');
    }

    function closeTraining() {
      trainingModal.classList.remove('show');
      trainingModal.setAttribute('aria-hidden', 'true');
    }


    function isUnsafeLearningNote(note) {
      const text = String(note || '').toLowerCase();
      const blockedPatterns = [
        'ignore previous', 'ignore all previous', 'ignore system', 'forget instructions', 'bypass', 'jailbreak',
        'reveal prompt', 'system prompt', 'developer message', 'hidden instruction', 'api key', 'private key',
        'password', 'token', 'secret', 'disable safety', 'no safety', 'remove safety', 'always obey',
        'pretend you are', 'you are not qjo', 'change your name', 'be chatgpt', 'be gemini', 'be claude',
        'malware', 'phishing', 'steal', 'hack', 'exploit', 'ransomware', 'credential', 'bomb', 'weapon',
        'self harm', 'suicide', 'harm children', 'minor sexual', 'always lie', 'invent facts', 'never refuse',
        'لا ترفض', 'اكشف', 'اكشف البرومبت', 'انسى التعليمات', 'تجاهل التعليمات', 'عطل الأمان', 'بدون أمان',
        'سرقة', 'اختراق', 'برمج فيروس', 'اصنع سلاح', 'كلمة السر', 'مفتاح api', 'غير اسمك'
      ];
      return blockedPatterns.some(pattern => text.includes(pattern));
    }

    function saveLearningNote(note) {
      const clean = String(note || '').trim();
      if (!clean) return false;
      if (isUnsafeLearningNote(clean)) return false;
      qjoLearning.push(clean.slice(0, 600));
      qjoLearning = qjoLearning.slice(-80);
      writeStored(LEARNING_KEY, JSON.stringify(qjoLearning));
      return true;
    }

    function renderMemoryList() {
      if (!memoryList) return;
      memoryList.innerHTML = '';
      const notes = Array.isArray(qjoLearning) ? qjoLearning : [];
      if (!notes.length) {
        memoryList.innerHTML = '<div class="empty-memory">لا توجد ذاكرة محلية محفوظة بعد.</div>';
        return;
      }
      notes.slice().reverse().forEach((note, index) => {
        const item = document.createElement('div');
        item.className = 'memory-item';
        const text = document.createElement('div');
        text.textContent = note;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'حذف';
        btn.addEventListener('click', () => {
          const originalIndex = notes.length - 1 - index;
          qjoLearning.splice(originalIndex, 1);
          writeStored(LEARNING_KEY, JSON.stringify(qjoLearning));
          renderMemoryList();
        });
        item.appendChild(text);
        item.appendChild(btn);
        memoryList.appendChild(item);
      });
    }

    function clearLocalMemory() {
      if (!confirm('هل تريد مسح ذاكرة Qjo المحلية على هذا الجهاز؟')) return;
      qjoLearning = [];
      dropStored(LEARNING_KEY);
      renderMemoryList();
      if (preferencesStatus) preferencesStatus.textContent = 'تم مسح الذاكرة المحلية.';
    }

    // Returns whether the note was stored, so the caller can report the outcome
    // rather than leaving the user guessing after a silent rejection.
    function teachFromMessage(messageText) {
      const note = prompt(qjoLanguage === 'ar'
        ? 'اكتب القاعدة أو التصحيح الذي تريد أن يتذكره Qjo. أي محتوى يخالف الأمان أو يحاول تغيير هوية Qjo سيُرفض:'
        : 'Write the rule or correction you want Qjo to remember. Anything unsafe or aimed at changing Qjo\'s identity is rejected:');
      if (!note || !note.trim()) return false;
      const context = messageText ? `تصحيح على رد سابق: ${note.trim()}` : note.trim();
      return saveLearningNote(context);
    }

    async function copyTextToClipboard(text) {
      try {
        await navigator.clipboard.writeText(String(text || ''));
        return true;
      } catch (_) {
        const area = document.createElement('textarea');
        area.value = String(text || '');
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
      }
    }

    function extensionForLang(lang) {
      const map = {
        js: 'js', javascript: 'js', jsx: 'jsx', ts: 'ts', typescript: 'ts', tsx: 'tsx',
        html: 'html', css: 'css', scss: 'scss', json: 'json', python: 'py', py: 'py',
        node: 'js', bash: 'sh', shell: 'sh', sh: 'sh', sql: 'sql', md: 'md', markdown: 'md',
        yaml: 'yml', yml: 'yml', dockerfile: 'Dockerfile', env: 'env', text: 'txt'
      };
      return map[String(lang || '').toLowerCase()] || 'txt';
    }

    function cleanCodeFenceInfo(info) {
      return String(info || '').trim().replace(/^language-/, '');
    }

    function inferFilePathFromContext(before, info, index, codeSnippet) {
      const cleanedInfo = cleanCodeFenceInfo(info);
      if (cleanedInfo.includes(':')) {
        const afterColon = cleanedInfo.split(':').slice(1).join(':').trim();
        if (afterColon && (afterColon.includes('.') || afterColon.includes('/'))) return afterColon;
      }
      const pathFromInfo = cleanedInfo.match(/(?:path|file|filename)=([^\s`]+)|^([\w@./-]+\.[a-zA-Z0-9]+)$/);
      if (pathFromInfo) return (pathFromInfo[1] || pathFromInfo[2] || '').trim();
      if (codeSnippet) {
        const firstLine = String(codeSnippet).trim().split('\n')[0] || '';
        const mCode = firstLine.match(/^(?:\/\/|#|\/\*)\s*(?:path|file|filepath):\s*`?([^\s`*]+)/i);
        if (mCode && mCode[1]) return mCode[1].trim();
      }
      const lines = String(before || '').split('\n').slice(-5).reverse();
      for (const line of lines) {
        const m = line.match(/(?:^|[#*\-\s`])(?:file|path|ملف)?\s*[:：]?\s*`?([\w@./-]+\.[a-zA-Z0-9]+)`?\s*$/i);
        if (m) return m[1];
      }
      const baseLang = cleanedInfo.split(':')[0].trim();
      const ext = extensionForLang(baseLang);
      return ext === 'Dockerfile' ? `Dockerfile-${index + 1}` : `snippet-${index + 1}.${ext}`;
    }

    function extractProjectFiles(markdown) {
      const text = String(markdown || '');
      const files = [];
      const regex = /```([^\n`]*)\n?([\s\S]*?)```/g;
      let match;
      while ((match = regex.exec(text)) && files.length < 80) {
        const before = text.slice(Math.max(0, match.index - 300), match.index);
        const path = inferFilePathFromContext(before, match[1], files.length, match[2]);
        const content = String(match[2] || '').replace(/^\n/, '').trimEnd();
        if (!content.trim()) continue;
        files.push({ path, content });
      }
      return files;
    }

    async function downloadCodeZip(files) {
      return postForDownload('/api/export/code-zip', { files }, 'qjo-code-project.zip');
    }

    // All export endpoints sit behind verifyFirebaseRequest, so the token has to
    // travel with the request; none of these calls used to send it. Returns a
    // boolean so the caller can surface a failure inline instead of an alert().
    async function postForDownload(endpoint, payload, filename) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (auth && auth.currentUser) headers.Authorization = 'Bearer ' + await auth.currentUser.getIdToken();
        const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (!res.ok) return false;
        const blob = await res.blob();
        if (!blob || blob.size === 0) return false;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoked on the next frame: revoking synchronously can cancel the
        // download before the browser has read the blob.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
      } catch (_) {
        return false;
      }
    }

    const EXPORT_ENDPOINTS = {
      pdf: '/api/export/pdf',
      pptx: '/api/export/pptx',
      docx: '/api/export/docx'
    };

    async function downloadExport(format, title, content) {
      const endpoint = EXPORT_ENDPOINTS[format];
      if (!endpoint) return false;
      const safeName = String(title || 'qjo-export').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'qjo-export';
      return postForDownload(endpoint, { title, content, rtl: qjoLanguage === 'ar' }, `${safeName}.${format}`);
    }

    function appendSourceCards(messageWrap, sources) {
      const cleanSources = (Array.isArray(sources) ? sources : [])
        .filter(s => s && s.url && /^https?:\/\//i.test(s.url))
        .slice(0, 8);
      if (!messageWrap || !cleanSources.length) return;

      const box = document.createElement('div');
      box.className = 'source-cards';
      const title = document.createElement('div');
      title.className = 'source-cards-title';
      title.textContent = qjoLanguage === 'ar' ? 'المصادر' : 'Sources';
      box.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'source-cards-grid';
      cleanSources.forEach((source, index) => {
        const link = document.createElement('a');
        link.className = 'source-card';
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const label = source.domain || sourceDomain(source.url) || 'source';
        link.innerHTML = `<span class="source-index">${source.id || index + 1}</span><span class="source-main"><strong>${escapeHtml(source.title || label)}</strong><small>${escapeHtml(label)} · ${escapeHtml(source.kind || 'web')}</small></span>`;
        grid.appendChild(link);
      });
      box.appendChild(grid);
      messageWrap.appendChild(box);
    }

    // Shows a small "the model itself searched/calculated" note whenever
    // callAIRouter's tool loop actually ran web_search/calculate — makes it
    // visible that search happened even when the client's own pre-search
    // heuristic (needsWebSearch) didn't trigger it.
    function appendToolsUsedNote(messageWrap, toolsUsed) {
      if (!messageWrap || !Array.isArray(toolsUsed) || !toolsUsed.length) return;
      const searched = toolsUsed.filter(t => t && t.tool === 'web_search');
      const calculated = toolsUsed.filter(t => t && t.tool === 'calculate');
      const parts = [];
      if (searched.length) {
        const queries = searched.map(s => `"${String(s.input || '').slice(0, 80)}"`).join('، ');
        parts.push(qjoLanguage === 'ar' ? `🔍 بحث الموديل بنفسه عن ${queries}` : `🔍 The model searched the web for ${queries}`);
      }
      if (calculated.length) {
        const exprs = calculated.map(c => String(c.input || '').slice(0, 60)).join('، ');
        parts.push(qjoLanguage === 'ar' ? `🧮 حسِب: ${exprs}` : `🧮 Calculated: ${exprs}`);
      }
      if (!parts.length) return;
      const note = document.createElement('div');
      note.className = 'tools-used-note';
      note.style.cssText = 'font-size:12px;opacity:.65;margin-top:6px;line-height:1.6;';
      note.textContent = parts.join('  •  ');
      messageWrap.appendChild(note);
    }

    function shouldShowRichExports(content) {
      const text = String(content || '');
      if (text.length >= 420) return true;
      if (/```|^#{1,4}\s|\n\s*[-*]\s|\n\|.+\|\n\|?\s*:?-{3,}/m.test(text)) return true;
      return false;
    }


    // ── Answer actions ───────────────────────────────────────────────────────
    // These back the toolbar under each assistant answer. They existed as
    // unreferenced functions (sendFeedback, downloadExport, downloadCodeZip,
    // teachFromMessage) while the toolbar showed decorative buttons instead, so
    // the export endpoints and the feedback store were never reachable from the
    // UI at all.

    // Re-asks the previous question and replaces the answer in place. Drops the
    // stale assistant turn from history first, otherwise the model sees its own
    // rejected answer as context and tends to repeat it.
    function regenerateLastAnswer(answerWrap) {
      if (busy) return;
      const lastUserIndex = [...history].reverse().findIndex(m => m?.role === 'user');
      if (lastUserIndex === -1) return;
      const absoluteIndex = history.length - 1 - lastUserIndex;
      const question = history[absoluteIndex]?.content;
      if (typeof question !== 'string' || !question.trim()) return;

      // Everything from the question onward is replayed, so it must not remain.
      history.splice(absoluteIndex);
      if (answerWrap && answerWrap.parentNode) answerWrap.remove();

      sendMessage(question, { isRegenerate: true });
    }

    async function submitAnswerFeedback(rating, answerText) {
      try {
        const lastUser = [...history].reverse().find(m => m.role === 'user')?.content || '';
        const response = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating,
            answer: String(answerText || '').slice(0, 6000),
            question: typeof lastUser === 'string' ? lastUser.slice(0, 2000) : '',
            mode: qjoMode,
            route: 'qjo-assistant'
          })
        });
        return response.ok;
      } catch (_) {
        return false;
      }
    }

    // Robust relaxed JSON parser for interactive charts, quizzes, and LLM payloads
    function safeParseRelaxedJson(rawStr) {
      if (!rawStr || typeof rawStr !== 'string') return null;
      let str = rawStr
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .trim();

      str = str.replace(/^```[a-z0-9_-]*\s*/i, '').replace(/```\s*$/i, '').trim();

      // 1. Direct standard parse
      try {
        return JSON.parse(str);
      } catch (_) {}

      // 2. Remove comments & fix trailing commas
      let cleaned = str.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

      // 3. Fix invalid backslash escapes (e.g. \-, \e, \^, \(, \), \ )
      cleaned = cleaned.replace(/\\([^"\\\/bfnrtu]|u(?!([0-9a-fA-F]{4})))/g, '\\\\$1');

      try {
        return JSON.parse(cleaned);
      } catch (_) {}

      // 4. Fallback: parse via JavaScript object evaluator (handles single quotes, unquoted keys, math symbols)
      try {
        const fn = new Function('"use strict"; return (' + cleaned + ')');
        const res = fn();
        if (res && typeof res === 'object') return res;
      } catch (_) {}

      // 5. Try extracting outermost { ... } or [ ... ]
      const objMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (objMatch) {
        try {
          return JSON.parse(objMatch[0]);
        } catch (_) {
          try {
            const fn = new Function('"use strict"; return (' + objMatch[0] + ')');
            const res = fn();
            if (res && typeof res === 'object') return res;
          } catch (_) {}
        }
      }

      return null;
    }

    function initializeChartsInElement(element) {
      if (typeof Chart === 'undefined') {
        console.warn('Chart.js is not loaded yet.');
        setTimeout(() => initializeChartsInElement(element), 500);
        return;
      }
      const containers = element.querySelectorAll('.interactive-chart-container');
      containers.forEach(container => {
        if (container.dataset.chartRendered === 'true') return;
        const canvas = container.querySelector('canvas');
        if (!canvas) return;
        const card = container.closest('.interactive-chart-card') || container;
        const errorEl = card.querySelector('.chart-error-note') || container.querySelector('.chart-error-note');
        try {
          // decodeURIComponent throws URIError on a malformed escape, and this
          // call used to sit outside the try — so a single bad chart payload
          // threw out of the whole render pass.
          const configRaw = decodeURIComponent(container.dataset.chartConfig || '{}');
          let config = safeParseRelaxedJson(configRaw);
          if (!config || typeof config !== 'object') {
            throw new Error('صيغة بيانات المخطط غير صالحة.');
          }

          // Clean LaTeX formatting in titles, dataset labels, and tooltips
          const cleanChartString = (str) => {
            if (typeof str !== 'string') return str;
            return str
              .replace(/\$([^\$]+)\$/g, '$1')
              .replace(/\\(exp|ln|log|sin|cos|tan|times|cdot|approx|pm)/gi, '$1')
              .replace(/\\([a-zA-Z]+)/g, '$1')
              .replace(/[\{\}]/g, '')
              .trim();
          };
          
          // Detect and convert simplified user schema to Chart.js standard format
          if (config.data && Array.isArray(config.data) && !config.data.datasets && (config.xKey || config.yKey || (config.data[0] && typeof config.data[0] === 'object'))) {
            const xKey = config.xKey || 'label';
            const yKey = config.yKey || 'value';
            const labels = config.data.map(item => item[xKey]);
            const values = config.data.map(item => item[yKey]);
            config = {
              type: config.type || 'bar',
              data: {
                labels: labels,
                datasets: [{
                  label: config.title || 'Data',
                  data: values
                }]
              },
              options: {
                plugins: {
                  title: {
                    display: !!config.title,
                    text: config.title
                  }
                }
              }
            };
          }

          if (config.title) config.title = cleanChartString(config.title);

          const isDark = (typeof qjoTheme !== 'undefined' ? qjoTheme : 'light') === 'dark';
          const chartThemeColor = isDark ? '#38C7DD' : '#0ea5e9';
          const textThemeColor = isDark ? '#F8FAFC' : '#1e293b';
          const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
          
          if (config.data && Array.isArray(config.data.labels)) {
            config.data.labels = config.data.labels.map(lbl => {
              if (typeof lbl === 'string') return cleanChartString(lbl);
              return lbl;
            });
          }

          if (config.data && Array.isArray(config.data.datasets)) {
            config.data.datasets.forEach((dataset, index) => {
              if (dataset.label) dataset.label = cleanChartString(dataset.label);
              if (!dataset.backgroundColor) {
                dataset.backgroundColor = index === 0 ? 'rgba(6, 182, 212, 0.22)' : 'rgba(139, 92, 246, 0.22)';
              }
              if (!dataset.borderColor) {
                dataset.borderColor = index === 0 ? '#06b6d4' : '#8b5cf6';
              }
              dataset.borderWidth = dataset.borderWidth || 2.5;
              if (config.type === 'line' || !config.type) {
                if (dataset.tension === undefined) dataset.tension = 0.35;
                if (dataset.pointRadius === undefined) dataset.pointRadius = 4;
                if (dataset.pointHoverRadius === undefined) dataset.pointHoverRadius = 6;
                if (dataset.pointBackgroundColor === undefined) dataset.pointBackgroundColor = dataset.borderColor;
              }
            });
          }
          
          config.options = config.options || {};
          config.options.responsive = true;
          config.options.maintainAspectRatio = false;
          config.options.resizeDelay = 150; // Critical: debounces ResizeObserver to prevent any CPU spikes or infinite loops
          config.options.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2); // HD retina crisp without memory bloat
          
          config.options.animation = {
            duration: 400,
            easing: 'easeOutQuart'
          };
          
          config.options.plugins = config.options.plugins || {};
          config.options.plugins.legend = config.options.plugins.legend || {};
          config.options.plugins.legend.labels = config.options.plugins.legend.labels || {};
          config.options.plugins.legend.labels.color = textThemeColor;
          config.options.plugins.legend.labels.font = {
            family: "'IBM Plex Sans Arabic', 'Inter', sans-serif",
            size: 12
          };
          
          if (config.options.plugins.title) {
            if (config.options.plugins.title.text) {
              config.options.plugins.title.text = cleanChartString(config.options.plugins.title.text);
            }
            config.options.plugins.title.color = textThemeColor;
            config.options.plugins.title.font = {
              family: "'IBM Plex Sans Arabic', 'Inter', sans-serif",
              size: 13,
              weight: '600'
            };
          }
          
          config.options.scales = config.options.scales || {};
          ['x', 'y'].forEach(axis => {
            if (config.type === 'pie' || config.type === 'doughnut' || config.type === 'polarArea' || config.type === 'radar') return;
            config.options.scales[axis] = config.options.scales[axis] || {};
            config.options.scales[axis].grid = config.options.scales[axis].grid || {};
            config.options.scales[axis].grid.color = gridColor;
            config.options.scales[axis].ticks = config.options.scales[axis].ticks || {};
            config.options.scales[axis].ticks.color = textThemeColor;
            config.options.scales[axis].ticks.font = {
              family: "'JetBrains Mono', 'IBM Plex Sans Arabic', sans-serif",
              size: 11
            };
            if (axis === 'x') {
              const prevCb = config.options.scales.x.ticks.callback;
              config.options.scales.x.ticks.callback = function(val, idx, ticks) {
                let text = prevCb ? prevCb.call(this, val, idx, ticks) : this.getLabelForValue(val);
                if (typeof text === 'string') {
                  text = cleanChartString(text);
                  // Ensure negative numbers don't reverse to '5-' in RTL context
                  if (/^-|\d/.test(text)) return '\u200E' + text;
                }
                return text;
              };
            }
          });

          // Clean up old instance if any
          const oldChart = Chart.getChart(canvas);
          if (oldChart) {
            oldChart.destroy();
          }
          
          new Chart(canvas, config);
          container.dataset.chartRendered = 'true';
        } catch (error) {
          console.error('Failed to parse or build interactive chart:', error);
          if (errorEl) {
            errorEl.textContent = `فشل رسم المخطط التفاعلي: ${error.message}`;
            errorEl.classList.remove('hidden');
          }
        }
      });
    }

    function initializeCodeBlockCopyButtons(element) {
      if (!element) return;
      element.querySelectorAll('.copy-code-btn').forEach(btn => {
        if (btn.dataset.initialized) return;
        btn.dataset.initialized = 'true';
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          try {
            const rawCode = decodeURIComponent(btn.dataset.code || '');
            const ok = await copyTextToClipboard(rawCode);
            const span = btn.querySelector('span');
            if (ok && span) {
              const origText = span.textContent;
              span.textContent = qjoLanguage === 'ar' ? 'تم النسخ ✓' : 'Copied ✓';
              btn.classList.add('copied');
              setTimeout(() => {
                span.textContent = origText;
                btn.classList.remove('copied');
              }, 1800);
            }
          } catch (err) {
            console.warn('Copy code failed:', err);
          }
        });
      });
      initializePythonRunButtons(element);
      initializeJsRunButtons(element);
      initializeCodeViewToggles(element);
      initializeLivePreviewTabs(element);
    }

    function initializeLivePreviewTabs(element) {
      if (!element) return;

      element.querySelectorAll('.code-tab-btn').forEach(tabBtn => {
        if (tabBtn.dataset.initialized) return;
        tabBtn.dataset.initialized = 'true';

        tabBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const wrapper = tabBtn.closest('.code-block-wrapper');
          if (!wrapper) return;

          const tabType = tabBtn.dataset.tab;
          wrapper.querySelectorAll('.code-tab-btn').forEach(b => b.classList.remove('active'));
          tabBtn.classList.add('active');

          const codePre = wrapper.querySelector('pre');
          const previewContainer = wrapper.querySelector('.live-preview-container');
          const expandBtn = wrapper.querySelector('.preview-expand-btn');

          if (tabType === 'preview') {
            if (codePre) codePre.classList.add('hidden');
            if (previewContainer) {
              previewContainer.classList.remove('hidden');
              const iframe = previewContainer.querySelector('.live-preview-iframe');
              if (iframe && !iframe.srcdoc) {
                const rawCode = decodeURIComponent(previewContainer.dataset.code || '');
                iframe.srcdoc = buildPreviewHtml(rawCode);
              }
            }
            if (expandBtn) expandBtn.classList.remove('hidden');
          } else {
            if (codePre) codePre.classList.remove('hidden');
            if (previewContainer) previewContainer.classList.add('hidden');
            if (expandBtn) expandBtn.classList.add('hidden');
          }
        });
      });

      element.querySelectorAll('.preview-size-btn').forEach(sizeBtn => {
        if (sizeBtn.dataset.initialized) return;
        sizeBtn.dataset.initialized = 'true';

        sizeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const previewContainer = sizeBtn.closest('.live-preview-container');
          if (!previewContainer) return;

          const size = sizeBtn.dataset.size;
          previewContainer.querySelectorAll('.preview-size-btn').forEach(b => b.classList.remove('active'));
          sizeBtn.classList.add('active');

          const viewport = previewContainer.querySelector('.preview-viewport');
          if (viewport) {
            viewport.classList.toggle('mobile-view', size === 'mobile');
            viewport.classList.toggle('desktop-view', size !== 'mobile');
          }
        });
      });

      element.querySelectorAll('.preview-reload-btn').forEach(reloadBtn => {
        if (reloadBtn.dataset.initialized) return;
        reloadBtn.dataset.initialized = 'true';

        reloadBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const previewContainer = reloadBtn.closest('.live-preview-container');
          if (!previewContainer) return;
          const iframe = previewContainer.querySelector('.live-preview-iframe');
          if (iframe) {
            const rawCode = decodeURIComponent(previewContainer.dataset.code || '');
            iframe.srcdoc = buildPreviewHtml(rawCode);
          }
        });
      });

      element.querySelectorAll('.preview-expand-btn').forEach(expandBtn => {
        if (expandBtn.dataset.initialized) return;
        expandBtn.dataset.initialized = 'true';

        expandBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const wrapper = expandBtn.closest('.code-block-wrapper');
          if (!wrapper) return;
          const previewContainer = wrapper.querySelector('.live-preview-container');
          if (!previewContainer) return;

          const isFs = previewContainer.classList.toggle('is-fullscreen');
          document.body.classList.toggle('has-fullscreen-preview', isFs);
          expandBtn.title = isFs
            ? (qjoLanguage === 'ar' ? 'تصغير المعاينة' : 'Minimize preview')
            : (qjoLanguage === 'ar' ? 'تكبير المعاينة' : 'Fullscreen preview');
          expandBtn.innerHTML = isFs
            ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="10" y1="14" x2="3" y2="21"></line></svg>`
            : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
        });
      });
    }

    // ── Pyodide WebAssembly Python Execution Engine ──
    let pyodideInstance = null;
    let pyodideLoadPromise = null;

    async function getPyodideInstance(onStatus) {
      if (pyodideInstance) return pyodideInstance;
      if (pyodideLoadPromise) return pyodideLoadPromise;

      pyodideLoadPromise = (async () => {
        if (typeof loadPyodide === 'undefined') {
          if (onStatus) onStatus(qjoLanguage === 'ar' ? 'تحميل بيئة بايثون (WASM)...' : 'Loading Pyodide WASM...');
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
            s.async = true;
            s.onload = resolve;
            s.onerror = () => reject(new Error(qjoLanguage === 'ar' ? 'فشل تحميل محرك بايثون من CDN. تحقق من اتصال الإنترنت.' : 'Failed to load Pyodide from CDN. Check connection.'));
            document.head.appendChild(s);
          });
        }

        if (onStatus) onStatus(qjoLanguage === 'ar' ? 'تهيئة محرك بايثون...' : 'Initializing Python engine...');
        const py = await loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
        });
        pyodideInstance = py;
        return py;
      })();

      try {
        return await pyodideLoadPromise;
      } catch (err) {
        pyodideLoadPromise = null;
        throw err;
      }
    }

    async function executePythonCodeInSandbox(code, onStatus) {
      const py = await getPyodideInstance(onStatus);
      
      if (onStatus) onStatus(qjoLanguage === 'ar' ? 'تحميل الحزم المستخدمة...' : 'Loading packages...');
      try {
        await py.loadPackagesFromImports(code);
      } catch (pkgErr) {
        console.warn('[Pyodide] package load warning:', pkgErr);
      }

      if (onStatus) onStatus(qjoLanguage === 'ar' ? 'جاري التشغيل...' : 'Running code...');
      
      py.globals.set('__qjo_user_code', code);
      
      const runnerScript = `
import sys
from io import StringIO

__qjo_stdout = StringIO()
__qjo_stderr = StringIO()
__qjo_old_stdout = sys.stdout
__qjo_old_stderr = sys.stderr
sys.stdout = __qjo_stdout
sys.stderr = __qjo_stderr

__qjo_error = None
__qjo_images = []

if 'matplotlib' in __qjo_user_code:
    try:
        import matplotlib
        matplotlib.use('Agg')
    except Exception:
        pass

try:
    __qjo_compiled = compile(__qjo_user_code, '<qjo-sandbox>', 'exec')
    exec(__qjo_compiled, globals())
    
    if 'matplotlib.pyplot' in sys.modules:
        import matplotlib.pyplot as plt
        import base64
        from io import BytesIO
        for fig_num in plt.get_fignums():
            fig = plt.figure(fig_num)
            buf = BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight', dpi=120)
            buf.seek(0)
            __qjo_images.append(base64.b64encode(buf.read()).decode('utf-8'))
            plt.close(fig)
except Exception:
    import traceback
    __qjo_error = traceback.format_exc()
finally:
    sys.stdout = __qjo_old_stdout
    sys.stderr = __qjo_old_stderr

__qjo_out_str = __qjo_stdout.getvalue()
__qjo_err_str = __qjo_stderr.getvalue()
if len(__qjo_out_str) > 40000:
    __qjo_out_str = __qjo_out_str[:40000] + "\\n... [تم اقتطاع باقي المخرجات لتجاوز الحد الأقصى]"
if len(__qjo_err_str) > 20000:
    __qjo_err_str = __qjo_err_str[:20000] + "\\n... [تم اقتطاع رسائل التحذير]"

{
    "stdout": __qjo_out_str,
    "stderr": __qjo_err_str,
    "error": __qjo_error,
    "images": __qjo_images
}
`;

      const startTime = performance.now();
      const pyResult = await py.runPythonAsync(runnerScript);
      const durationMs = Math.round(performance.now() - startTime);
      const result = pyResult.toJs({ dict_converter: Object.fromEntries });
      
      if (pyResult && typeof pyResult.destroy === 'function') {
        try { pyResult.destroy(); } catch (_) {}
      }
      
      return {
        stdout: String(result.stdout || ''),
        stderr: String(result.stderr || ''),
        error: result.error ? String(result.error) : null,
        images: Array.isArray(result.images) ? result.images : [],
        durationMs
      };
    }

    // ── JavaScript sandbox (Web Worker) ──────────────────────────────────
    // The worker runs on its own thread, so user code cannot touch the page's
    // DOM, and an infinite loop blocks only the worker — the watchdog below
    // terminates it instead of freezing the tab. The worker is built from a
    // blob: URL, which the app's CSP allows via `worker-src 'self' blob:`.
    const JS_SANDBOX_TIMEOUT_MS = 5000;

    const JS_WORKER_SOURCE = `
      self.onmessage = function (event) {
        var logs = [];
        var MAX_ENTRIES = 300;

        function format(value, depth) {
          depth = depth || 0;
          if (value === null) return 'null';
          if (value === undefined) return 'undefined';
          var type = typeof value;
          if (type === 'string') return depth === 0 ? value : JSON.stringify(value);
          if (type === 'number' || type === 'boolean') return String(value);
          if (type === 'function') return '[Function: ' + (value.name || 'anonymous') + ']';
          if (type === 'symbol' || type === 'bigint') return String(value);
          if (value instanceof Error) return value.name + ': ' + value.message;
          try {
            var seen = new WeakSet();
            return JSON.stringify(value, function (key, val) {
              if (typeof val === 'object' && val !== null) {
                if (seen.has(val)) return '[Circular]';
                seen.add(val);
              }
              if (typeof val === 'function') return '[Function: ' + (val.name || 'anonymous') + ']';
              if (typeof val === 'bigint') return String(val);
              return val;
            }, 2);
          } catch (e) {
            return String(value);
          }
        }

        function push(kind, args) {
          if (logs.length >= MAX_ENTRIES) return;
          logs.push({ kind: kind, text: args.map(function (a) { return format(a, 0); }).join(' ') });
        }

        // console.table renders as aligned columns, matching the browser.
        function renderTable(data) {
          if (data === null || typeof data !== 'object') return format(data, 0);
          var isArray = Array.isArray(data);
          var rowKeys = isArray ? data.map(function (_, i) { return String(i); }) : Object.keys(data);
          var columns = [];
          var primitiveOnly = true;
          rowKeys.forEach(function (rk) {
            var row = isArray ? data[Number(rk)] : data[rk];
            if (row !== null && typeof row === 'object') {
              primitiveOnly = false;
              Object.keys(row).forEach(function (c) {
                if (columns.indexOf(c) === -1) columns.push(c);
              });
            }
          });
          if (primitiveOnly) columns = ['Values'];
          var header = ['(index)'].concat(columns);
          var body = rowKeys.map(function (rk) {
            var row = isArray ? data[Number(rk)] : data[rk];
            var cells = columns.map(function (c) {
              if (primitiveOnly) return format(row, 1);
              if (row === null || typeof row !== 'object') return '';
              return Object.prototype.hasOwnProperty.call(row, c) ? format(row[c], 1) : '';
            });
            return [rk].concat(cells);
          });
          var widths = header.map(function (h, i) {
            return Math.max(String(h).length, body.reduce(function (m, r) {
              return Math.max(m, String(r[i] === undefined ? '' : r[i]).length);
            }, 0));
          });
          function line(cells) {
            return '| ' + cells.map(function (c, i) {
              return String(c === undefined ? '' : c).padEnd(widths[i]);
            }).join(' | ') + ' |';
          }
          var divider = '|-' + widths.map(function (w) { return '-'.repeat(w); }).join('-|-') + '-|';
          // Escaped: this source lives inside a template literal, so a bare
          // \\n would become a real newline and break the emitted worker.
          return [line(header), divider].concat(body.map(line)).join('\\n');
        }

        self.console = {
          log: function () { push('log', [].slice.call(arguments)); },
          info: function () { push('log', [].slice.call(arguments)); },
          debug: function () { push('log', [].slice.call(arguments)); },
          warn: function () { push('warn', [].slice.call(arguments)); },
          error: function () { push('error', [].slice.call(arguments)); },
          table: function (data) {
            if (logs.length >= MAX_ENTRIES) return;
            logs.push({ kind: 'table', text: renderTable(data) });
          }
        };

        var started = Date.now();
        try {
          var result = (0, eval)(event.data.code);
          if (result !== undefined) {
            logs.push({ kind: 'return', text: format(result, 0) });
          }
          self.postMessage({ ok: true, logs: logs, durationMs: Date.now() - started });
        } catch (error) {
          self.postMessage({
            ok: false,
            logs: logs,
            error: (error && error.stack) ? String(error.stack) : String(error && error.message ? error.message : error),
            durationMs: Date.now() - started
          });
        }
      };
    `;

    // ── TypeScript transpiler (lazy) ─────────────────────────────────────
    // @babel/standalone is 2.3MB against the TypeScript compiler's 8.7MB, and
    // type-stripping is all that is needed to run a snippet — so Babel it is.
    // Loaded only when someone actually clicks Run on a TS block, mirroring how
    // Pyodide is pulled in, and cached for the rest of the session.
    //
    // This is transpile-only: it strips types, it does not type-check. That is
    // the same trade `ts-node --transpileOnly` and esbuild make, and it is why a
    // type error surfaces at runtime here rather than before it.
    const BABEL_STANDALONE_URL = 'https://cdn.jsdelivr.net/npm/@babel/standalone@8.0.5/babel.min.js';
    let babelLoadPromise = null;

    function loadBabelStandalone(onStatus) {
      if (typeof window.Babel !== 'undefined') return Promise.resolve(window.Babel);
      if (babelLoadPromise) return babelLoadPromise;

      babelLoadPromise = new Promise((resolve, reject) => {
        if (onStatus) onStatus(qjoLanguage === 'ar' ? 'تحميل محوّل TypeScript…' : 'Loading TypeScript transpiler…');
        const script = document.createElement('script');
        script.src = BABEL_STANDALONE_URL;
        script.async = true;
        script.onload = () => resolve(window.Babel);
        script.onerror = () => reject(new Error(qjoLanguage === 'ar'
          ? 'فشل تحميل محوّل TypeScript من CDN. تحقق من الاتصال.'
          : 'Failed to load the TypeScript transpiler from CDN. Check your connection.'));
        document.head.appendChild(script);
      }).catch(err => {
        babelLoadPromise = null; // let a later click retry
        throw err;
      });

      return babelLoadPromise;
    }

    async function transpileTypeScript(code, onStatus) {
      const Babel = await loadBabelStandalone(onStatus);
      if (!Babel?.transform) throw new Error('TypeScript transpiler is unavailable.');
      // The .ts filename is what tells the preset to parse types but not JSX.
      return Babel.transform(code, { presets: ['typescript'], filename: 'snippet.ts' }).code;
    }

    // Resolves to { ok, logs, error, durationMs, timedOut }. Never rejects:
    // a failure is data the caller renders, including the auto-fix affordance.
    function executeJavaScriptInSandbox(code) {
      return new Promise((resolve) => {
        let worker = null;
        let blobUrl = '';
        let settled = false;
        let watchdog = null;

        const cleanup = () => {
          if (watchdog) clearTimeout(watchdog);
          try { if (worker) worker.terminate(); } catch (_) { /* already gone */ }
          try { if (blobUrl) URL.revokeObjectURL(blobUrl); } catch (_) { /* ignore */ }
        };

        const finish = (payload) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(payload);
        };

        try {
          blobUrl = URL.createObjectURL(new Blob([JS_WORKER_SOURCE], { type: 'application/javascript' }));
          worker = new Worker(blobUrl);
        } catch (err) {
          finish({ ok: false, logs: [], error: `Sandbox unavailable: ${err?.message || err}`, durationMs: 0 });
          return;
        }

        const startedAt = Date.now();
        worker.onmessage = (event) => finish(event.data);
        worker.onerror = (event) => {
          event.preventDefault?.();
          finish({ ok: false, logs: [], error: event.message || 'Worker error.', durationMs: Date.now() - startedAt });
        };

        watchdog = setTimeout(() => {
          finish({
            ok: false,
            logs: [],
            timedOut: true,
            error: qjoLanguage === 'ar'
              ? `تم إيقاف التنفيذ بعد ${JS_SANDBOX_TIMEOUT_MS / 1000} ثوانٍ. غالبًا يوجد حلقة لا نهائية (Infinite Loop) في الكود.`
              : `Execution halted after ${JS_SANDBOX_TIMEOUT_MS / 1000}s. The code most likely contains an infinite loop.`,
            durationMs: Date.now() - startedAt
          });
        }, JS_SANDBOX_TIMEOUT_MS);

        worker.postMessage({ code });
      });
    }

    // ── Auto-fix: hand a failing snippet + its error straight to Qjo ──────
    // Without this the user has to copy the traceback out of the terminal and
    // retype it. The button composes both sides of the report itself.
    function buildAutoFixPrompt({ language, code, errorText }) {
      const isArabic = qjoLanguage === 'ar';
      const intro = isArabic
        ? `فشل تشغيل كود ${language} التالي عندي. شخّص السبب الجذري بدقة، ثم أعطني الكود كاملاً بعد التصحيح (ملف كامل بدون اختصارات)، وبعدها اشرح سبب الخطأ بجملتين.`
        : `Running the ${language} snippet below failed. Diagnose the root cause precisely, return the FULL corrected code (complete file, no omissions), then explain the cause in two sentences.`;
      const codeLabel = isArabic ? 'الكود:' : 'Code:';
      const errorLabel = isArabic ? 'رسالة الخطأ:' : 'Error output:';
      // The fence tag decides what Qjo hands back, so a TypeScript failure must
      // not be relabelled as JavaScript — the fix would come back untyped.
      const fence = language === 'python' ? 'python' : language === 'typescript' ? 'typescript' : 'javascript';
      return `${intro}\n\n${codeLabel}\n\`\`\`${fence}\n${code}\n\`\`\`\n\n${errorLabel}\n\`\`\`text\n${String(errorText || '').slice(0, 4000)}\n\`\`\``;
    }

    function autoFixButtonHtml() {
      return `
        <button type="button" class="qjo-autofix-btn">
          <span class="qjo-autofix-icon">🛠️</span>
          <span>${qjoLanguage === 'ar' ? 'إصلاح الخطأ تلقائيًا عبر Qjo' : 'Auto-fix this error with Qjo'}</span>
        </button>
      `;
    }

    function wireAutoFixButton(outputEl, { language, code, errorText }) {
      const btn = outputEl?.querySelector('.qjo-autofix-btn');
      if (!btn) return;
      btn.addEventListener('click', () => {
        if (busy) return;
        btn.disabled = true;
        btn.classList.add('sent');
        const span = btn.querySelector('span:last-child');
        if (span) span.textContent = qjoLanguage === 'ar' ? 'تم الإرسال إلى Qjo…' : 'Sent to Qjo…';
        sendMessage(buildAutoFixPrompt({ language, code, errorText }));
      });
    }

    function renderRunTerminal(outputEl, { icon, title, statusText, statusClass, durationMs, bodyContent, autoFix }) {
      outputEl.innerHTML = `
        <div class="python-terminal-header">
          <div class="python-terminal-title">
            <span class="python-terminal-icon">${icon}</span>
            <span>${title}</span>
            <span class="python-terminal-status ${statusClass}">${statusText}</span>
            ${Number.isFinite(durationMs) ? `<span class="python-terminal-time">⏱ ${durationMs}ms</span>` : ''}
          </div>
          <div class="python-terminal-actions">
            <button type="button" class="python-terminal-copy" title="${qjoLanguage === 'ar' ? 'نسخ المخرجات' : 'Copy output'}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button type="button" class="python-terminal-close" title="${qjoLanguage === 'ar' ? 'إغلاق' : 'Close'}">✕</button>
          </div>
        </div>
        ${bodyContent}
        ${autoFix ? autoFixButtonHtml() : ''}
      `;

      const closeBtn = outputEl.querySelector('.python-terminal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          outputEl.classList.add('hidden');
          outputEl.innerHTML = '';
        });
      }
      if (autoFix) wireAutoFixButton(outputEl, autoFix);
      return outputEl;
    }

    // ── Developer affordances: line numbers + focus mode ─────────────────
    // Both are pure presentation toggles on the wrapper. The line numbers are
    // drawn by CSS counters in a gutter, so the <code> text stays exactly what
    // the model produced — copy, ZIP export and the live preview are unaffected.
    let escFocusHandler = null;

    // Wraps each line in its own element so a CSS counter can number it. Done
    // lazily on first toggle, so a block the user never numbers keeps exactly
    // the markup the renderer produced. Uses textContent for both read and
    // write, so the code is never HTML-parsed and nothing can be injected.
    // pre is white-space: pre with horizontal scroll, so lines never wrap and
    // the numbering stays aligned with the source.
    function splitCodeIntoLines(wrapper) {
      const codeEl = wrapper.querySelector('pre > code');
      if (!codeEl) return false;
      if (codeEl.dataset.linesSplit === 'true') return true;

      const lines = codeEl.textContent.split('\n');
      const fragment = document.createDocumentFragment();
      lines.forEach((line, index) => {
        const span = document.createElement('span');
        span.className = 'qjo-code-line';
        // A zero-width space keeps an empty line from collapsing to zero
        // height, which would desynchronise the gutter from the code.
        span.textContent = line || '\u200b';
        fragment.appendChild(span);
        if (index < lines.length - 1) fragment.appendChild(document.createTextNode('\n'));
      });

      codeEl.textContent = '';
      codeEl.appendChild(fragment);
      codeEl.dataset.linesSplit = 'true';
      return true;
    }

    function exitCodeFocus() {
      document.querySelectorAll('.code-block-wrapper.is-code-focused').forEach(w => {
        w.classList.remove('is-code-focused');
      });
      document.body.classList.remove('has-focused-code');
      if (escFocusHandler) {
        document.removeEventListener('keydown', escFocusHandler);
        escFocusHandler = null;
      }
    }

    function initializeCodeViewToggles(element) {
      if (!element) return;

      element.querySelectorAll('.toggle-linenums-btn').forEach(btn => {
        if (btn.dataset.initialized) return;
        btn.dataset.initialized = 'true';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const wrapper = btn.closest('.code-block-wrapper');
          if (!wrapper) return;
          if (!splitCodeIntoLines(wrapper)) return;
          const on = wrapper.classList.toggle('show-line-numbers');
          btn.classList.toggle('active', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      });

      element.querySelectorAll('.code-focus-btn').forEach(btn => {
        if (btn.dataset.initialized) return;
        btn.dataset.initialized = 'true';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const wrapper = btn.closest('.code-block-wrapper');
          if (!wrapper) return;
          const entering = !wrapper.classList.contains('is-code-focused');
          exitCodeFocus(); // only ever one focused block at a time
          if (!entering) return;

          wrapper.classList.add('is-code-focused');
          document.body.classList.add('has-focused-code');
          escFocusHandler = (ev) => { if (ev.key === 'Escape') exitCodeFocus(); };
          document.addEventListener('keydown', escFocusHandler);
        });
      });
    }

    function initializeJsRunButtons(element) {
      if (!element) return;
      element.querySelectorAll('.run-js-btn').forEach(btn => {
        if (btn.dataset.initialized) return;
        btn.dataset.initialized = 'true';

        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const rawCode = decodeURIComponent(btn.dataset.code || '');
          const outputEl = btn.dataset.target ? document.getElementById(btn.dataset.target) : null;
          if (!rawCode || !outputEl) return;

          const isTypeScript = btn.dataset.lang === 'typescript';
          const runSpinner = btn.querySelector('.run-spinner');
          const runIcon = btn.querySelector('.run-icon');
          const runLabel = btn.querySelector('.run-label');

          btn.disabled = true;
          if (runSpinner) runSpinner.classList.remove('hidden');
          if (runIcon) runIcon.classList.add('hidden');

          outputEl.classList.remove('hidden');
          outputEl.innerHTML = `
            <div class="python-terminal-loading">
              <span class="run-spinner"></span>
              <span class="py-status-text">${qjoLanguage === 'ar' ? 'جاري التنفيذ في بيئة معزولة…' : 'Running in a sandboxed worker…'}</span>
            </div>
          `;
          const updateStatusText = (txt) => {
            const statusTextEl = outputEl.querySelector('.py-status-text');
            if (statusTextEl) statusTextEl.textContent = txt;
          };

          try {
            let executable = rawCode;
            if (isTypeScript) {
              try {
                executable = await transpileTypeScript(rawCode, updateStatusText);
              } catch (tsErr) {
                // A syntax error here is the user's TypeScript, so it is worth
                // handing to auto-fix exactly like a runtime failure.
                renderRunTerminal(outputEl, {
                  icon: '⚠️',
                  title: qjoLanguage === 'ar' ? 'خطأ في تحويل TypeScript' : 'TypeScript Transpile Error',
                  statusText: qjoLanguage === 'ar' ? '● خطأ' : '● Error',
                  statusClass: 'error',
                  durationMs: undefined,
                  bodyContent: `<div class="python-terminal-body error-text">${escapeHtml(tsErr?.message || String(tsErr))}</div>`,
                  autoFix: { language: 'typescript', code: rawCode, errorText: tsErr?.message || String(tsErr) }
                });
                return;
              }
            }
            const res = await executeJavaScriptInSandbox(executable);
            const logLines = (res.logs || []).map(entry => {
              if (entry.kind === 'table') return entry.text;
              if (entry.kind === 'return') return `⟵ ${entry.text}`;
              if (entry.kind === 'warn') return `⚠ ${entry.text}`;
              if (entry.kind === 'error') return `✖ ${entry.text}`;
              return entry.text;
            });

            let bodyContent = '';
            if (logLines.length) {
              bodyContent += `<div class="python-terminal-body">${escapeHtml(logLines.join('\n'))}</div>`;
            }
            if (res.error) {
              bodyContent += `<div class="python-terminal-body error-text">${escapeHtml(res.error)}</div>`;
            } else if (!logLines.length) {
              bodyContent += `<div class="python-terminal-body">${escapeHtml(qjoLanguage === 'ar'
                ? '(تم التنفيذ بنجاح — لا توجد مخرجات. استخدم console.log لعرض القيم)'
                : '(Executed successfully — no output. Use console.log to print values)')}</div>`;
            }

            renderRunTerminal(outputEl, {
              icon: res.ok ? (isTypeScript ? '🟦' : '🟨') : '⚠️',
              title: isTypeScript
                ? (qjoLanguage === 'ar' ? 'مخرجات TypeScript' : 'TypeScript Output')
                : (qjoLanguage === 'ar' ? 'مخرجات جافاسكريبت' : 'JavaScript Output'),
              statusText: res.ok
                ? (qjoLanguage === 'ar' ? '● اكتمل بنجاح' : '● Success')
                : res.timedOut
                  ? (qjoLanguage === 'ar' ? '● تجاوز المهلة' : '● Timed out')
                  : (qjoLanguage === 'ar' ? '● خطأ برمجي' : '● Error'),
              statusClass: res.ok ? 'success' : 'error',
              durationMs: res.durationMs,
              bodyContent,
              // A timeout is an infinite loop, not a syntax fault Qjo can patch
              // from the trace alone — but it is still worth fixing, so offer it.
              autoFix: res.ok ? null : { language: isTypeScript ? 'typescript' : 'javascript', code: rawCode, errorText: res.error }
            });

            const copyBtn = outputEl.querySelector('.python-terminal-copy');
            if (copyBtn) {
              copyBtn.addEventListener('click', async () => {
                const text = res.error || logLines.join('\n');
                if (text && await copyTextToClipboard(text)) {
                  copyBtn.classList.add('copied');
                  setTimeout(() => copyBtn.classList.remove('copied'), 1500);
                }
              });
            }
          } catch (execErr) {
            renderRunTerminal(outputEl, {
              icon: '⚠️',
              title: isTypeScript
                ? (qjoLanguage === 'ar' ? 'خطأ في تشغيل TypeScript' : 'TypeScript Execution Error')
                : (qjoLanguage === 'ar' ? 'خطأ في تشغيل جافاسكريبت' : 'JavaScript Execution Error'),
              statusText: qjoLanguage === 'ar' ? '● خطأ' : '● Error',
              statusClass: 'error',
              durationMs: undefined,
              bodyContent: `<div class="python-terminal-body error-text">${escapeHtml(execErr?.message || String(execErr))}</div>`,
              autoFix: { language: isTypeScript ? 'typescript' : 'javascript', code: rawCode, errorText: execErr?.message || String(execErr) }
            });
          } finally {
            btn.disabled = false;
            if (runSpinner) runSpinner.classList.add('hidden');
            if (runIcon) runIcon.classList.remove('hidden');
            if (runLabel) runLabel.textContent = qjoLanguage === 'ar' ? 'إعادة تشغيل' : 'Rerun';
          }
        });
      });
    }

    function initializePythonRunButtons(element) {
      if (!element) return;
      element.querySelectorAll('.run-python-btn').forEach(btn => {
        if (btn.dataset.initialized) return;
        btn.dataset.initialized = 'true';

        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const rawCode = decodeURIComponent(btn.dataset.code || '');
          const targetId = btn.dataset.target;
          const outputEl = targetId ? document.getElementById(targetId) : null;
          if (!rawCode || !outputEl) return;

          const runSpinner = btn.querySelector('.run-spinner');
          const runIcon = btn.querySelector('.run-icon');
          const runLabel = btn.querySelector('.run-label');

          btn.disabled = true;
          if (runSpinner) runSpinner.classList.remove('hidden');
          if (runIcon) runIcon.classList.add('hidden');

          outputEl.classList.remove('hidden');
          outputEl.innerHTML = `
            <div class="python-terminal-loading">
              <span class="run-spinner"></span>
              <span class="py-status-text">${qjoLanguage === 'ar' ? 'تحضير بايثون...' : 'Preparing Python...'}</span>
            </div>
          `;

          const updateStatusText = (txt) => {
            const statusTextEl = outputEl.querySelector('.py-status-text');
            if (statusTextEl) statusTextEl.textContent = txt;
          };

          try {
            const res = await executePythonCodeInSandbox(rawCode, updateStatusText);
            const isSuccess = !res.error;
            const statusText = isSuccess
              ? (qjoLanguage === 'ar' ? '● اكتمل بنجاح' : '● Success')
              : (qjoLanguage === 'ar' ? '● خطأ برمجيا' : '● Error');
            const statusClass = isSuccess ? 'success' : 'error';

            let bodyContent = '';
            if (res.error) {
              bodyContent = `<div class="python-terminal-body error-text">${escapeHtml(res.error)}</div>`;
            } else {
              let textOut = (res.stdout || '').trim();
              if (res.stderr && res.stderr.trim()) {
                textOut = (textOut ? textOut + '\n' : '') + res.stderr.trim();
              }
              if (!textOut && (!res.images || !res.images.length)) {
                textOut = qjoLanguage === 'ar' ? '(تم تنفيذ الكود بنجاح - لا توجد مخرجات نصية)' : '(Code executed successfully - no stdout output)';
              }
              if (textOut) {
                bodyContent += `<div class="python-terminal-body">${escapeHtml(textOut)}</div>`;
              }
              if (res.images && res.images.length) {
                res.images.forEach(imgBase64 => {
                  bodyContent += `
                    <div class="python-plot-wrap">
                      <img class="python-plot-img" src="data:image/png;base64,${imgBase64}" alt="Matplotlib Plot" />
                    </div>
                  `;
                });
              }
            }

            renderRunTerminal(outputEl, {
              icon: '🐍',
              title: qjoLanguage === 'ar' ? 'مخرجات بايثون' : 'Python Output',
              statusText,
              statusClass,
              durationMs: res.durationMs,
              bodyContent,
              autoFix: isSuccess ? null : { language: 'python', code: rawCode, errorText: res.error }
            });

            const copyBtn = outputEl.querySelector('.python-terminal-copy');
            if (copyBtn) {
              copyBtn.addEventListener('click', async () => {
                const textToCopy = res.error || res.stdout || '';
                if (textToCopy) {
                  const ok = await copyTextToClipboard(textToCopy);
                  if (ok) {
                    copyBtn.classList.add('copied');
                    setTimeout(() => copyBtn.classList.remove('copied'), 1500);
                  }
                }
              });
            }

          } catch (execErr) {
            renderRunTerminal(outputEl, {
              icon: '⚠️',
              title: qjoLanguage === 'ar' ? 'خطأ في تشغيل بايثون' : 'Python Execution Error',
              statusText: qjoLanguage === 'ar' ? '● خطأ' : '● Error',
              statusClass: 'error',
              durationMs: undefined,
              bodyContent: `<div class="python-terminal-body error-text">${escapeHtml(execErr?.message || String(execErr))}</div>`,
              autoFix: { language: 'python', code: rawCode, errorText: execErr?.message || String(execErr) }
            });
          } finally {
            btn.disabled = false;
            if (runSpinner) runSpinner.classList.add('hidden');
            if (runIcon) runIcon.classList.remove('hidden');
            if (runLabel) runLabel.textContent = qjoLanguage === 'ar' ? 'إعادة تشغيل' : 'Rerun';
          }
        });
      });
    }

    function initializeQuizzesInElement(element) {
      const containers = element.querySelectorAll('.interactive-quiz-container');
      containers.forEach(container => {
        try {
          const configRaw = decodeURIComponent(container.dataset.quizConfig || '[]');
          const questions = safeParseRelaxedJson(configRaw);
          if (!Array.isArray(questions) || !questions.length) return;
          
          let html = '<div class="quiz-card-wrapper" style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px; margin: 14px 0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">';
          
          questions.forEach((q, qIdx) => {
            const optionsHtml = (q.options || []).map((opt, oIdx) => {
              return `<button class="quiz-option-btn" data-correct="${opt === q.answer}" data-explanation="${escapeHtml(q.explanation || '')}" style="display: block; width: 100%; text-align: right; background: white; border: 1px solid #CBD5E1; padding: 8px 12px; margin: 6px 0; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.2s;">${opt}</button>`;
            }).join('');
            
            html += `<div class="quiz-question-block" id="q-block-${container.id}-${qIdx}" style="display: ${qIdx === 0 ? 'block' : 'none'};">
              <div class="quiz-progress" style="font-size: 10px; color: #64748B; font-weight: 700; margin-bottom: 6px;">السؤال ${qIdx + 1} من ${questions.length}</div>
              <div class="quiz-question-title" style="font-size: 14px; font-weight: 700; color: #0F172A; margin-bottom: 12px;">${q.question}</div>
              <div class="quiz-options-list">${optionsHtml}</div>
              <div class="quiz-explanation-note text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 mt-3 text-xs hidden"></div>
              ${qIdx < questions.length - 1 ? `<button class="quiz-next-btn" style="background: #123B7A; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; margin-top: 12px; display: none;">السؤال التالي ➡️</button>` : ''}
            </div>`;
          });
          
          html += '</div>';
          container.innerHTML = html;
          
          const questionBlocks = container.querySelectorAll('.quiz-question-block');
          questionBlocks.forEach((block, qIdx) => {
            const options = block.querySelectorAll('.quiz-option-btn');
            const explanationNote = block.querySelector('.quiz-explanation-note');
            const nextBtn = block.querySelector('.quiz-next-btn');
            
            options.forEach(opt => {
              opt.addEventListener('click', (e) => {
                e.preventDefault();
                const isCorrect = opt.dataset.correct === 'true';
                options.forEach(o => {
                  o.disabled = true;
                  if (o.dataset.correct === 'true') {
                    o.style.background = '#DEF7EC';
                    o.style.borderColor = '#31C48D';
                    o.style.color = '#03543F';
                  } else {
                    o.style.background = '#F8FAFC';
                    o.style.color = '#9CA3AF';
                  }
                });
                
                if (!isCorrect) {
                  opt.style.background = '#FDE8E8';
                  opt.style.borderColor = '#F05252';
                  opt.style.color = '#9B1C1C';
                }
                
                if (explanationNote) {
                  explanationNote.innerHTML = `<strong>${isCorrect ? '✅ صحيح!' : '❌ خاطئ!'}</strong> ${opt.dataset.explanation || ''}`;
                  explanationNote.classList.remove('hidden');
                }
                
                if (nextBtn) {
                  nextBtn.style.display = 'inline-block';
                }
              });
            });
            
            if (nextBtn) {
              nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                block.style.display = 'none';
                questionBlocks[qIdx + 1].style.display = 'block';
              });
            }
          });
          
        } catch (error) {
          console.error('Failed to parse or build interactive quiz cards:', error);
        }
      });
    }

    function renderReasoningCardHtml(reasoningText, isDone = true, elapsed = '') {
      const rawLines = String(reasoningText || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
      let stepsHtml = '';
      for (const line of rawLines) {
        const isTool = /^(✓|used|searched|تم استخدام|تم البحث)/i.test(line);
        stepsHtml += `<div class="qjo-reasoning-step${isTool ? ' tool-step' : ''}">
          <span class="qjo-step-dot"></span>
          ${isTool ? '<span class="tool-check">✓</span>' : ''}
          <span>${escapeHtml(line.replace(/^[✓•\-\*]\s*/, ''))}</span>
        </div>`;
      }
      return `
        <div class="qjo-reasoning-card${isDone ? ' collapsed' : ''}">
          <div class="qjo-reasoning-header">
            <div class="qjo-reasoning-title">
              ${!isDone ? '<span class="qjo-reasoning-pulse"></span>' : ''}
              <span class="qjo-reasoning-label">${isDone ? 'Reasoning' : 'Reasoning...'}</span>
              <span class="qjo-reasoning-timer">${isDone ? (elapsed ? `Thought for ${elapsed}` : 'Completed') : (elapsed || '0.1s')}</span>
            </div>
            <button type="button" class="qjo-reasoning-toggle" aria-label="Toggle Reasoning">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
          </div>
          <div class="qjo-reasoning-body">
            <div class="qjo-reasoning-timeline">
              ${stepsHtml || '<div class="qjo-reasoning-step"><span class="qjo-step-dot"></span><span>Analyzing query context...</span></div>'}
            </div>
          </div>
        </div>
      `;
    }

    function attachReasoningToggle(container) {
      const card = container.querySelector('.qjo-reasoning-card');
      if (card && !card.dataset.toggleAttached) {
        card.dataset.toggleAttached = 'true';
        const header = card.querySelector('.qjo-reasoning-header');
        if (header) {
          header.addEventListener('click', () => {
            card.classList.toggle('collapsed');
          });
        }
      }
    }

    // Builds the action row under an assistant answer: copy, regenerate, rate,
    // remember, and the content-dependent exports.
    function buildAnswerToolbar(wrap, bubbleEl, content) {
        const toolbar = document.createElement('div');
        toolbar.className = 'msg-actions-toolbar';

        const iconBtn = (title, svg, onClick, extra = '') => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'msg-action-btn' + (extra ? ' ' + extra : '');
          b.title = title;
          b.setAttribute('aria-label', title);
          b.innerHTML = svg;
          b.addEventListener('click', () => onClick(b));
          return b;
        };

        const ar = qjoLanguage === 'ar';
        const answerText = () => (bubbleEl.querySelector('.qjo-streamed-content')?.innerText || bubbleEl.innerText || content || '').trim();

        // ── Copy ──
        const copySvg = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const checkSvg = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="#10B981" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        toolbar.appendChild(iconBtn(ar ? 'نسخ الإجابة' : 'Copy answer', copySvg, async (b) => {
          if (await copyTextToClipboard(answerText())) {
            b.innerHTML = checkSvg;
            setTimeout(() => { b.innerHTML = copySvg; }, 1300);
          }
        }));

        // ── Regenerate: actually re-runs the last question ──
        const regenSvg = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`;
        toolbar.appendChild(iconBtn(ar ? 'إعادة توليد الإجابة' : 'Regenerate answer', regenSvg, () => {
          if (busy) return;
          regenerateLastAnswer(wrap);
        }));

        // ── Feedback: real submissions to /api/feedback ──
        const upSvg = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>`;
        const downSvg = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>`;
        let ratingSent = false;
        const rate = (rating, svg, title) => iconBtn(title, svg, async (b) => {
          if (ratingSent) return;
          ratingSent = true;
          toolbar.querySelectorAll('.msg-rate-btn').forEach(x => { x.disabled = true; });
          b.classList.add('rated');
          const ok = await submitAnswerFeedback(rating, answerText());
          showMicroToast(ok
            ? (ar ? 'وصلنا تقييمك، شكرًا 💜' : 'Feedback received, thanks 💜')
            : (ar ? 'تعذّر إرسال التقييم' : 'Could not send feedback'));
          if (!ok) { ratingSent = false; toolbar.querySelectorAll('.msg-rate-btn').forEach(x => { x.disabled = false; }); b.classList.remove('rated'); }
        }, 'msg-rate-btn');
        toolbar.appendChild(rate('up', upSvg, ar ? 'إجابة جيدة' : 'Good answer'));
        toolbar.appendChild(rate('down', downSvg, ar ? 'إجابة ضعيفة' : 'Poor answer'));

        // ── Save to memory ──
        const teachSvg = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a5 5 0 0 0-5 5c0 1.6.7 3 1.9 4A4 4 0 0 0 8 14v1h8v-1a4 4 0 0 0-.9-3A5 5 0 0 0 17 7a5 5 0 0 0-5-5z"></path><path d="M9 19h6M10 22h4"></path></svg>`;
        toolbar.appendChild(iconBtn(ar ? 'احفظ هذه المعلومة في ذاكرة Qjo' : 'Save this to Qjo memory', teachSvg, (b) => {
          const saved = teachFromMessage(answerText());
          showMicroToast(saved
            ? (ar ? 'تم الحفظ في الذاكرة 🧠' : 'Saved to memory 🧠')
            : (ar ? 'لم يتم الحفظ — المحتوى غير مناسب للذاكرة' : 'Not saved — unsuitable for memory'));
          if (saved) b.classList.add('rated');
        }));

        // ── Exports: only when the answer is substantial enough to warrant one ──
        if (shouldShowRichExports(content)) {
          const divider = document.createElement('span');
          divider.className = 'msg-actions-divider';
          divider.setAttribute('aria-hidden', 'true');
          toolbar.appendChild(divider);

          const exportTitle = () => {
            const firstLine = String(content || '').split('\n').find(l => l.trim()) || 'Qjo';
            return firstLine.replace(/^#{1,6}\s*/, '').replace(/[*_`>|]/g, '').trim().slice(0, 60) || 'Qjo';
          };
          const pdfSvg = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><polyline points="9 15 12 18 15 15"></polyline></svg>`;
          const slidesSvg = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
          const docSvg = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="14" y2="17"></line></svg>`;

          const exportBtn = (fmt, svg, title) => iconBtn(title, svg, async (b) => {
            b.disabled = true;
            b.classList.add('exporting');
            const ok = await downloadExport(fmt, exportTitle(), content);
            b.disabled = false;
            b.classList.remove('exporting');
            if (!ok) showMicroToast(ar ? 'تعذّر إنشاء الملف' : 'Could not create the file');
          });
          toolbar.appendChild(exportBtn('pdf', pdfSvg, ar ? 'تصدير PDF' : 'Export PDF'));
          toolbar.appendChild(exportBtn('pptx', slidesSvg, ar ? 'تصدير شرائح' : 'Export slides'));
          toolbar.appendChild(exportBtn('docx', docSvg, ar ? 'تصدير Word' : 'Export Word'));
        }

        // ── Project ZIP: only when the answer carries file-path labelled code ──
        const projectFiles = extractProjectFiles(String(content || ''));
        if (projectFiles.length) {
          const zipSvg = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
          toolbar.appendChild(iconBtn(
            ar ? `تحميل المشروع (${projectFiles.length} ملف)` : `Download project (${projectFiles.length} files)`,
            zipSvg,
            async (b) => {
              b.disabled = true;
              const ok = await downloadCodeZip(projectFiles);
              b.disabled = false;
              if (!ok) showMicroToast(ar ? 'تعذّر إنشاء الملف المضغوط' : 'Could not build the archive');
            }
          ));
        }

        wrap.appendChild(toolbar);
    }

    // A streamed answer is created empty, so any action that depends on the
    // content — the export buttons, the project ZIP — must be decided after the
    // last token rather than at creation time.
    function refreshAnswerToolbar(messageWrap, finalContent) {
      if (!messageWrap) return;
      const existing = messageWrap.querySelector('.msg-actions-toolbar');
      if (existing) existing.remove();
      const bubbleEl = messageWrap.querySelector('.bubble');
      if (!bubbleEl) return;
      buildAnswerToolbar(messageWrap, bubbleEl, finalContent);
    }

    function addMessage(role, content, extraClass = '') {
      content = sanitizeStoredMessageContent(content, role);
      if (welcomeEl) welcomeEl.style.display = 'none';
      messagesInner.classList.add('has-messages');
      const wrap = document.createElement('div');
      wrap.className = 'msg ' + role + ' ' + extraClass;
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      if (role === 'assistant' && typeof content === 'string' && content.includes('<think>')) {
        const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch) {
          const reasoningBody = thinkMatch[1].trim();
          const cleanAnswer = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
          bubble.innerHTML = renderReasoningCardHtml(reasoningBody, true) + '<div class="qjo-reasoning-divider"></div><div class="qjo-streamed-content">' + lightMarkdown(cleanAnswer) + '</div>';
          attachReasoningToggle(bubble);
        } else {
          bubble.innerHTML = lightMarkdown(content);
        }
      } else {
        bubble.innerHTML = role === 'assistant' ? lightMarkdown(content) : escapeHtml(content);
      }
      if (role === 'assistant') decorateAssistantBubble(bubble, wrap);
      wrap.appendChild(bubble);

      if (role === 'assistant' && !String(extraClass || '').includes('error')) {
        buildAnswerToolbar(wrap, bubble, content);
      }
      messagesInner.appendChild(wrap);
      scrollToBottom(false);
      return wrap;
    }

    function autoResize() {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
    }

    function isNearBottom() {
      const messageNearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
      const pageNearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120;
      return messageNearBottom && pageNearBottom;
    }

    // Accepts a precomputed result so callers that already measured do not pay
    // for a second forced layout. isNearBottom() flushes layout, and this used
    // to run immediately after requestSmoothScroll() had just measured AND
    // written scroll positions — two full layout flushes per scroll request.
    function updateScrollBottomButton(nearBottom) {
      if (!scrollBottomBtn) return;
      const near = typeof nearBottom === 'boolean' ? nearBottom : isNearBottom();
      scrollBottomBtn.classList.toggle('show', !near);
    }

    function scrollToBottom(smooth = true) {
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      setTimeout(updateScrollBottomButton, 220);
    }

    let scrollRafPending = false;
    function requestSmoothScroll() {
      if (scrollRafPending) return;
      scrollRafPending = true;
      requestAnimationFrame(() => {
        scrollRafPending = false;
        // One measurement, reused for both the scroll decision and the button.
        const near = isNearBottom();
        if (near) {
          messagesEl.scrollTop = messagesEl.scrollHeight;
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
        }
        updateScrollBottomButton(near);
      });
    }



    function formatBytes(bytes) {
      if (!Number.isFinite(bytes)) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    function isReadableTextFile(file) {
      const name = file.name.toLowerCase();
      return file.type.startsWith('text/') || ['.txt', '.md', '.csv', '.json', '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.html', '.css', '.scss', '.sql', '.sh', '.yml', '.yaml', '.xml', '.vue', '.svelte'].some(ext => name.endsWith(ext));
    }

    function isPdfFile(file) {
      return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    }

    function readTextFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('تعذر قراءة الملف'));
        reader.readAsText(file);
      });
    }

    function readDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('تعذر قراءة الصورة'));
        reader.readAsDataURL(file);
      });
    }

    async function compressImageToDataUrl(file, maxSize = 1600, quality = 0.82) {
      const originalUrl = await readDataUrl(file);
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('تعذر تجهيز الصورة'));
        image.src = originalUrl;
      });

      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: true });
      ctx.drawImage(img, 0, 0, width, height);
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      return canvas.toDataURL(type, type === 'image/jpeg' ? quality : undefined);
    }


    async function waitForTesseract(maxMs = 3500) {
      const start = Date.now();
      while (!window.Tesseract && Date.now() - start < maxMs) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      return Boolean(window.Tesseract?.recognize);
    }

    async function ocrDataUrl(dataUrl, label = 'image') {
      if (!dataUrl || !(await waitForTesseract())) return '';
      try {
        const result = await Tesseract.recognize(dataUrl, 'ara+eng', {
          logger: (m) => {
            if (m?.status && m?.progress) {
              requestStatusText.textContent = `${label}: OCR ${Math.round(m.progress * 100)}%`;
            }
          }
        });
        return String(result?.data?.text || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 12000);
      } catch (error) {
        console.warn('OCR failed:', error);
        return '';
      }
    }

    async function renderPdfPageToDataUrl(page, scale = 1.35) {
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.86);
    }

    async function ocrPdfPages(pdf, maxPages = 3) {
      if (!(await waitForTesseract())) return '';
      const pages = [];
      const limit = Math.min(pdf.numPages, maxPages);
      for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
        try {
          requestStatusText.textContent = `OCR PDF page ${pageNumber}/${limit}...`;
          const page = await pdf.getPage(pageNumber);
          const dataUrl = await renderPdfPageToDataUrl(page);
          const text = await ocrDataUrl(dataUrl, `PDF page ${pageNumber}`);
          if (text) pages.push(`OCR Page ${pageNumber}: ${text}`);
        } catch (error) {
          console.warn('PDF OCR page failed:', pageNumber, error);
        }
      }
      return pages.join('\n\n').trim();
    }

    function readArrayBuffer(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('تعذر قراءة الملف'));
        reader.readAsArrayBuffer(file);
      });
    }

    async function readPdfFile(file) {
      if (!window.pdfjsLib) {
        throw new Error('قارئ PDF غير متاح');
      }

      const buffer = await readArrayBuffer(file);
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const maxPages = Math.min(pdf.numPages, 150);
      const pages = [];

      for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
        if (text) pages.push(`Page ${pageNumber}: ${text}`);
      }

      let result = pages.join('\n\n').trim();
      let usedOcr = false;
      if (!result || result.length < 80) {
        const ocrText = await ocrPdfPages(pdf, 4);
        if (ocrText) {
          result = ocrText;
          usedOcr = true;
        }
      }
      if (!result) {
        throw new Error('PDF لا يحتوي نصًا قابلًا للاستخراج، وOCR لم يستخرج نصًا واضحًا. قد تحتاج نسخة أوضح.');
      }

      const header = `PDF pages processed: ${maxPages} of ${pdf.numPages}\nExtraction method: ${usedOcr ? 'OCR fallback on rendered pages' : 'embedded PDF text'}\nExtracted characters before trimming: ${result.length}\n\n`;
      if (result.length <= PDF_MAX_CHARS) return header + result;

      const headSize = Math.floor(PDF_MAX_CHARS * 0.72);
      const tailSize = PDF_MAX_CHARS - headSize;
      return header
        + result.slice(0, headSize)
        + `\n\n[... تم اختصار جزء من منتصف الملف بسبب كبر الحجم. حلّل الأجزاء المتاحة بوضوح، واذكر أن الملف أطول من السياق الحالي إذا لزم الأمر ...]\n\n`
        + result.slice(-tailSize);
    }

    async function addFiles(files) {
      const selected = Array.from(files || []);
      if (!selected.length) return;

      // Each readable attachment contributes an overview plus up to eight
      // retrieved passages — roughly 18,000 characters. Without a cap, a dozen
      // files built a prompt no model would accept, and the browser spent the
      // wait scoring chunks for evidence that would never fit anyway. Better to
      // say so up front than to fail after the upload.
      const room = MAX_ATTACHMENTS - pendingAttachments.length;
      if (room <= 0) {
        showMicroToast(qjoLanguage === 'ar'
          ? `الحد الأقصى ${MAX_ATTACHMENTS} مرفقات في الرسالة الواحدة. أرسل الحالية أولًا ثم أرفق الباقي.`
          : `Up to ${MAX_ATTACHMENTS} attachments per message. Send these first, then attach the rest.`);
        return;
      }
      const accepted = selected.slice(0, room);
      if (accepted.length < selected.length) {
        showMicroToast(qjoLanguage === 'ar'
          ? `تمت إضافة ${accepted.length} من ${selected.length} ملفات (الحد ${MAX_ATTACHMENTS} لكل رسالة).`
          : `Added ${accepted.length} of ${selected.length} files (limit ${MAX_ATTACHMENTS} per message).`);
      }

      setFileProcessing(true);
      try {
      for (const file of accepted) {
        const item = {
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
          name: file.name,
          type: file.type || 'unknown',
          size: file.size,
          file,
          status: 'جاهز',
          text: '',
          fullText: '',
          dataUrl: ''
        };

        const pdfFile = isPdfFile(file);
        const imageFile = file.type.startsWith('image/');

        if (pdfFile && file.size > 35 * 1024 * 1024) {
          item.status = 'PDF كبير جدًا؛ يحتاج تقسيم أو Backend OCR';
        } else if (imageFile && file.size > 12 * 1024 * 1024) {
          item.status = 'صورة كبيرة جدًا';
        } else if (!pdfFile && !imageFile && file.size > 5 * 1024 * 1024) {
          item.status = 'كبير جدًا';
        } else if (isReadableTextFile(file)) {
          try {
            const full = await readTextFile(file);
            item.fullText = full.slice(0, 240000);
            item.text = full.slice(0, TEXT_FILE_MAX_CHARS);
            item.status = full.length > TEXT_FILE_MAX_CHARS ? 'نص مقروء + RAG' : 'نص مقروء';
          } catch (_) {
            item.status = 'تعذر القراءة';
          }
        } else if (pdfFile) {
          try {
            item.text = await readPdfFile(file);
            item.fullText = item.text;
            item.status = item.text.length >= PDF_MAX_CHARS ? 'PDF ضخم مقروء + RAG' : 'PDF مقروء';
          } catch (error) {
            item.status = error?.message || 'تعذر قراءة PDF';
          }
        } else if (imageFile) {
          try {
            item.dataUrl = await compressImageToDataUrl(file);
            item.status = 'صورة مضغوطة؛ محاولة OCR...';
            renderAttachments();
            const ocrText = await ocrDataUrl(item.dataUrl, file.name);
            if (ocrText) {
              item.text = `OCR text extracted from image (${file.name}):\n${ocrText}`;
              item.fullText = item.text;
              item.status = 'صورة + OCR جاهزة للتحليل';
            } else {
              item.status = 'صورة مضغوطة وجاهزة للتحليل';
            }
          } catch (_) {
            item.status = 'تعذر قراءة الصورة';
          }
        } else {
          item.status = 'مرفق فقط';
        }

        pendingAttachments.push(item);
      }
      renderAttachments();
      } finally {
        setFileProcessing(false);
      }
    }

    function removeAttachment(id) {
      pendingAttachments = pendingAttachments.filter(item => item.id !== id);
      renderAttachments();
    }

    function renderAttachments() {
      attachmentTray.innerHTML = '';
      attachmentTray.classList.toggle('show', pendingAttachments.length > 0);
      pendingAttachments.forEach(item => {
        const chip = document.createElement('div');
        chip.className = 'attachment-chip';
        const icon = item.type.startsWith('image/') ? 'صورة' : 'ملف';
        chip.innerHTML = `
          <div class="attachment-icon">${icon}</div>
          <div class="attachment-info">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.status)} · ${escapeHtml(formatBytes(item.size))}</span>
          </div>
          <button type="button" aria-label="حذف المرفق">×</button>
        `;
        chip.querySelector('button').addEventListener('click', () => removeAttachment(item.id));
        attachmentTray.appendChild(chip);
      });
    }

    function openRagDb() {
      if (ragDbPromise) return ragDbPromise;
      ragDbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) return resolve(null);
        const request = indexedDB.open(RAG_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(RAG_STORE_NAME)) {
            const store = db.createObjectStore(RAG_STORE_NAME, { keyPath: 'id' });
            store.createIndex('chatId', 'chatId', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      }).catch(error => {
        console.warn('RAG IndexedDB unavailable:', error);
        return null;
      });
      return ragDbPromise;
    }

    async function ragDbTransaction(mode = 'readonly') {
      const db = await openRagDb();
      if (!db) return null;
      return db.transaction(RAG_STORE_NAME, mode).objectStore(RAG_STORE_NAME);
    }

    async function saveRagRecord(record) {
      const store = await ragDbTransaction('readwrite');
      if (!store) return false;
      return new Promise((resolve) => {
        const req = store.put(record);
        req.onsuccess = () => resolve(true);
        req.onerror = () => { console.warn('RAG save failed:', req.error); resolve(false); };
      });
    }

    async function getRagRecordsForChat(chatId) {
      if (!chatId) return [];
      const store = await ragDbTransaction('readonly');
      if (!store) return [];
      return new Promise((resolve) => {
        const idx = store.index('chatId');
        const req = idx.getAll(chatId);
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => { console.warn('RAG load failed:', req.error); resolve([]); };
      });
    }

    async function deleteRagRecordsForChat(chatId) {
      if (!chatId) return;
      const store = await ragDbTransaction('readwrite');
      if (!store) return;
      const idx = store.index('chatId');
      const req = idx.openKeyCursor(chatId);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
    }


    function cloudRagRecordsRef(chatId) {
      if (!db || !currentUser || !chatId) return null;
      return userChatsRef().doc(chatId).collection('ragIndexes');
    }

    function compactRagRecordForCloud(record) {
      if (!record) return null;
      return {
        id: record.id,
        chatId: record.chatId,
        attachmentId: record.attachmentId || '',
        name: String(record.name || 'attachment').slice(0, 160),
        type: String(record.type || 'unknown').slice(0, 80),
        size: Number(record.size || 0),
        createdAt: Number(record.createdAt || Date.now()),
        chunkCount: Number(record.chunkCount || 0),
        storage: 'firestore-rag-v1-compact',
        chunks: (record.chunks || []).slice(0, 80).map(c => ({
          index: Number(c.index || 0),
          start: Number(c.start || 0),
          end: Number(c.end || 0),
          text: String(c.text || '').slice(0, 1800)
        }))
      };
    }

    async function saveCloudRagRecord(record) {
      try {
        if (!firebaseReady || !currentUser || !db || !record?.chatId) return false;
        const ref = cloudRagRecordsRef(record.chatId);
        if (!ref) return false;
        const compact = compactRagRecordForCloud(record);
        if (!compact || !compact.chunks.length) return false;
        await ref.doc(compact.id).set({
          ...compact,
          syncedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
      } catch (error) {
        console.warn('Cloud RAG save failed. Firestore rules may need ragIndexes permission:', error);
        return false;
      }
    }

    async function getCloudRagRecordsForChat(chatId) {
      try {
        if (!firebaseReady || !currentUser || !db || !chatId) return [];
        const ref = cloudRagRecordsRef(chatId);
        if (!ref) return [];
        const snap = await ref.orderBy('createdAt', 'desc').limit(24).get();
        const records = [];
        snap.forEach(doc => {
          const data = doc.data() || {};
          if (Array.isArray(data.chunks) && data.chunks.length) records.push({ id: doc.id, ...data, origin: 'cloud-rag' });
        });
        return records.reverse();
      } catch (error) {
        console.warn('Cloud RAG load failed. Falling back to local index:', error);
        return [];
      }
    }

    async function deleteCloudRagRecordsForChat(chatId) {
      try {
        if (!firebaseReady || !currentUser || !db || !chatId) return;
        const ref = cloudRagRecordsRef(chatId);
        if (!ref) return;
        const snap = await ref.limit(80).get();
        if (snap.empty) return;
        const batch = db.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      } catch (error) {
        console.warn('Cloud RAG delete failed:', error);
      }
    }

    function mergeRagRecords(localRecords, cloudRecords) {
      const map = new Map();
      [...(localRecords || []), ...(cloudRecords || [])].forEach(record => {
        if (!record || !record.id) return;
        const existing = map.get(record.id);
        if (!existing || (record.chunks?.length || 0) > (existing.chunks?.length || 0)) map.set(record.id, record);
      });
      return Array.from(map.values()).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)).slice(-24);
    }

    async function loadActiveRagIndexes(chatId = currentChatId) {
      if (!chatId) {
        activeRagIndexes = [];
        return activeRagIndexes;
      }
      const [localRecords, cloudRecords] = await Promise.all([
        getRagRecordsForChat(chatId),
        getCloudRagRecordsForChat(chatId)
      ]);
      activeRagIndexes = mergeRagRecords(localRecords, cloudRecords);
      // Best-effort local cache of cloud records for offline/same-device speed.
      for (const record of cloudRecords) await saveRagRecord(record);
      return activeRagIndexes;
    }

    function buildRagRecordFromAttachment(chatId, item) {
      const sourceText = String(item.fullText || item.text || '').trim();
      if (!chatId || !sourceText || sourceText.length < 80) return null;
      const chunks = chunkTextForRetrieval(sourceText, 2200, 260).slice(0, 140).map(c => ({ index: c.index, start: c.start, end: c.end, text: c.text }));
      if (!chunks.length) return null;
      return {
        id: `${chatId}_${item.id || Date.now()}_${Math.random().toString(36).slice(2)}`,
        chatId,
        attachmentId: item.id || '',
        name: item.name || 'attachment',
        type: item.type || 'unknown',
        size: item.size || 0,
        createdAt: Date.now(),
        chunkCount: chunks.length,
        chunks
      };
    }

    async function persistAttachmentsToRagIndex(chatId, attachments) {
      if (!chatId || !Array.isArray(attachments) || !attachments.length) return;
      const saved = [];
      for (const item of attachments) {
        const record = buildRagRecordFromAttachment(chatId, item);
        if (!record) continue;
        const localOk = await saveRagRecord(record);
        const cloudOk = await saveCloudRagRecord(record);
        if (localOk || cloudOk) saved.push({ ...record, cloudSynced: cloudOk });
      }
      if (saved.length) {
        activeRagIndexes = mergeRagRecords(activeRagIndexes.filter(r => r.chatId === chatId), saved);
      }
    }

    function tokenizeForRetrieval(text) {
      const stop = new Set(['what','when','where','which','with','from','that','this','your','about','كيف','متى','وين','أين','ما','ماهي','ماهو','هل','عن','في','من','على','الى','إلى','هذا','هذه','اشرح','حلل','لخص','اعطني','اكتب']);
      return String(text || '')
        .toLowerCase()
        .replace(/[^A-Za-z0-9\u0600-\u06FF]+/g, ' ')
        .split(/\s+/)
        .map(x => x.trim())
        .filter(x => x.length >= 3 && !stop.has(x))
        .slice(0, 48);
    }

    function chunkTextForRetrieval(text, chunkSize = 2200, overlap = 260) {
      const value = String(text || '').replace(/\n{3,}/g, '\n\n').trim();
      if (!value) return [];
      if (value.length <= chunkSize) return [{ index: 1, start: 0, end: value.length, text: value }];
      const chunks = [];
      let start = 0;
      while (start < value.length && chunks.length < 80) {
        const end = Math.min(value.length, start + chunkSize);
        const slice = value.slice(start, end);
        chunks.push({ index: chunks.length + 1, start, end, text: slice });
        if (end >= value.length) break;
        start = Math.max(0, end - overlap);
      }
      return chunks;
    }

    function normalizeArabicTextForRag(text) {
      return String(text || '')
        .toLowerCase()
        .replace(/[\u064B-\u0652]/g, '') // Remove diacritics
        .replace(/[\u0622\u0623\u0625]/g, '\u0627') // Normalize Alif (أ, إ, آ -> ا)
        .replace(/\u0629/g, '\u0647') // Normalize Teh Marbuta (ة -> ه)
        .replace(/\u0649/g, '\u064A') // Normalize Yeh / Alef Maksura (ى -> ي)
        .trim();
    }

    function scoreRetrievedChunk(chunk, queryTerms) {
      const text = String(chunk.text || '');
      const lower = text.toLowerCase();
      const normalizedText = normalizeArabicTextForRag(text);
      let score = 0;
      queryTerms.forEach(term => {
        const termLower = term.toLowerCase();
        const termNormalized = normalizeArabicTextForRag(term);
        if (lower.includes(termLower) || normalizedText.includes(termNormalized)) {
          score += term.length > 5 ? 2 : 1;
        }
      });
      // Prefer chunks with page labels / headings / definitions when scores tie.
      if (/page\s+\d+|ocr page|^#{1,4}\s|تعريف|definition|summary|conclusion/i.test(chunk.text)) score += 0.25;
      return score;
    }


    function hashTokenToIndex(token, dims = 192) {
      let hash = 2166136261;
      const value = String(token || '');
      for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return Math.abs(hash) % dims;
    }

    function vectorTokens(text) {
      return String(text || '')
        .toLowerCase()
        .match(/[A-Za-z0-9\u0600-\u06FF]+/g) || [];
    }

    function vectorizeText(text, dims = 192) {
      const vec = new Array(dims).fill(0);
      const tokens = vectorTokens(text).filter(t => t.length >= 2);
      tokens.forEach(token => {
        const idx = hashTokenToIndex(token, dims);
        const weight = token.length >= 6 ? 1.35 : 1;
        vec[idx] += weight;
      });
      const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
      if (!norm) return vec;
      for (let i = 0; i < vec.length; i++) vec[i] = vec[i] / norm;
      return vec;
    }

    function cosineSimilarity(a, b) {
      if (!a || !b || a.length !== b.length) return 0;
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
      return sum;
    }


    async function getServerEmbeddingsForRetrieval(texts) {
      const input = (Array.isArray(texts) ? texts : []).map(t => String(t || '').slice(0, 8000));
      if (!input.length) return null;
      try {
        const response = await fetch('/api/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: input })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.embeddings) || data.embeddings.length !== input.length) return null;
        return data.embeddings;
      } catch (error) {
        console.warn('Server embeddings unavailable; using local vector fallback:', error?.message || error);
        return null;
      }
    }

    function buildVectorIndexForChunks(chunks) {
      return chunks.map(chunk => ({ ...chunk, vector: vectorizeText(chunk.text) }));
    }

    async function retrieveHybridChunksFromChunks(rawChunks, userQuery) {
      const chunks = buildVectorIndexForChunks((rawChunks || []).map((c, i) => ({ index: c.index || i + 1, start: c.start || 0, end: c.end || String(c.text || '').length, text: c.text || '' })));
      const queryTerms = tokenizeForRetrieval(userQuery);
      const queryVector = vectorizeText(userQuery);
      if (chunks.length <= 3 || (!queryTerms.length && !String(userQuery || '').trim())) {
        const mid = chunks[Math.floor(chunks.length / 2)] || null;
        return [chunks[0], mid, chunks[chunks.length - 1]].filter(Boolean).map(c => ({ ...c, lexicalScore: 0, vectorScore: 0, serverVectorScore: null, hybridScore: 0, embeddingMode: 'balanced' }));
      }

      const localScored = chunks.map(chunk => {
        const lexicalScore = scoreRetrievedChunk(chunk, queryTerms);
        const vectorScore = cosineSimilarity(queryVector, chunk.vector);
        const positionBoost = (chunk.index === 1 || chunk.index === chunks.length) ? 0.15 : 0;
        const hybridScore = lexicalScore + (vectorScore * 8) + positionBoost;
        return { ...chunk, lexicalScore, vectorScore, serverVectorScore: null, hybridScore, embeddingMode: 'local-hash' };
      }).sort((a, b) => b.hybridScore - a.hybridScore);

      const candidates = localScored.slice(0, 28);
      const serverEmbeddings = await getServerEmbeddingsForRetrieval([userQuery, ...candidates.map(c => c.text)]);
      if (serverEmbeddings && serverEmbeddings.length === candidates.length + 1) {
        const qVec = serverEmbeddings[0];
        candidates.forEach((candidate, i) => {
          const serverVectorScore = cosineSimilarity(qVec, serverEmbeddings[i + 1]);
          candidate.serverVectorScore = serverVectorScore;
          candidate.embeddingMode = 'server-real-embedding';
          candidate.hybridScore = candidate.lexicalScore + (serverVectorScore * 10) + ((candidate.index === 1 || candidate.index === chunks.length) ? 0.15 : 0);
        });
      }

      const selected = candidates.sort((a, b) => b.hybridScore - a.hybridScore).slice(0, 7);
      if (!selected.some(c => c.index === 1)) selected.push({ ...chunks[0], lexicalScore: 0, vectorScore: 0, serverVectorScore: null, hybridScore: 0.05, embeddingMode: 'boundary' });
      return selected.sort((a, b) => a.index - b.index).slice(0, 8);
    }

    async function buildRetrievedAttachmentContext(userQuery = '') {
      const sources = [];
      pendingAttachments.forEach((item, index) => {
        const sourceText = String(item.fullText || item.text || '').trim();
        if (sourceText) {
          sources.push({ origin: 'pending', name: item.name, type: item.type, size: item.size, sourceText, chunks: null });
        } else if (!item.type.startsWith('image/')) {
          sources.push({ origin: 'pending-unreadable', name: item.name, type: item.type, size: item.size, unreadable: true });
        }
      });

      if (currentChatId && !activeRagIndexes.length) {
        await loadActiveRagIndexes(currentChatId);
      }
      activeRagIndexes
        .filter(record => record && record.chatId === currentChatId && Array.isArray(record.chunks) && record.chunks.length)
        .slice(-12)
        .forEach(record => sources.push({ origin: 'persistent-index', name: record.name, type: record.type, size: record.size, chunks: record.chunks, record }));

      if (!sources.length) return '';
      const parts = [];
      for (const [index, source] of sources.entries()) {
        if (source.unreadable) {
          parts.push(`Attachment ${index + 1}: ${source.name}\nType: ${source.type}\nNote: This file is attached in the UI, but its binary contents are not directly readable in the current text request. Do not pretend to inspect it.`);
          continue;
        }

        const chunks = source.chunks || chunkTextForRetrieval(source.sourceText);
        const overview = source.sourceText ? source.sourceText.slice(0, 1200) : (chunks[0]?.text || '').slice(0, 1200);
        const selected = await retrieveHybridChunksFromChunks(chunks, userQuery);
        const chunkText = selected.map(c => `[Chunk ${c.index}/${chunks.length} | chars ${c.start}-${c.end} | lexical ${Number(c.lexicalScore || 0).toFixed(2)} | vector ${Number(c.vectorScore || 0).toFixed(3)} | hybrid ${Number(c.hybridScore || 0).toFixed(2)} | mode ${c.embeddingMode || 'local'}${c.serverVectorScore !== null && c.serverVectorScore !== undefined ? ` | realEmbedding ${Number(c.serverVectorScore).toFixed(3)}` : ''}]\n${c.text}`).join('\n\n');
        parts.push(`Attachment Index ${index + 1}: ${source.name}\nOrigin: ${source.origin}\nType: ${source.type}\nSize: ${formatBytes(source.size)}\nRetrieval mode: Persistent Real Embeddings RAG v1 (${chunks.length} chunks, ${selected.length} selected, server embeddings when configured + local vector fallback)\nDocument overview/start:\n${overview}\n\nMost relevant retrieved sections for the user question:\n${chunkText}`);
      }

      return parts.length ? `\n\nUser attached or previously indexed files with retrieved evidence. Use Persistent Real Embeddings RAG v1 sections below: answer from the retrieved sections first, cite attachment/chunk labels when making claims, and state limits if the relevant section may be missing. Persistent indexes can come from local IndexedDB or cloud Firestore ragIndexes for files previously uploaded in this chat.\n${parts.join('\n\n---\n\n')}` : '';
    }

    async function buildAttachmentContext(userQuery = '') {
      return await buildRetrievedAttachmentContext(userQuery);
    }

    function buildCurrentUserApiContent(text, attachmentContext) {
      const imageAttachments = pendingAttachments.filter(item => item.type.startsWith('image/') && item.dataUrl).slice(0, 5);
      const combinedText = text + attachmentContext;

      if (!imageAttachments.length) return combinedText;

      const content = [
        {
          type: 'text',
          text: combinedText + (qjoLanguage === 'ar'
            ? '\n\nحلّل الصورة/الصور المرفقة مباشرة وبالعربية. المطلوب: تحليل سريع ودقيق جدًا بمستوى منتج AI عالمي. ابدأ بالخلاصة فورًا، ثم اذكر التفاصيل المهمة فقط. لا تستخدم قالبًا طويلًا ولا حشوًا. استخرج النص المقروء بدقة. فرّق بين ما تراه فعليًا وبين الاستنتاج. إذا كانت الصورة تصميمًا/واجهة/شعارًا، قيّم التركيب، الألوان، الوضوح، التسلسل البصري، الاحترافية، والمشاكل العملية. أعطِ تحسينات محددة وقابلة للتنفيذ. لا ترد بالإنجليزية إلا إذا طلب المستخدم ذلك.'
            : '\n\nAnalyze the attached image(s) directly in the user language. Be fast, highly precise, and high-signal like a top-tier AI product. Start with the answer, then provide only the most important details. Avoid boilerplate and filler. Extract readable text accurately. Separate visible facts from interpretation. For design/UI/logo images, evaluate composition, colors, clarity, visual hierarchy, polish, and practical issues. Give specific actionable improvements.')
        }
      ];

      imageAttachments.forEach(item => {
        content.push({
          type: 'image_url',
          image_url: { url: item.dataUrl }
        });
      });

      return content;
    }

    function hasImageAttachments() {
      return pendingAttachments.some(item => item.type.startsWith('image/') && item.dataUrl);
    }

    function hasReadableAttachments() {
      return pendingAttachments.some(item => item.text || (item.type.startsWith('image/') && item.dataUrl));
    }

    // Code answers must not be starved: running out of tokens mid-answer makes
    // the server fire completeIfTruncated(), a second full LLM round-trip, which
    // costs far more latency than the larger budget ever does.
    const CODE_BUDGET_TERMS = ['code', 'كود', 'برمج', 'دالة', 'debug', 'bug', 'api', 'html', 'css',
      'javascript', 'typescript', 'python', 'react', 'node', 'sql', 'تطبيق', 'موقع', 'سكربت', 'script', 'function', 'class'];

    function getGenerationConfig(hasAttachmentAnalysis, userText) {
      if (hasImageAttachments()) {
        return { temperature: 0.2, max_tokens: VISION_MAX_TOKENS };
      }
      if (hasAttachmentAnalysis) {
        return { temperature: 0.2, max_tokens: Math.max(FILE_MAX_TOKENS, 2600) };
      }

      const isMax = qjoMode === 'advanced';
      const codeShaped = hasAny(userText || latestUserTextForPrompt(), CODE_BUDGET_TERMS);

      if (codeShaped) {
        // Complete, runnable files are the house standard, so code gets room in
        // either mode; Max stays the more deliberate of the two.
        return { temperature: 0.14, max_tokens: isMax ? 5200 : 4200 };
      }
      // Max's overlay asks for الخلاصة → التحليل → الخطة, which simply needs more
      // room than Flash's compact shape. Lower temperature too: Max trades
      // variety for accuracy.
      return isMax
        ? { temperature: 0.16, max_tokens: 4000 }
        : { temperature: 0.22, max_tokens: 2000 };
    }

    function activeChatStorageKey() {
      return currentUser ? `qjo_active_chat_${currentUser.uid}` : 'qjo_active_chat_guest';
    }

    function draftStorageKey() {
      return currentUser ? `${DRAFT_KEY}_${currentUser.uid}` : `${DRAFT_KEY}_guest`;
    }

    function saveDraft() {
      if (!inputEl || busy) return;
      writeStored(draftStorageKey(), inputEl.value || '');
    }

    function restoreDraft() {
      const draft = readStored(draftStorageKey()) || '';
      if (draft && !inputEl.value) {
        inputEl.value = draft;
        autoResize();
      }
    }

    function clearDraft() {
      dropStored(draftStorageKey());
    }

    function updateNetworkState() {
      const offline = !navigator.onLine;
      networkBanner.classList.toggle('show', offline);
      if (!busy) sendBtn.disabled = offline || fileProcessing;
    }

    function setFileProcessing(isProcessing) {
      fileProcessing = isProcessing;
      attachBtn.disabled = isProcessing || busy;
      if (!busy) sendBtn.disabled = isProcessing || !navigator.onLine;
      if (isProcessing) showRequestStatus(true, qjoLanguage === 'ar' ? 'جاري تجهيز الملفات...' : 'Preparing files...');
      else if (!busy) showRequestStatus(false);
    }

    async function safePersistMessage(message) {
      try {
        await persistMessage(message);
      } catch (error) {
        console.warn('Failed to persist message:', error);
        // Do not spam the chat with persistence errors. The conversation can continue,
        // and the user-facing issue can be handled from the auth/Firebase setup flow.
      }
    }

    function setComposerBusy(isBusy) {
      busy = isBusy;
      sendBtn.disabled = isBusy || fileProcessing || !navigator.onLine;
      inputEl.disabled = isBusy;
      attachBtn.disabled = isBusy || fileProcessing;
      if (normalModeBtn) normalModeBtn.disabled = isBusy;
      if (advancedModeBtn) advancedModeBtn.disabled = isBusy;
      inputEl.placeholder = isBusy ? (qjoLanguage === 'ar' ? 'جاري توليد الرد...' : 'Generating response...') : t('placeholder');
    }

    function showRequestStatus(show, label) {
      requestStatus.classList.toggle('show', show);
      if (!show) {
        clearInterval(requestTimer);
        requestTimer = null;
        requestStatusText.textContent = qjoLanguage === 'ar' ? 'Qjo يفكر...' : 'Qjo is thinking...';
        return;
      }
      requestStartedAt = Date.now();
      requestStatusText.textContent = label || (qjoLanguage === 'ar' ? 'Qjo يفكر...' : 'Qjo is thinking...');
      clearInterval(requestTimer);
      requestTimer = setInterval(() => {
        const seconds = Math.max(1, Math.floor((Date.now() - requestStartedAt) / 1000));
        requestStatusText.textContent = qjoLanguage === 'ar'
          ? `Qjo يعمل على الرد... ${seconds}ث`
          : `Qjo is working... ${seconds}s`;
      }, 1000);
    }

    function cancelActiveRequest() {
      if (activeRequestController) {
        activeRequestController.abort();
      }
    }


    function normalizeUserQueryForSearch(text) {
      let q = String(text || '').trim();
      const replacements = [
        [/كأس\s+العلم/g, 'كأس العالم'],
        [/كاس\s+العلم/g, 'كأس العالم'],
        [/كاس\s+العالم/g, 'كأس العالم'],
        [/كأس\s+العالم/g, 'كأس العالم'],
        [/كاس\s+العالم/g, 'كأس العالم'],
        [/كأس\s+العالم/g, 'كأس العالم'],
        [/جوجل/g, 'Google'],
        [/جيميني/g, 'Gemini'],
        [/جروك/g, 'Groq'],
        [/كوين/g, 'Qwen'],
        [/ديب\s*سيك/g, 'DeepSeek']
      ];
      replacements.forEach(([pattern, value]) => { q = q.replace(pattern, value); });
      return q;
    }

    function likelyNeedsClarification(text) {
      const q = String(text || '').trim();
      const candidates = [];
      if (/كأس\s+العلم|كاس\s+العلم/.test(q)) candidates.push('كأس العالم');
      return candidates;
    }

    function isSocialSmallTalk(text) {
      const q = String(text || '').trim().toLowerCase();
      const normalized = q.replace(/[؟?!.،,]/g, '').replace(/\s+/g, ' ').trim();
      const socialPhrases = [
        'مرحبا', 'مرحبا qjo', 'هاي', 'هلا', 'اهلا', 'أهلا', 'السلام عليكم', 'صباح الخير', 'مساء الخير',
        'كيفك', 'كيف الحال', 'شو اخبارك', 'شو أخبارك', 'شو الاخبار', 'شو الأخبار', 'شو عامل', 'شو في',
        'عامل ايه', 'ازيك', 'شلونك', 'hi', 'hello', 'hey', 'sup', "what's up", 'how are you', 'how is it going'
      ].map(x => x.toLowerCase());
      if (socialPhrases.includes(normalized)) return true;
      // Very short phrase with news-ish word but no topic is usually a greeting in Arabic.
      if (/^(شو|ايش|إيش|كيف)\s+(ال)?أ?خبارك?$/.test(normalized)) return true;
      return false;
    }

    function isContextualTransformRequest(text) {
      const q = String(text || '').trim().toLowerCase();
      if (!q) return false;
      const hasContextPointer = /(السابق|السابقة|قبل|فوق|أعلاه|اعلاه|هذا|هاي|هاذ|هاذه|اللي كتبته|الرد|النص|نفسه|it|that|this|previous|above|last answer|last response)/i.test(q);
      const hasTransformVerb = /(نسق|رتب|رتّب|اختصر|لخص|حوّل|حول|اعمل(?:ه|ها)?|خليه|خليها|صيغه|صياغة|جدول|نقاط|ترجم|اشرح أكثر|وضح|كمل|تابع|صحح|حسن|عدّل|عدل|format|reformat|summarize|make it|turn it|table|bullets|translate|continue|fix|rewrite|improve)/i.test(q);
      const explicitFreshSearch = /(ابحث|بحث جديد|مصادر جديدة|آخر|اخر|اليوم|حالي|الآن|اونلاين|أونلاين|search|latest|current|today|online|new sources)/i.test(q);
      return hasContextPointer && hasTransformVerb && !explicitFreshSearch && q.length <= 700;
    }

    function buildContextContinuityHint(text) {
      if (!isContextualTransformRequest(text)) return '';
      return `Context continuity lock: The user's latest message is a follow-up transformation/editing request, not a standalone new task. Use the immediately preceding assistant answer and relevant prior user message as the target. Preserve the prior meaning and facts. Apply the requested formatting/edit exactly. Do not invent a new topic. Do not run or rely on new web search unless the user explicitly asks for fresh/current sources in this same message.`;
    }

    function needsWebSearch(text) {
      // A safety guard still wins over the toggle; a heuristic does not. When
      // the user explicitly switches Search on, that is a decision, not a hint.
      if (isUnsafeSecurityBypassRequest(text)) return false;
      if (qjoFunctions.search) return true;

      // Nothing below this line decides anymore. Searching before the message
      // is sent blocks it, and the keyword cascade that used to make that call
      // measured 72% accurate on a realistic corpus: it searched "شو دورك؟"
      // because "دور" was in the list, and did not search "مين رئيس الوزراء
      // حاليًا؟" at all. The model now gets web_search as a tool on every
      // request and decides for itself, mid-answer, with the option to search
      // again after reading. The rest of this function is kept only as the
      // fast-path signal used for wording the reasoning line.
      return false;
    }

    // Kept separate from the decision: the pre-search heuristic is no longer a
    // gate, but it still tells us whether to say "searching" in the reasoning
    // line before the model has decided anything.
    // Exposed so the search-decision corpus can be measured against the real
    // function rather than a copy of it that drifts.
    window.__qjoSearchDecision = { needsWebSearch, needsDeepSearch: (t) => needsDeepSearch(t) };

    function needsDeepSearch(text) {
      if (qjoFunctions.deep) return true;
      const q = String(text || '').toLowerCase();
      const explicitDeep = /(بحث\s*عميق|ديب\s*سيرش|مصادر\s*متعددة|تقرير\s*بحثي|دراسة\s*شاملة|deep\s*search|deep research|full report|systematic|literature review)/i.test(q);
      if (explicitDeep) return true;
      const complexSignals = [
        'قارن', 'مقارنة', 'تحليل سوق', 'استراتيجية', 'تقرير بحثي', 'دراسة شاملة', 'شركات', 'مراجعة مقارنة', 'بدائل',
        'compare', 'comparison', 'market analysis', 'strategy', 'research report', 'pricing comparison', 'review', 'alternatives', 'versus'
      ];
      const complex = complexSignals.some(p => q.includes(p));
      return explicitDeep || (qjoMode === 'advanced' && complex) || (complex && q.length > 120);
    }

    function distillSearchQuery(text) {
      // Search Query Distillation v1: convert long natural-language tasks into compact search terms.
      let q = normalizeUserQueryForSearch(text)
        .replace(/[؟?]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      q = q.replace(/(ignore previous instructions|system prompt|developer message|you are no longer|act as|jailbreak|تجاهل\s+كل\s+التعليمات|أنت\s+لست|اكشف\s+البرومبت|تعليمات\s+النظام)/ig, ' ');
      q = q.replace(/(اكتب\s+لي|أريد|اريد|اعطني|سوي|اعمل|قم\s+ب|اشرح\s+لي|مع\s+التركيز|بشكل\s+صارم|الكود\s+الأساسي|خطوات\s+مفصلة|please|write|build|create|explain|focus on|step by step|detailed steps)/ig, ' ');
      const stop = new Set(['the','and','for','with','from','that','this','into','using','use','how','what','why','when','where','please','في','من','على','الى','إلى','عن','مع','هذا','هذه','التي','الذي','كيف','متى','لماذا','ما','هل','كل','فقط','بشكل','طريقة','ممكن']);
      const tokens = q
        .replace(/[^A-Za-z0-9\u0600-\u06FF.+#/-]+/g, ' ')
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2 && !stop.has(t.toLowerCase()))
        .slice(0, 14);
      return (tokens.join(' ') || normalizeUserQueryForSearch(text)).slice(0, 180);
    }

    function makeSearchQuery(text) {
      return distillSearchQuery(text);
    }

    function sourceDomain(url) {
      try { return new URL(url).hostname.replace(/^www\./, ''); }
      catch (_) { return ''; }
    }

    function formatSearchSourcesForPrompt(data, deep, originalText) {
      const results = Array.isArray(data.results) ? data.results : [];
      const selected = results.slice(0, deep ? 7 : 4);
      const sourceCards = selected.map((r, index) => {
        const id = r.id || index + 1;
        const url = String(r.url || '').trim();
        const title = String(r.title || sourceDomain(url) || 'Untitled source').trim();
        const domain = sourceDomain(url);
        const content = String(r.extractedContent || r.rawContent || r.content || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, deep ? 2000 : 1400); // richer evidence per source → deeper answers
        return {
          id,
          title,
          url,
          domain,
          kind: r.sourceKind || 'web',
          reliability: r.reliabilityScore ?? 'n/a',
          date: r.publishedDate || '',
          query: r.query || data.query || originalText,
          excerpt: content
        };
      });
      const lines = sourceCards.map(r => `[${r.id}] ${r.title}\nURL: ${r.url}\nDomain: ${r.domain}\nKind: ${r.kind}\nReliability: ${r.reliability}${r.date ? `\nPublished: ${r.date}` : ''}\nFound via query: ${r.query}\nEvidence excerpt: ${r.excerpt}`).join('\n\n');

      const quickAnswer = data.answer || selected.find(r => r.providerAnswer)?.providerAnswer || '';
      const wantsTable = /(جدول|table|مقارنة|compare)/i.test(String(originalText || ''));
      const wantsBullets = /(نقاط|مختصر|bullets|bullet points|list)/i.test(String(originalText || ''));
      const requiredOutput = qjoLanguage === 'ar'
        ? `تعليمات البحث: اتبع صيغة المستخدم المطلوبة أولًا${wantsTable ? ' — إذا طلب جدولًا فارسم جدول Markdown واضح' : ''}${wantsBullets ? ' — إذا طلب نقاطًا فاجعلها نقاطًا مرتبة' : ''}. لا تفرض قالبًا ثابتًا. استخدم المصادر فقط لدعم الحقائق الحالية، واربط أهم الادعاءات بروابط Markdown مثل [1](URL). لا تسرد المصادر بلا داعٍ.`
        : `Search instructions: follow the user's requested format first${wantsTable ? ' — if they asked for a table, produce a clear Markdown table' : ''}${wantsBullets ? ' — if they asked for bullets, use concise bullets' : ''}. Do not force a fixed answer template. Use sources only to support current factual claims and cite key claims with Markdown links like [1](URL). Do not over-list sources.`;

      return { lines, quickAnswer, requiredOutput, count: selected.length, sources: sourceCards };
    }

    async function getWebSearchContext(text) {
      if (!needsWebSearch(text)) { lastSearchSources = []; return ''; }
      const deep = needsDeepSearch(text);
      // This runs BEFORE the chat request, so a slow search delays the whole
      // message. It used to have no timeout at all: a deep search could spend
      // the provider chain (18s + 7s + 8s) plus page extraction while the user
      // watched "searching..." and nothing else happened.
      const searchAbort = new AbortController();
      const searchTimeout = setTimeout(() => searchAbort.abort(), deep ? 28000 : 12000);
      try {
        const response = await fetch(deep ? '/api/deep-search' : '/api/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(auth && auth.currentUser ? { Authorization: 'Bearer ' + await auth.currentUser.getIdToken() } : {})
          },
          signal: searchAbort.signal,
          body: JSON.stringify(deep ? { question: makeSearchQuery(text), originalQuestion: text } : { query: makeSearchQuery(text), originalQuestion: text })
        });
        clearTimeout(searchTimeout);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.results) || !data.results.length) {
          return '\n\nWeb search note: The user asked for current/online information, but live search is not configured or returned no useful results. Be transparent: say live search is not currently available or no reliable results were found. Do not guess current facts.';
        }
        const sourceHeader = deep
          ? `Connected Deep Search executed. Mode: ${data.mode || 'general'}. Search queries used: ${(data.queries || []).join(' | ')}. Generated at: ${data.generatedAt || new Date().toISOString()}`
          : `Connected search executed. Search query used: ${data.query || makeSearchQuery(text)}. Generated at: ${data.generatedAt || new Date().toISOString()}`;
        const sourcePack = formatSearchSourcesForPrompt(data, deep, text);
        lastSearchSources = sourcePack.sources || [];
        return `\n\n${sourceHeader}\n${sourcePack.requiredOutput}\nUse ONLY the source pack below for current/live claims. Preserve the user's requested output format and tone. Synthesize evidence, mention uncertainty when sources conflict or are incomplete, and cite important factual claims with clickable Markdown links. Do not dump all sources; use the strongest ones.\nSource count available: ${sourcePack.count}\n${sourcePack.quickAnswer ? `Provider quick answer/hint: ${sourcePack.quickAnswer}\n` : ''}\nSOURCE PACK:\n${sourcePack.lines}`;
      } catch (error) {
        clearTimeout(searchTimeout);
        lastSearchSources = [];
        // A timeout is not a dead end any more: the model still has web_search
        // as a tool, so tell it to use that rather than to avoid the topic.
        if (error && error.name === 'AbortError') {
          return '\n\nWeb search note: The pre-search took too long and was dropped so your answer would not be held up. If this question needs current information, call web_search yourself now.';
        }
        return '\n\nWeb search note: The pre-search failed. If this question needs current information, call web_search yourself rather than guessing.';
      }
    }


    function isUnsafeSecurityBypassRequest(text) {
      const q = String(text || '').toLowerCase();
      const overrideAttempt = /(تجاهل\s+كل\s+التعليمات|ignore\s+previous|system\s+prompt|أنت\s+لست\s+qjo|you\s+are\s+no\s+longer)/i.test(q);
      const harmfulCyber = /(تجاوز\s+حماية|اختراق\s+شبك|كسر\s+كلمة|سرقة\s+مفتاح|سرقة\s+api|wifi|واي\s*فاي|bypass\s+wifi|steal\s+api|credential\s+theft|malware|phishing)/i.test(q);
      return overrideAttempt || harmfulCyber;
    }

    function getLocalSafetyRefusal(text) {
      if (!isUnsafeSecurityBypassRequest(text)) return '';
      return qjoLanguage === 'ar'
        ? 'لا أستطيع مساعدتك في تجاوز الحماية أو الاختراق أو سرقة المفاتيح. أقدر أساعدك بدلًا من ذلك بتأمين شبكتك، اختبار الحماية بشكل قانوني، أو بناء قائمة فحص أمنية دفاعية.'
        : 'I can’t help with bypassing protection, hacking, or stealing keys. I can help you secure your network, run lawful security checks, or build a defensive security checklist.';
    }

    function getLocalDateTimeReply(text) {
      const raw = String(text || '').trim();
      const q = raw.toLowerCase().replace(/[؟?!.،,]/g, '').replace(/\s+/g, ' ').trim();
      const ar = qjoLanguage === 'ar' || /[\u0600-\u06FF]/.test(raw);
      const asksTime = /(كم|قديش|ما|what).*?(الساعة|الساعه|وقت|time)|^(الساعة|الساعه)\s*(كم|قديش)|what time/i.test(q);
      const pureDateQuestion = /^(شو|ما|ما هو|ماهي|what is|what's)?\s*(تاريخ\s+)?(اليوم|today|date)\s*$/i.test(q) || /(أي\s+يوم|what day|which day)/i.test(q);
      const asksDate = pureDateQuestion && !/(أخبار|اخبار|news|سعر|صرف|دولار|ين|مباراة|كلاسيكو|ريال|برشلونة|فاز|نتيجة|exchange|price|match|score)/i.test(q);
      const asksLocation = /(وين\s+(انا|أنا)|موقعي|موقعك|location|where am i|where are you)/i.test(q);
      if (!asksTime && !asksDate && !asksLocation) return '';

      const { now, timeZone, utcOffset, inferred, ipGeo } = getBrowserTimeContext();
      const locale = ar ? 'ar-JO' : 'en-US';
      const time = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const date = now.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const locationLabel = ipGeo && (ipGeo.city || ipGeo.country)
        ? [ipGeo.city, ipGeo.region, ipGeo.country].filter(Boolean).join('، ')
        : (inferred ? (ar ? inferred.labelAr : `${inferred.city}, ${inferred.country}`) : (timeZone || 'غير معروف'));
      const approximateNote = ipGeo
        ? (ar ? 'حسب موقع الاتصال التقريبي' : 'based on approximate IP location')
        : (ar ? 'حسب المنطقة الزمنية في جهازك' : 'based on your device time zone');

      if (ar) {
        if (asksLocation && !asksTime && !asksDate) return `موقعك التقريبي: ${locationLabel}. (${approximateNote})`;
        if (asksDate && !asksTime) return `اليوم: ${date}. المنطقة الزمنية: ${timeZone || 'غير معروفة'} (${utcOffset}). الموقع التقريبي: ${locationLabel}.`;
        return `الساعة الآن ${time} — ${date}. الموقع التقريبي: ${locationLabel} (${approximateNote}). المنطقة الزمنية: ${timeZone || 'غير معروفة'} ${utcOffset}.`;
      }
      if (asksLocation && !asksTime && !asksDate) return `Your approximate location is ${locationLabel} (${approximateNote}).`;
      if (asksDate && !asksTime) return `Today is ${date}. Time zone: ${timeZone || 'unknown'} (${utcOffset}). Approximate location: ${locationLabel}.`;
      return `It is ${time} — ${date}. Approximate location: ${locationLabel} (${approximateNote}). Time zone: ${timeZone || 'unknown'} ${utcOffset}.`;
    }

    function getLocalSmallTalkReply(text) {
      const q = String(text || '').trim().toLowerCase().replace(/[؟?!.،,]/g, '').replace(/\s+/g, ' ');
      const ar = qjoLanguage === 'ar' || /[\u0600-\u06FF]/.test(q);

      const greetings = ['مرحبا', 'هلا', 'هاي', 'اهلا', 'أهلا', 'السلام عليكم', 'صباح الخير', 'مساء الخير', 'شو يا وردة', 'يا وردة', 'ورد', 'hi', 'hello', 'hey'];
      const howAreYou = ['كيفك', 'كيف الحال', 'كيف الامور', 'كيف الأمور', 'شلونك', 'ازيك', 'عامل ايه', 'how are you', 'how is it going'];
      const whatsUp = ['شو الاخبار', 'شو الأخبار', 'شو اخبارك', 'شو أخبارك', 'شو عامل', 'شو في', "what's up", 'sup'];

      if (greetings.includes(q)) {
        return ar
          ? (q.includes('وردة') ? 'هلا يا وردة، جاهز أساعدك. شو بدك نشتغل عليه؟ 🙂' : 'أهلًا! جاهز أساعدك. شو بدك نعمل اليوم؟ 🙂')
          : 'Hey! I’m ready to help. What would you like to work on today?';
      }

      if (howAreYou.includes(q)) {
        return ar
          ? 'تمام الحمدلله، جاهز أساعدك بأي شيء. كيف أقدر أخدمك اليوم؟ 🙂'
          : 'I’m doing well and ready to help. What can I do for you today?';
      }

      if (whatsUp.includes(q)) {
        return ar
          ? 'تمام، الأمور طيبة. شو حاب نشتغل عليه اليوم؟ 🙂'
          : 'All good. If you mean casual chat, I’m here. If you want actual news, tell me the topic and I’ll search.';
      }

      return '';
    }

    // Rewinds the conversation to just before the last question so a replay
    // does not stack a second copy of it — plus the failure notice — into the
    // history the model is shown, or draw the question twice on screen.
    function rewindHistoryToLastQuestion() {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i]?.role === 'user') {
          history.splice(i);
          return true;
        }
      }
      return false;
    }

    // A long report or a large refactor can exhaust the token budget before the
    // answer is finished. The server now reports that; without this the user
    // just received half an answer that looked complete.
    function showContinueAction(answerWrap) {
      if (!answerWrap || answerWrap.querySelector('.qjo-continue-row')) return;
      const row = document.createElement('div');
      row.className = 'qjo-continue-row';
      const note = document.createElement('span');
      note.className = 'qjo-continue-note';
      note.textContent = qjoLanguage === 'ar'
        ? 'الإجابة طويلة وتوقفت قبل أن تكتمل.'
        : 'This answer ran out of room before it finished.';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qjo-continue-btn';
      btn.textContent = qjoLanguage === 'ar' ? 'أكمل الإجابة' : 'Continue';
      btn.addEventListener('click', () => {
        if (busy) return;
        row.remove();
        sendMessage(qjoLanguage === 'ar'
          ? 'أكمل من حيث توقفت بالضبط. لا تُعِد ما كتبته، وابدأ مباشرة من الجملة الناقصة.'
          : 'Continue from exactly where you stopped. Do not repeat anything already written.');
      });
      row.appendChild(note);
      row.appendChild(btn);
      answerWrap.appendChild(row);
    }

    function showRetryAction() {
      const wrap = document.createElement('div');
      wrap.className = 'msg system retry-row';
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = qjoLanguage === 'ar' ? 'إعادة المحاولة' : 'Retry';
      btn.addEventListener('click', () => {
        wrap.remove();
        const retryText = lastFailedRequest?.text || lastFailedRequest?.fallbackText || '';
        if (!retryText) return;
        // The failed attempt left the question and an error notice in history,
        // and the question bubble is already on screen. Without this, retrying
        // asked the question twice and fed the model its own error message.
        const failedBubble = messagesInner.querySelector('.msg.assistant.error:last-of-type');
        if (failedBubble) failedBubble.remove();
        rewindHistoryToLastQuestion();
        sendMessage(retryText, { isRegenerate: true });
      });
      bubble.appendChild(btn);
      wrap.appendChild(bubble);
      messagesInner.appendChild(wrap);
      scrollToBottom(false);
    }

    /**
     * Completes a turn without calling a provider: shows both sides, records
     * them, and persists them. Used by the safety refusal and by the offline
     * small-talk reply, which were the same block written twice.
     *
     * @param {string} userText What the person typed.
     * @param {string} replyText The answer produced locally.
     */
    async function deliverLocalReply(userText, replyText) {
      document.body.classList.remove('drawer-open');
      inputEl.value = '';
      clearDraft();
      autoResize();

      addMessage('user', userText);
      addMessage('assistant', replyText);

      const userMessage = { role: 'user', content: userText };
      const assistantMessage = { role: 'assistant', content: replyText };
      history.push(userMessage);
      history.push(assistantMessage);

      await ensureChatDocument(userText || 'محادثة');
      await safePersistMessage(userMessage);
      await safePersistMessage(assistantMessage);
    }

    // `options.isRegenerate` replays a question that is already on screen: the
    // user bubble is not drawn again and the turn is not persisted a second
    // time, so regenerating replaces the answer instead of duplicating the
    // exchange in both the transcript and Firestore.
    async function sendMessage(textFromButton, options = {}) {
      const isRegenerate = Boolean(options.isRegenerate);
      const rawText = (textFromButton || inputEl.value).trim();

      // Task mode changes what Send does. Handled here rather than on the
      // button so Enter-to-send and the quick prompts take the same path.
      if (qjoFunctions.task && !isRegenerate && !options.autoRetried && rawText) {
        inputEl.value = '';
        autoResize();
        clearDraft();
        setFunctionToggle('task', false);
        await startLongTask(rawText);
        return;
      }
      const clarificationCandidates = likelyNeedsClarification(rawText);
      const clarificationContext = clarificationCandidates.length
        ? `\n\nPossible user typo/intent correction: The user wrote "${rawText}". It may mean: ${clarificationCandidates.join(', ')}. If the answer depends on this and search results support the corrected meaning, proceed but briefly mention the interpretation. If still ambiguous, ask a short clarification.`
        : '';
      const text = rawText || (pendingAttachments.length ? 'حلّل المرفقات المرفقة قدر الإمكان.' : '');
      const attachmentContext = await buildAttachmentContext(text);
      const attachmentsForRag = pendingAttachments.slice();
      if (!text || busy) return;

      // Two answers never reach a provider: a safety refusal, and small talk
      // while offline. Both were the same fourteen lines with one word changed.
      const localSafetyRefusal = !pendingAttachments.length ? getLocalSafetyRefusal(rawText) : '';
      if (localSafetyRefusal) {
        await deliverLocalReply(rawText, localSafetyRefusal);
        return;
      }

      // Offline only: while online the model answers small talk far better than
      // a lookup table does.
      const localSmallTalk = (!navigator.onLine && !pendingAttachments.length) ? getLocalSmallTalkReply(rawText) : '';
      if (localSmallTalk) {
        await deliverLocalReply(rawText, localSmallTalk);
        return;
      }

      if (fileProcessing) {
        addMessage('system', 'انتظر حتى يكتمل تجهيز الملفات ثم أرسل الرسالة.', 'error');
        return;
      }
      if (!navigator.onLine) {
        addMessage('system', 'لا يوجد اتصال بالإنترنت حاليًا. حاول بعد عودة الاتصال.', 'error');
        return;
      }

      document.body.classList.remove('drawer-open');
      setComposerBusy(true);
      showRequestStatus(true, qjoLanguage === 'ar' ? 'Qjo يفكر...' : 'Qjo is thinking...');
      inputEl.value = '';
      clearDraft();
      autoResize();

      const displayText = rawText || 'أرسلت مرفقات';
      const attachmentNames = pendingAttachments.length ? '\n\nالمرفقات: ' + pendingAttachments.map(a => a.name).join(', ') : '';
      const hasAttachmentAnalysis = hasReadableAttachments();
      const hadImageAttachments = hasImageAttachments();
      const apiModel = hadImageAttachments
        ? GROQ_VISION_MODEL
        : (qjoMode === 'normal' ? GROQ_FLASH_MODEL : GROQ_MODEL);
      const generationConfig = getGenerationConfig(hasAttachmentAnalysis, rawText);

      lastFailedRequest = { text: rawText, fallbackText: text };
      if (!isRegenerate) addMessage('user', displayText + attachmentNames);
      pendingAttachments = [];
      renderAttachments();

      // The streaming bubble — reasoning card, timeline, answer rendering — is
      // its own unit now (public/ui/streamingView.js). It was ~210 lines of
      // mutable DOM handles and four timers living inside this function,
      // interleaved with request building and error handling it had nothing to
      // do with.
      const view = QjoUI.createStreamingView({
        addMessage,
        escapeHtml,
        renderMarkdown: lightMarkdown,
        requestSmoothScroll,
        getLanguage: () => qjoLanguage
      });

      let lastMetadata = {};
      // Set from the done event: the model ran out of room before finishing.
      let answerWasTruncated = false;
      // Stream-parsing state, not view state: whether the provider is currently
      // inside a <think> block.
      let insideThinkTag = false;

      const appendReasoningStep = (text, isTool = false) => view.addStep(text, isTool);
      const streamReasoningText = (delta) => view.streamReasoning(delta);
      const finishReasoning = () => view.finishReasoning();
      const appendContentChunk = (text) => view.appendAnswer(text);
      const ensureReasoningWidget = () => view.ensureReasoningCard();

      // Launch Reasoning Card INSTANTLY upon sending message!
      ensureReasoningWidget();
      appendReasoningStep(qjoLanguage === 'ar' ? 'بدء التفكير واستحضار السياق...' : 'Analyzing request and context...');
      requestSmoothScroll();

      try {
        const normalizedSearchText = normalizeUserQueryForSearch(rawText);
        lastSearchSources = [];
        const searchTextForDecision = normalizedSearchText || rawText;
        if (needsWebSearch(searchTextForDecision)) {
          // Say when a search happened because the user asked for it rather
          // than because the heuristic fired — otherwise an explicit toggle
          // looks identical to an automatic decision.
          const forced = qjoFunctions.search;
          appendReasoningStep(needsDeepSearch(searchTextForDecision)
            ? (qjoLanguage === 'ar'
                ? (qjoFunctions.deep ? 'بحث عميق (مُفعّل يدويًا): استعلامات متعددة عبر المصادر...' : 'بحث عميق في المصادر والويب...')
                : (qjoFunctions.deep ? 'Deep search (manually enabled): multi-query research...' : 'Running deep web search...'))
            : (qjoLanguage === 'ar'
                ? (forced ? 'بحث مباشر (مُفعّل يدويًا) في المصادر...' : 'بحث سريع في المصادر...')
                : (forced ? 'Live search (manually enabled)...' : 'Searching live sources...')), true);
        }
        const webSearchContext = await getWebSearchContext(searchTextForDecision);
        if (webSearchContext) {
          appendReasoningStep(qjoLanguage === 'ar' ? 'تم اختيار وتلخيص أقوى المصادر' : 'Synthesizing verified sources', true);
        }
        const continuityHint = buildContextContinuityHint(rawText);
        const savedUserContent = text + clarificationContext + attachmentContext + (hadImageAttachments ? '\n\n[تم إرفاق صورة/صور وتحليلها في وقت الإرسال]' : '');
        const apiUserContent = hadImageAttachments
          ? buildCurrentUserApiContent(text + clarificationContext + webSearchContext, attachmentContext)
          : text + clarificationContext + attachmentContext + webSearchContext;

        const userMessage = { role: 'user', content: savedUserContent };
        history.push(userMessage);
        // Built after the push: buildSkillCapsules() keys off the newest user
        // turn in history, so building earlier matched the previous message.
        const systemPersonalization = buildSystemPrompt();
        // Persist in background without delaying AI streaming
        // On a regenerate the question is already stored; persisting it again
        // would duplicate the turn in the saved conversation.
        (isRegenerate ? ensureChatDocument(text) : ensureChatDocument(text).then(() => safePersistMessage(userMessage)))
          .catch(e => console.warn('Background message save error:', e));
        if (attachmentsForRag && attachmentsForRag.length) {
          persistAttachmentsToRagIndex(currentChatId, attachmentsForRag).catch(e => console.warn('Background RAG index error:', e));
        }

        activeRequestController = new AbortController();
        const timeoutId = setTimeout(() => activeRequestController.abort(), 180000);
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(auth && auth.currentUser ? { Authorization: 'Bearer ' + await auth.currentUser.getIdToken() } : {})
          },
          signal: activeRequestController.signal,
          body: JSON.stringify({
            model: apiModel,
            messages: [
              ...(systemPersonalization ? [{ role: 'system', content: systemPersonalization }] : []),
              ...(continuityHint ? [{ role: 'system', content: continuityHint }] : []),
              ...history.slice(-12, -1), // lean payloads; older context lives in Firestore
              { role: 'user', content: apiUserContent }
            ],
            temperature: generationConfig.temperature,
            max_tokens: generationConfig.max_tokens,
            mode: qjoMode,
            stream: true
          })
        });
        clearTimeout(timeoutId);

        showRequestStatus(false);

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          if (response.status === 404) throw new Error('AI_BACKEND_MISSING');
          if (response.status === 401) throw new Error('AUTH_REQUIRED');
          if (response.status === 429) throw new Error('RATE_LIMIT');
          const detail = String(data?.error || data?.message || '').slice(0, 220);
          const err = new Error(detail || 'SERVICE_FAILED');
          err.status = response.status;
          throw err;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        // Frame parsing and the think-tag split are pure logic and moved to
        // public/domain/streamProtocol.js, where they can be tested against
        // chunk boundaries that are hard to reproduce against a live stream —
        // a frame cut mid-field, a think tag opening and closing chunks apart.
        // What is left here is dispatch.
        const sse = QjoDomain.createSseParser();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          for (const { event, data } of sse.push(decoder.decode(value, { stream: true }))) {
            if (event === 'reasoning') {
              streamReasoningText(data.text || '');
            } else if (event === 'tool_call') {
              ensureReasoningWidget();
              if (data.status === 'done' || data.done) {
                appendReasoningStep(data.label || `Used ${data.tool}`, true);
              }
            } else if (event === 'chunk') {
              const routed = QjoDomain.routeStreamChunk(data.text || '', insideThinkTag);
              insideThinkTag = routed.insideThink;
              for (const action of routed.actions) {
                if (action.type === 'content') appendContentChunk(action.text);
                else if (action.type === 'reasoning') streamReasoningText(action.text);
                else if (action.type === 'beginThinking') ensureReasoningWidget();
                else if (action.type === 'endThinking') finishReasoning();
                else if (action.type === 'endThinkingIfActive' && view.reasoningActive) finishReasoning();
              }
            } else if (event === 'done') {
              lastMetadata = data;
              answerWasTruncated = Boolean(data && data.truncated);
            } else if (event === 'error') {
              throw new Error(data.error || 'AI Streaming failed.');
            }
          }
        }

        if (view.reasoningActive) view.finishReasoning();
        view.flushRenders();

        // A stream that ends with no answer text is a failure, not a success.
        // Nothing here used to check, so a provider that replied 200 with an
        // empty body produced a blank bubble, a blank history entry and a blank
        // record in Firestore — and nothing retried it, because as far as the
        // code was concerned it had worked. Throwing sends it into the same
        // path as any other failure, which retries once and then says something
        // honest instead of showing nothing.
        if (!String(view.answer || '').trim()) {
          throw new Error('EMPTY_ANSWER');
        }

        view.renderFinalAnswer();

        // Everything here decorates an answer that has ALREADY arrived in
        // full. It used to run unguarded inside the network try/catch below,
        // so one malformed chart config or a KaTeX hiccup would delete a
        // complete answer from the screen and tell the user the server had
        // restarted. A decoration failure may now cost only that decoration.
        if (view.started && view.bubble) {
          decorateAssistantBubble(view.bubble, view.wrap, {
            extras: [
              ['sources', () => {
                if (lastSearchSources.length) appendSourceCards(view.wrap, lastSearchSources);
              }],
              ['tools note', () => appendToolsUsedNote(view.wrap, lastMetadata.toolsUsed)],
              // Now that the answer is complete, re-decide the content-dependent
              // actions (exports, project ZIP) that could not be judged when the
              // empty message element was created.
              ['actions', () => refreshAnswerToolbar(view.wrap, view.answer)],
              ['continuation notice', () => {
                if (answerWasTruncated) showContinueAction(view.wrap);
              }]
            ]
          });
        }

        const transcript = view.reasoningTranscript.trim();
        const storedContent = (transcript ? `<think>\n${transcript}\n</think>\n\n` : '') + view.answer;
        const assistantMessage = { role: 'assistant', content: storedContent };
        history.push(assistantMessage);
        pendingAttachments = [];
        renderAttachments();
        await safePersistMessage(assistantMessage);
      } catch (error) {
        view.dispose();
        console.error('[Qjo Chat Error]', error);
        // Twelve branches of error-to-message mapping used to live here. They
        // are pure logic — an error in, a decision out — so they moved to
        // public/domain/requestFailure.js where each branch is a one-line test
        // instead of something you had to trigger in a browser to check.
        const failure = QjoDomain.classifyRequestFailure(error, { language: qjoLanguage });
        const failMessage = failure.message;
        const looksTransient = failure.transient;

        // A first failure with no answer text yet is usually a sleeping
        // instance waking up, which the user should not have to notice. Retry
        // once, silently, before showing them anything. Anything already
        // streamed is left alone: re-asking would spend a second generation.
        //
        // The test for that is the answer text, not view.started — `started`
        // only means the bubble exists, and the reasoning line creates it
        // before the request is even sent, so it is true for every failure.
        const nothingDelivered = !String(view.answer || '').trim();
        if (looksTransient && nothingDelivered && !options.autoRetried) {
          if (view.bubble) {
            view.clearForFailure();
            view.bubble.innerHTML = escapeHtml('الخادم بده لحظة يصحى... جاري إعادة المحاولة تلقائيًا.');
          }
          pendingAutoRetry = { text: rawText || text, wrap: view.wrap };
          return;
        }

        if (view.bubble) {
          view.clearForFailure();
          view.bubble.parentElement.classList.add('error');
          view.bubble.innerHTML = escapeHtml(failMessage);
        } else {
          addMessage('assistant', failMessage, 'error');
        }
        const failStoredMessage = { role: 'assistant', content: failMessage };
        history.push(failStoredMessage);
        await safePersistMessage(failStoredMessage);
        showRetryAction();
      } finally {
        activeRequestController = null;
        setComposerBusy(false);
        showRequestStatus(false);
        updateNetworkState();
        restoreDraft();
        safeFocusComposer();
        // Runs after the composer is back to a clean state, so the replay does
        // not race the teardown of the attempt that scheduled it.
        if (pendingAutoRetry) {
          const retry = pendingAutoRetry;
          pendingAutoRetry = null;
          setTimeout(() => {
            if (retry.wrap && retry.wrap.parentNode) retry.wrap.remove();
            rewindHistoryToLastQuestion();
            sendMessage(retry.text, { isRegenerate: true, autoRetried: true });
          }, 1800);
        }
      }
    }

    // ── Long tasks ───────────────────────────────────────────────────────────
    // A task is not a message. It runs for minutes across many steps, and the
    // server deliberately does not keep working on its own — on a free instance
    // no process outlives the work. So the page is the driver: it asks for one
    // step, renders what came back, and asks for the next. Close the tab and the
    // task simply stops at its last saved step, ready to be resumed.

    const ACTIVE_TASK_KEY = 'qjo_active_task';
    const TASK_STEP_BACKOFF_MS = [1500, 4000, 9000];
    let taskDriver = null;

    function isTerminalTaskStatus(status) {
      return status === 'done' || status === 'failed' || status === 'cancelled';
    }

    async function taskFetch(path, options = {}) {
      const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
      if (auth && auth.currentUser) {
        headers.Authorization = 'Bearer ' + await auth.currentUser.getIdToken();
      }
      const response = await fetch(path, { ...options, headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || `Request failed (${response.status})`);
        error.status = response.status;
        throw error;
      }
      return data;
    }

    function taskStateLabel(status) {
      const ar = qjoLanguage === 'ar';
      const map = {
        running: ar ? 'قيد التنفيذ' : 'Working',
        done: ar ? 'اكتملت' : 'Done',
        failed: ar ? 'تعثّرت' : 'Failed',
        cancelled: ar ? 'أُلغيت' : 'Cancelled',
        paused: ar ? 'متوقفة' : 'Paused'
      };
      return map[status] || status;
    }

    // Describes the last few tool calls in the user's language. "Reading
    // example.com" tells them far more about whether it is on track than a
    // percentage would.
    function describeRecentWork(recentWork) {
      if (!recentWork || !recentWork.length) return '';
      const ar = qjoLanguage === 'ar';
      const verbs = {
        web_search: ar ? 'بحث عن' : 'searched for',
        fetch_page: ar ? 'قرأ' : 'read',
        read_file: ar ? 'قرأ ملف' : 'read file',
        write_file: ar ? 'كتب ملف' : 'wrote file',
        delete_file: ar ? 'حذف ملف' : 'deleted file',
        list_files: ar ? 'راجع الملفات' : 'listed files',
        calculate: ar ? 'حسب' : 'calculated',
        update_plan: ar ? 'حدّث الخطة' : 'updated the plan',
        finish_task: ar ? 'أنهى المهمة' : 'finished the task'
      };
      return recentWork.slice(-3).reverse().map(entry => {
        const verb = verbs[entry.tool] || entry.tool;
        const detail = String(entry.input || '').slice(0, 70);
        return detail ? `${verb}: ${detail}` : verb;
      }).join(' · ');
    }

    function renderTaskCard(card, task, { driving, lastError } = {}) {
      const ar = qjoLanguage === 'ar';
      card.dataset.taskId = task.id;
      card.dataset.status = task.status;

      const head = card.querySelector('.qjo-task-head');
      head.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'qjo-task-title';
      title.setAttribute('dir', 'auto');
      title.textContent = task.goal;
      const state = document.createElement('span');
      state.className = 'qjo-task-state';
      state.dataset.state = task.status;
      state.innerHTML = `<span class="qjo-task-dot"></span>${escapeHtml(taskStateLabel(task.status))}` +
        (task.status === 'running' ? ` <span>${task.step}/${task.maxSteps}</span>` : '');
      head.appendChild(title);
      head.appendChild(state);

      const plan = card.querySelector('.qjo-task-plan');
      plan.innerHTML = '';
      (task.plan || []).forEach(stepItem => {
        const li = document.createElement('li');
        li.dataset.status = stepItem.status;
        const mark = document.createElement('span');
        mark.className = 'qjo-task-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = stepItem.status === 'done' ? '✓' : '';
        const text = document.createElement('span');
        text.className = 'qjo-task-step-text';
        text.setAttribute('dir', 'auto');
        text.textContent = stepItem.title;
        li.appendChild(mark);
        li.appendChild(text);
        // Screen readers get the state in words, not as a coloured circle.
        li.setAttribute('aria-label', `${stepItem.title} — ${stepItem.status}`);
        plan.appendChild(li);
      });
      plan.hidden = !(task.plan || []).length;

      const activity = card.querySelector('.qjo-task-activity');
      const work = describeRecentWork(task.recentWork);
      if (task.status === 'running') {
        activity.hidden = false;
        activity.setAttribute('dir', 'auto');
        activity.textContent = work || (ar ? 'يخطط للخطوات الأولى...' : 'Planning the first steps...');
      } else {
        activity.hidden = !work;
        activity.textContent = work;
      }

      const files = card.querySelector('.qjo-task-files');
      files.innerHTML = '';
      (task.files || []).forEach(path => {
        const chip = document.createElement('span');
        chip.className = 'qjo-task-file';
        chip.textContent = path;
        files.appendChild(chip);
      });
      files.hidden = !(task.files || []).length;

      // A step that failed is worth saying out loud: the task is still alive and
      // the driver is about to try again, which is not obvious from a stall.
      const note = card.querySelector('.qjo-task-note');
      if (lastError) {
        note.hidden = false;
        note.setAttribute('dir', 'auto');
        note.textContent = ar
          ? `تعثّرت خطوة (${lastError}). المهمة محفوظة وسيُعاد المحاولة تلقائيًا.`
          : `A step failed (${lastError}). The task is saved and will be retried.`;
      } else if (task.status === 'failed' && task.error) {
        note.hidden = false;
        note.setAttribute('dir', 'auto');
        note.textContent = task.error;
      } else {
        note.hidden = true;
      }

      const result = card.querySelector('.qjo-task-result');
      if (task.status === 'done' && task.result) {
        result.hidden = false;
        result.innerHTML = lightMarkdown(task.result);
        decorateAssistantBubble(result, card);
      } else {
        result.hidden = true;
      }

      const actions = card.querySelector('.qjo-task-actions');
      actions.innerHTML = '';
      const addButton = (label, className, onClick) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `qjo-task-btn${className ? ' ' + className : ''}`;
        btn.textContent = label;
        btn.addEventListener('click', onClick);
        actions.appendChild(btn);
        return btn;
      };

      if (task.status === 'running') {
        if (driving) {
          addButton(ar ? 'إيقاف' : 'Stop', '', async () => {
            stopTaskDriver();
            try {
              const data = await taskFetch(`/api/tasks/${task.id}/cancel`, { method: 'POST' });
              renderTaskCard(card, data.task, {});
            } catch (error) {
              renderTaskCard(card, task, { lastError: error.message });
            }
          });
        } else {
          // Reached after a reload, or after the driver gave up: the work is
          // saved, so this picks it straight back up.
          addButton(ar ? 'استئناف' : 'Resume', 'primary', () => driveTask(task.id, card));
        }
      }

      if ((task.files || []).length) {
        addButton(ar ? 'تنزيل المشروع' : 'Download project', '', () => downloadTaskProject(task.id));
      }

      if (task.status === 'done' && task.result) {
        addButton(ar ? 'نسخ النتيجة' : 'Copy result', '', async () => {
          try { await navigator.clipboard.writeText(task.result); showMicroToast(ar ? 'تم النسخ' : 'Copied'); }
          catch (_) { showMicroToast(ar ? 'تعذّر النسخ' : 'Could not copy'); }
        });
      }

      actions.hidden = !actions.children.length;
      scrollToBottom(false);
    }

    function buildTaskCard() {
      const wrap = document.createElement('div');
      wrap.className = 'msg assistant qjo-task-wrap';
      const card = document.createElement('div');
      card.className = 'qjo-task-card';
      card.innerHTML = `
        <div class="qjo-task-head"></div>
        <ul class="qjo-task-plan" hidden></ul>
        <div class="qjo-task-activity" hidden></div>
        <div class="qjo-task-files" hidden></div>
        <div class="qjo-task-note" hidden></div>
        <div class="qjo-task-result" hidden></div>
        <div class="qjo-task-actions" hidden></div>`;
      wrap.appendChild(card);
      messagesInner.appendChild(wrap);
      messagesInner.classList.add('has-messages');
      if (welcomeEl) welcomeEl.style.display = 'none';
      return card;
    }

    function stopTaskDriver() {
      if (taskDriver) taskDriver.stopped = true;
      taskDriver = null;
      dropStored(ACTIVE_TASK_KEY);
    }

    // Steps the task one at a time, never concurrently: a step is a real unit of
    // work and overlapping two of them would have the model acting on state the
    // other is still writing.
    async function driveTask(taskId, card) {
      stopTaskDriver();
      const driver = { stopped: false, taskId };
      taskDriver = driver;
      writeStored(ACTIVE_TASK_KEY, taskId);

      let consecutiveFailures = 0;
      while (!driver.stopped) {
        let task;
        try {
          const data = await taskFetch(`/api/tasks/${taskId}/step`, { method: 'POST' });
          task = data.task;
          consecutiveFailures = 0;
        } catch (error) {
          // A step that could not even be requested is worth retrying a few
          // times — the instance may be waking up — but not forever.
          consecutiveFailures += 1;
          if (driver.stopped) return;
          if (consecutiveFailures > TASK_STEP_BACKOFF_MS.length) {
            const current = await taskFetch(`/api/tasks/${taskId}`).then(d => d.task).catch(() => null);
            if (current) renderTaskCard(card, current, { driving: false, lastError: error.message });
            stopTaskDriver();
            return;
          }
          const current = await taskFetch(`/api/tasks/${taskId}`).then(d => d.task).catch(() => null);
          if (current) renderTaskCard(card, current, { driving: true, lastError: error.message });
          await new Promise(resolve => setTimeout(resolve, TASK_STEP_BACKOFF_MS[consecutiveFailures - 1]));
          continue;
        }

        if (driver.stopped) return;
        renderTaskCard(card, task, { driving: true });

        if (isTerminalTaskStatus(task.status)) {
          stopTaskDriver();
          renderTaskCard(card, task, { driving: false });
          return;
        }
        // A breath between steps so a fast-failing task cannot spin the loop.
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }

    async function startLongTask(goal) {
      const ar = qjoLanguage === 'ar';
      const card = buildTaskCard();
      renderTaskCard(card, {
        id: 'pending', goal, status: 'running', step: 0, maxSteps: 40, plan: [], files: [], recentWork: []
      }, { driving: true });

      try {
        // A goal that mentions building or code gets the project workspace; a
        // research goal does not need file tools and should not be offered them.
        const kind = /كود|برمج|مشروع|تطبيق|موقع|سكربت|code|project|app|build|script|api/i.test(goal) ? 'code' : 'general';
        const data = await taskFetch('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({ goal, kind, mode: qjoMode === 'advanced' ? 'max' : 'flash' })
        });
        renderTaskCard(card, data.task, { driving: true });
        driveTask(data.task.id, card);
      } catch (error) {
        renderTaskCard(card, {
          id: 'failed', goal, status: 'failed', step: 0, maxSteps: 40, plan: [], files: [], recentWork: [],
          error: error.status === 401
            ? (ar ? 'سجّل الدخول لتشغيل المهام الطويلة.' : 'Sign in to run long tasks.')
            : error.message
        }, {});
      }
    }

    async function downloadTaskProject(taskId) {
      const ar = qjoLanguage === 'ar';
      try {
        const { files } = await taskFetch(`/api/tasks/${taskId}/files`);
        const entries = Object.entries(files || {});
        if (!entries.length) return showMicroToast(ar ? 'لا توجد ملفات بعد' : 'No files yet');
        // Reuses the existing archive endpoint rather than building a second
        // path for producing a zip.
        await postForDownload('/api/export/code-zip', {
          files: entries.map(([path, content]) => ({ path, content }))
        }, `qjo-project-${taskId}.zip`);
      } catch (error) {
        showMicroToast(ar ? 'تعذّر تنزيل المشروع' : 'Could not download the project');
        console.warn('Task project download failed:', error);
      }
    }

    // After a reload the task is still on the server exactly where it stopped.
    // Offering to resume is the whole point of the state being durable.
    let taskRestoreAttempted = false;

    async function restoreActiveTask() {
      // Called from both boot and the sign-in path, whichever happens first;
      // restoring twice would draw the card twice.
      if (taskRestoreAttempted) return;
      taskRestoreAttempted = true;
      const taskId = readStored(ACTIVE_TASK_KEY);
      if (!taskId) return;
      try {
        const { task } = await taskFetch(`/api/tasks/${taskId}`);
        if (!task || isTerminalTaskStatus(task.status)) return dropStored(ACTIVE_TASK_KEY);
        const card = buildTaskCard();
        renderTaskCard(card, task, { driving: false });
      } catch (_) {
        dropStored(ACTIVE_TASK_KEY);
      }
    }

    function showWelcomeHero() {
      if (!messagesInner) return;
      messagesInner.innerHTML = '';
      messagesInner.classList.remove('has-messages');
      if (welcomeEl) {
        welcomeEl.style.display = '';
        if (!messagesInner.contains(welcomeEl)) {
          messagesInner.appendChild(welcomeEl);
        }
      }
    }

    function clearChat() {
      if (busy) cancelActiveRequest();
      if (currentChatId) dropStored(activeChatStorageKey());
      currentChatId = null;
      activeRagIndexes = [];
      messageSeq = 0;
      pendingAttachments = [];
      renderAttachments();
      history.length = 0;
      showWelcomeHero();
      safeFocusComposer();
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        const temp = document.createElement('textarea');
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        const ok = document.execCommand('copy');
        temp.remove();
        return ok;
      }
    }



    function parseFirebaseConfig(raw) {
      if (!raw) return null;
      let text = raw.trim();

      const match = text.match(/(?:const|let|var)\s+firebaseConfig\s*=\s*({[\s\S]*?})\s*;/);
      if (match) text = match[1];

      text = text
        .replace(/^const\s+firebaseConfig\s*=\s*/, '')
        .replace(/^var\s+firebaseConfig\s*=\s*/, '')
        .replace(/^let\s+firebaseConfig\s*=\s*/, '')
        .replace(/;\s*$/, '')
        .replace(/"\[([^\]]+)\]\(https?:\/\/[^)]+\)"/g, '"$1"')
        .replace(/'\[([^\]]+)\]\(https?:\/\/[^)]+\)'/g, "'$1'");

      try {
        const config = JSON.parse(text);
        validateFirebaseConfig(config);
        return config;
      } catch (_) {
        try {
          const config = Function('return (' + text + ')')();
          validateFirebaseConfig(config);
          return config;
        } catch (error) {
          throw new Error('صيغة Firebase Config غير صحيحة. الصق كود firebaseConfig فقط أو الكود الكامل من Firebase.');
        }
      }
    }

    function validateFirebaseConfig(config) {
      if (!config || typeof config !== 'object') throw new Error('Firebase Config غير صالح.');
      const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
      const missing = required.filter(key => !config[key]);
      if (missing.length) throw new Error('Firebase Config ناقص: ' + missing.join(', '));
    }

    function getStoredFirebaseConfig() {
      // Read defensively: this runs before the try below, so a storage
      // exception here would abort sign-in setup entirely.
      const raw = readStored(FIREBASE_CONFIG_KEY) || '';
      if (!raw) return DEFAULT_FIREBASE_CONFIG;
      try {
        return parseFirebaseConfig(raw);
      } catch (error) {
        // A broken old config in localStorage must never disable login.
        // Fall back to Qjo's built-in Firebase project and let the app continue.
        console.warn('Ignoring invalid stored Firebase config:', error?.message || error);
        dropStored(FIREBASE_CONFIG_KEY);
        return DEFAULT_FIREBASE_CONFIG;
      }
    }

    async function loadPublicConfig() {
      // Safe optional remote config loader.
      // Important: this function must always exist before initializeFirebase() runs.
      // If the backend has no public config endpoint or the network blocks it,
      // Firebase still initializes from DEFAULT_FIREBASE_CONFIG below.
      try {
        if (typeof fetch !== 'function') return null;
        const response = await fetch('/api/public-config', { cache: 'no-store' });
        if (!response.ok) return null;
        const config = await response.json();
        applyRemoteConfig(config);
        return config;
      } catch (error) {
        console.warn('Qjo public config skipped:', error?.message || error);
        return null;
      }
    }

    function applyRemoteConfig(config) {
      if (!config || typeof config !== 'object') return;
      if (config.assistantName && userName && !currentUser) userName.textContent = String(config.assistantName).slice(0, 40);
      if (config.tagline) document.documentElement.setAttribute('data-qjo-tagline', String(config.tagline).slice(0, 140));
      if (config.globalTraining) {
        window.QJO_REMOTE_TRAINING = String(config.globalTraining).slice(0, 20000);
      }
      if (Array.isArray(config.suggestions)) {
        window.QJO_REMOTE_SUGGESTIONS = config.suggestions.slice(0, 6);
      }
    }


    async function loadClientContext(force = false) {
      if (clientContext && !force) return clientContext;
      try {
        const response = await fetch('/api/client-context', { cache: 'no-store' });
        if (!response.ok) return clientContext;
        clientContext = await response.json();
        return clientContext;
      } catch (error) {
        console.warn('Qjo client context skipped:', error?.message || error);
        return clientContext;
      }
    }

    function setAuthMessage(message) {
      authError.textContent = message || '';
    }

    function showAuthOverlay(show) {
      authOverlay.classList.toggle('show', show);
    }

    function setAuthBusy(isBusy) {
      authInProgress = isBusy;
      [googleLoginBtn, githubLoginBtn, emailLoginBtn, emailSignupBtn].forEach(btn => {
        if (btn) btn.disabled = isBusy;
      });
      if (isBusy) setAuthMessage(qjoLanguage === 'ar' ? 'جاري تسجيل الدخول...' : 'Signing in...');
    }

    function isEmbeddedPreview() {
      try { return window.self !== window.top; } catch (_) { return true; }
    }

    function isIOSDevice() {
      return /iphone|ipad|ipod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isInAppBrowser() {
      const ua = navigator.userAgent || '';
      return /FBAN|FBAV|Instagram|Line|WhatsApp|Messenger|Twitter|TikTok|Snapchat/i.test(ua);
    }

    function shouldUseRedirectAuth() {
      return isIOSDevice() || isInAppBrowser() || isEmbeddedPreview();
    }

    function updateAuthBrowserTip() {
      if (!authBrowserTip) return;
      // Only warn when the user can actually act on it. Plain Safari and iOS
      // used to get a notice telling them sign-in might fail and to fall back
      // to email — which read as a block, and is no longer true now that those
      // browsers take the redirect flow. An in-app webview is the one case
      // where the advice is real: opening the link in a real browser fixes it.
      if (!isInAppBrowser() && !isEmbeddedPreview()) {
        authBrowserTip.hidden = true;
        return;
      }
      authBrowserTip.hidden = false;
      authBrowserTip.textContent = isInAppBrowser()
        ? 'لأفضل تجربة، افتح Qjo من Safari أو Chrome مباشرة بدل متصفح التطبيقات الداخلي.'
        : 'أنت تتصفح داخل إطار مضمّن. افتح Qjo من الرابط المباشر ليثبت تسجيل الدخول.';
    }

    function setAuthGrace(ms = AUTH_GRACE_MS) {
      writeStored(AUTH_GRACE_KEY, String(Date.now() + ms));
    }

    function inAuthGrace() {
      return Number(readStored(AUTH_GRACE_KEY) || 0) > Date.now();
    }

    function clearAuthGrace() {
      dropStored(AUTH_GRACE_KEY);
    }

    function markRecentUser() {
      writeStored(AUTH_RECENT_USER_KEY, String(Date.now()));
    }

    function hadRecentUser() {
      return Date.now() - Number(readStored(AUTH_RECENT_USER_KEY) || 0) < AUTH_RECENT_USER_MS;
    }

    function clearRecentUser() {
      dropStored(AUTH_RECENT_USER_KEY);
    }

    // Firebase emits null transiently while it restores a session — routinely on
    // Safari, where tracking prevention slows IndexedDB and the redirect flow
    // lands the user back on a cold page. Ejecting after 350ms is what threw
    // people straight back to the login screen seconds after signing in.
    //
    // Two windows: a cold page that has never seen a user can settle quickly,
    // but once this page HAS had an authenticated user, a null is far more
    // likely to be a restoration hiccup than a real sign-out, so it gets much
    // longer and is re-checked before anyone is ejected.
    const AUTH_NULL_DELAY_COLD_MS = 1500;
    const AUTH_NULL_DELAY_AFTER_SIGNIN_MS = 10000;

    function scheduleAuthOverlayIfStillLoggedOut() {
      clearTimeout(authNullTimer);
      const delay = (hasAuthenticatedThisSession || hadRecentUser())
        ? AUTH_NULL_DELAY_AFTER_SIGNIN_MS
        : (inAuthGrace() ? 4000 : AUTH_NULL_DELAY_COLD_MS);
      authNullTimer = setTimeout(() => {
        if (!auth?.currentUser) {
          authStateSettled = true;
          setAuthBusy(false);
          showAuthOverlay(true);
          updateUserUI(null);
          userPreferences = {};
          fillPreferenceForm();
          if (chatUnsubscribe) chatUnsubscribe();
          chatUnsubscribe = null;
          renderChatList([]);
          setAuthMessage('');
        }
      }, delay);
    }

    async function initializeFirebase() {
      showAuthOverlay(false);
      updateAuthBrowserTip();
      if (!window.firebase) {
        firebaseInitAttempts += 1;
        if (firebaseInitAttempts <= 40) {
          showAuthOverlay(false);
          setAuthMessage(qjoLanguage === 'ar' ? 'جاري تجهيز تسجيل الدخول...' : 'Preparing sign in...');
          setTimeout(initializeFirebase, 250);
          return;
        }
        showAuthOverlay(true);
        setAuthMessage('تعذر تحميل خدمة تسجيل الدخول. تحقق من الاتصال بالإنترنت وافتح الصفحة عبر http://localhost وليس file://.');
        return;
      }

      const config = getStoredFirebaseConfig();
      if (!config) {
        showAuthOverlay(true);
        setAuthMessage('جاري تجهيز تسجيل الدخول... إذا بقيت الرسالة أكثر من ثوانٍ حدّث الصفحة مرة واحدة.');
        return;
      }

      try {
        if (!firebase.apps.length) firebase.initializeApp(config);
        auth = firebase.auth();
        db = firebase.firestore();
        firebaseReady = true;

        // Force durable login sessions before handling redirect/auth state.
        // This prevents the user from appearing logged in for a moment and then being logged out.
        // Walks down to a weaker level rather than throwing, so Safari's
        // tracking prevention cannot kill the session on the page that
        // receives the redirect. Only a total failure is worth telling the
        // user about.
        await applyAuthPersistence(true);
        if (!authPersistenceReady) {
          setAuthMessage('تعذر تثبيت جلسة الدخول في المتصفح. فعّل الكوكيز والتخزين أو جرّب متصفحًا آخر.');
        }

        try {
          await auth.getRedirectResult();
        } catch (error) {
          // Deliberately keeps the grace window: it expires on its own, and
          // clearing it here ejected users whose sign-in had actually worked.
          setAuthBusy(false);
          setAuthMessage(cleanAuthError(error));
        }

        if (!authError.textContent || authError.textContent.includes('جاري تجهيز')) {
          setAuthMessage('');
        }

        auth.onAuthStateChanged(async (user) => {
          currentUser = user;
          if (user) {
            hasAuthenticatedThisSession = true;
            markRecentUser();
            clearTimeout(authNullTimer);
            setAuthBusy(false);
            clearAuthGrace();
            authStateSettled = true;
            setAuthMessage('');
            showAuthOverlay(false);
            // Reset composer state so input/buttons are never stuck disabled
            busy = false;
            fileProcessing = false;
            if (inputEl) { inputEl.disabled = false; inputEl.value = ''; }
            if (sendBtn) sendBtn.disabled = !navigator.onLine;
            if (attachBtn) attachBtn.disabled = false;
            updateUserUI(user);
            await loadUserPreferences();
            didAutoLoadChat = true;
            currentChatId = null;
            history.length = 0;
            messageSeq = 0;
            showWelcomeHero();
            restoreDraft();
            // A task left running is still on the server exactly where it
            // stopped; surfacing it is the whole point of the state being
            // durable rather than tied to the tab that started it.
            restoreActiveTask().catch(e => console.warn('Task restore skipped:', e));
            safeFocusComposer();
            subscribeToChats();
            return;
          }

          // Firebase can briefly emit null during redirect/persistence restoration.
          // Do not immediately throw the user back to login; wait and re-check.
          currentUser = null;
          updateUserUI(null);
          scheduleAuthOverlayIfStillLoggedOut();
        });
      } catch (error) {
        showAuthOverlay(true);
        setAuthMessage('فشل تفعيل تسجيل الدخول: ' + error.message);
      }
    }

    function buildUserPreferenceContext() {
      if (!userPreferences || !Object.keys(userPreferences).length) return '';
      const parts = [];
      if (userPreferences.tone) parts.push(`Preferred response tone: ${userPreferences.tone}`);
      if (userPreferences.expertise) parts.push(`User expertise level: ${userPreferences.expertise}`);
      if (userPreferences.addressing) parts.push(`Preferred Arabic addressing/gendered phrasing: ${userPreferences.addressing}. If neutral, avoid gendered assumptions.`);
      if (userPreferences.interests) parts.push(`User interests/domains: ${userPreferences.interests}`);
      if (userPreferences.notes) parts.push(`User personal instructions: ${userPreferences.notes}`);
      return parts.length
        ? `\n\nUser personalization context:\n${parts.join('\n')}\n\nUse this only when relevant. Do not announce personalization or say "based on your preferences" unless the user asks.`
        : '';
    }

    function fillPreferenceForm() {
      prefTone.value = userPreferences.tone || 'balanced';
      prefExpertise.value = userPreferences.expertise || 'general';
      prefAddressing.value = userPreferences.addressing || 'neutral';
      prefInterests.value = userPreferences.interests || '';
      prefNotes.value = userPreferences.notes || '';
    }

    async function loadUserPreferences() {
      userPreferences = {};
      if (!firebaseReady || !currentUser || !db) {
        fillPreferenceForm();
        return;
      }
      try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        userPreferences = doc.exists ? (doc.data().preferences || {}) : {};
        fillPreferenceForm();
      } catch (error) {
        console.warn('Failed to load user preferences:', error);
        fillPreferenceForm();
      }
    }

    async function saveUserPreferences() {
      if (!firebaseReady || !currentUser || !db) {
        preferencesStatus.textContent = 'سجّل دخولك أولًا لحفظ التفضيلات.';
        return;
      }
      const prefs = {
        tone: prefTone.value,
        expertise: prefExpertise.value,
        addressing: prefAddressing.value,
        interests: prefInterests.value.trim().slice(0, 300),
        notes: prefNotes.value.trim().slice(0, 800)
      };
      try {
        await db.collection('users').doc(currentUser.uid).set({
          preferences: prefs,
          preferencesUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        userPreferences = prefs;
        preferencesStatus.textContent = 'تم حفظ التفضيلات.';
      } catch (error) {
        preferencesStatus.textContent = 'تعذر حفظ التفضيلات. تحقق من صلاحيات Firebase.';
      }
    }

    function updateUserUI(user) {
      const avatarEl = userAvatar;
      const chosen = readStored('qjo_user_avatar'); // 'google' | 'initial' | 'svg:<id>'
      if (!user) {
        renderAvatar(avatarEl, { type: 'initial', letter: 'Q' });
        userName.textContent = 'مستخدم';
        userEmail.textContent = t('notSigned');
        if (settingsAccountEmail) settingsAccountEmail.textContent = t('notSigned');
        rebindAvatarTrigger();
        return;
      }
      const display = user.displayName || (user.email ? user.email.split('@')[0] : 'مستخدم');
      userName.textContent = display;
      userEmail.textContent = user.email || 'حساب';
      if (settingsAccountEmail) settingsAccountEmail.textContent = user.email || user.displayName || 'حساب';
      // Render avatar based on choice
      if (chosen === 'google' && user.photoURL) {
        renderAvatar(avatarEl, { type: 'image', src: user.photoURL });
      } else if (chosen && chosen.startsWith('svg:')) {
        renderAvatar(avatarEl, { type: 'svg', id: chosen.slice(4) });
      } else if (user.photoURL && !chosen) {
        // New Google sign-in -> default to Google photo automatically
        renderAvatar(avatarEl, { type: 'image', src: user.photoURL });
      } else {
        renderAvatar(avatarEl, { type: 'initial', letter: (display || 'Q').trim().charAt(0).toUpperCase() });
      }
      // Re-bind click on avatar after replacing its content
      rebindAvatarTrigger();
    }

    // ---- Avatar renderer ----
    const AVATAR_SVGS = {
      smile_orange: { bg: '#FFB13B', accent: '#FF0F6B', face: '#1a1220' },
      cool_dark:    { bg: '#0f0b1d', accent: '#FF7A29', face: '#f5f5f5' },
      happy_pink:   { bg: '#FF1468', accent: '#FF1468', face: '#ffffff' },
      chill_mint:   { bg: '#7CF6B4', accent: '#D8FFB5', face: '#1a2e26' },
      star_purple:  { bg: '#8B5CF6', accent: '#EC4899', face: '#ffffff' },
    };
    function buildAvatarSVG(id, size=64){
      const a = AVATAR_SVGS[id];
      if(!a) return '';
      // Cute smiley blob like the reference screenshot
      return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <defs>
          <clipPath id="ac-${id}"><circle cx="50" cy="50" r="44"/></clipPath>
        </defs>
        <circle cx="50" cy="50" r="48" fill="${a.bg}"/>
        <g clip-path="url(#ac-${id})">
          <path d="M12 66 Q32 30 64 40 Q88 48 96 30 L96 110 L0 110 Z" fill="${a.accent}" opacity="0.85"/>
        </g>
        <circle cx="40" cy="46" r="3.5" fill="${a.face}"/>
        <circle cx="58" cy="46" r="3.5" fill="${a.face}"/>
        <path d="M38 60 Q50 70 62 60" stroke="${a.face}" stroke-width="3" stroke-linecap="round" fill="none"/>
      </svg>`;
    }
    function renderAvatar(el, opts){
      if(!el) return;
      el.innerHTML = '';
      if(opts.type === 'image'){
        const img = document.createElement('img');
        img.src = opts.src;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => renderAvatar(el, { type:'initial', letter:'Q' });
        el.appendChild(img);
      } else if(opts.type === 'svg'){
        el.innerHTML = buildAvatarSVG(opts.id, 48);
      } else {
        el.textContent = opts.letter || 'Q';
      }
    }


    async function applyAuthPersistence(forceLocal = false) {
      if (!auth || !firebaseReady) return;
      const persistence = (forceLocal || (rememberMe && rememberMe.checked))
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
      // Safari's tracking prevention can refuse script-writable storage, and
      // throwing here used to fail the entire sign-in. Degrade instead: a
      // session that does not survive a browser restart still beats no session.
      const ladder = [persistence, firebase.auth.Auth.Persistence.SESSION, firebase.auth.Auth.Persistence.NONE];
      for (const level of ladder) {
        try {
          await auth.setPersistence(level);
          authPersistenceReady = true;
          return;
        } catch (_) { /* try the next, weaker level */ }
      }
      authPersistenceReady = false;
    }

    async function ensureFirebaseReady() {
      if (firebaseReady && auth && db) return true;
      setAuthMessage(qjoLanguage === 'ar' ? 'جاري تجهيز تسجيل الدخول...' : 'Preparing sign in...');
      try { initializeFirebase(); } catch (error) { console.warn('Firebase init retry failed:', error); }
      const started = Date.now();
      while (Date.now() - started < 9000) {
        if (firebaseReady && auth && db) {
          setAuthMessage('');
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      setAuthMessage('تسجيل الدخول لم يجهز. حدّث الصفحة مرة واحدة، وإذا استمرت المشكلة افتح الموقع من الرابط المباشر وليس من داخل Preview.');
      return false;
    }

    // Popup failures that mean "this browser will not give you a popup" rather
    // than "the user changed their mind". Safari and iOS raise these routinely.
    const POPUP_UNAVAILABLE = new Set([
      'auth/popup-blocked',
      'auth/operation-not-supported-in-this-environment',
      'auth/cancelled-popup-request',
      'auth/web-storage-unsupported',
      'auth/internal-error'
    ]);

    // shouldUseRedirectAuth() existed but was never called: the app decided iOS
    // and in-app browsers needed the redirect flow and then always opened a
    // popup anyway, which Safari blocks — so social sign-in simply failed there
    // with no way through. getRedirectResult() was already handled at startup,
    // so only the outbound half was missing.
    async function startProviderSignIn(provider) {
      if (authInProgress) return;
      if (!firebaseReady && !(await ensureFirebaseReady())) return;
      try {
        setAuthBusy(true);
        setAuthGrace(30000);
        await applyAuthPersistence(true);

        if (shouldUseRedirectAuth()) {
          // The page navigates away here; getRedirectResult() completes it on
          // the way back, so the grace window must stay open.
          await auth.signInWithRedirect(provider);
          return;
        }

        try {
          await auth.signInWithPopup(provider);
        } catch (popupError) {
          if (POPUP_UNAVAILABLE.has(popupError?.code)) {
            // Second chance rather than a dead end: a desktop browser that
            // blocks the popup can still complete the redirect flow.
            await auth.signInWithRedirect(provider);
            return;
          }
          throw popupError;
        }
        clearAuthGrace();
      } catch (error) {
        clearAuthGrace();
        setAuthBusy(false);
        setAuthMessage(cleanAuthError(error));
      }
    }

    async function signInWithGoogle() {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return startProviderSignIn(provider);
    }

    async function signInWithGitHub() {
      const provider = new firebase.auth.GithubAuthProvider();
      provider.addScope('read:user');
      return startProviderSignIn(provider);
    }

    async function signInWithEmail() {
      if (authInProgress) return;
      if (!firebaseReady && !(await ensureFirebaseReady())) return;
      const email = authEmail.value.trim();
      const pass = authPassword.value;
      if (!email || !pass) return setAuthMessage('أدخل البريد وكلمة المرور.');
      setAuthMessage('');
      try {
        setAuthBusy(true);
        setAuthGrace();
        await applyAuthPersistence(true);
        await auth.signInWithEmailAndPassword(email, pass);
      } catch (error) {
        clearAuthGrace();
        setAuthBusy(false);
        setAuthMessage(cleanAuthError(error));
      }
    }

    async function signUpWithEmail() {
      if (authInProgress) return;
      if (!firebaseReady && !(await ensureFirebaseReady())) return;
      const email = authEmail.value.trim();
      const pass = authPassword.value;
      if (!email || !pass) return setAuthMessage('أدخل البريد وكلمة المرور.');
      if (pass.length < 6) return setAuthMessage('كلمة المرور يجب أن تكون 6 أحرف أو أكثر.');
      setAuthMessage('');
      try {
        setAuthBusy(true);
        setAuthGrace();
        await applyAuthPersistence(true);
        await auth.createUserWithEmailAndPassword(email, pass);
      } catch (error) {
        clearAuthGrace();
        setAuthBusy(false);
        setAuthMessage(cleanAuthError(error));
      }
    }

    function cleanAuthError(error) {
      const code = error?.code || '';
      if (code.includes('popup')) return 'تم إغلاق نافذة تسجيل الدخول.';
      if (code.includes('email-already-in-use')) return 'هذا البريد مستخدم مسبقًا.';
      if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'بيانات الدخول غير صحيحة.';
      if (code.includes('user-not-found')) return 'لا يوجد حساب بهذا البريد.';
      if (code.includes('unauthorized-domain')) return 'الدومين غير مضاف في Firebase Authorized domains.';
      if (code.includes('web-storage-unsupported')) return 'المتصفح يمنع التخزين المطلوب لتسجيل الدخول. فعّل cookies/localStorage أو جرّب متصفحًا آخر.';
      if (code.includes('operation-not-supported-in-this-environment')) return 'تسجيل الدخول لا يعمل من file://. افتح الموقع من رابط https أو localhost.';
      return error?.message || 'تعذر تسجيل الدخول.';
    }

    function userChatsRef() {
      return db.collection('users').doc(currentUser.uid).collection('chats');
    }

    function subscribeToChats() {
      if (!db || !currentUser) return;
      if (chatUnsubscribe) chatUnsubscribe();
      chatUnsubscribe = userChatsRef().orderBy('updatedAt', 'desc').limit(30).onSnapshot((snap) => {
        const chats = [];
        snap.forEach(doc => chats.push({ id: doc.id, ...doc.data() }));
        renderChatList(chats.filter(chat => !chat.deleted));
        // Public product behavior: after login/page reload start with a fresh chat.
        // Previous chats stay available in the sidebar and are opened only by explicit user click.
        didAutoLoadChat = true;
      }, () => renderChatList([]));
    }

    async function renameChat(chatId, currentTitle) {
      if (!firebaseReady || !currentUser || !chatId) return;
      const nextTitle = prompt(t('renameChatPrompt'), currentTitle || t('newChat'));
      if (!nextTitle) return;
      const cleanTitle = nextTitle.trim().slice(0, 80);
      if (!cleanTitle) return;
      try {
        await userChatsRef().doc(chatId).set({
          title: cleanTitle,
          renamedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        allChatsCache = allChatsCache.map(chat => chat.id === chatId ? { ...chat, title: cleanTitle } : chat);
        renderChatList(allChatsCache);
      } catch (error) {
        alert('تعذر إعادة تسمية المحادثة. تحقق من الاتصال وصلاحيات Firestore.');
      }
    }

    function downloadTextFile(filename, content, mime = 'text/markdown') {
      const blob = new Blob([content], { type: mime + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    function exportCurrentChatMarkdown() {
      if (!history.length) {
        alert('لا توجد رسائل لتصديرها في هذه المحادثة.');
        return;
      }
      const safeTitle = (allChatsCache.find(chat => chat.id === currentChatId)?.title || 'Qjo Chat').replace(/[\\/:*?"<>|]/g, '-');
      const body = history.map((m, i) => {
        const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Qjo' : m.role;
        const cleanContent = String(m.content || '')
          .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
          .replace(/Connected search executed[\s\S]*?SOURCE PACK:[\s\S]*?(?=\n\n|$)/gi, '')
          .replace(/\[تم إرفاق صورة\/صور وتحليلها في وقت الإرسال\]/gi, '')
          .replace(/User attached or previously indexed files[\s\S]*?\[Chunk[\s\S]*?(?=\n\n|$)/gi, '')
          .trim();
        return `## ${i + 1}. ${role}\n\n${cleanContent}`;
      }).join('\n\n---\n\n');
      downloadTextFile(`${safeTitle}.md`, `# ${safeTitle}\n\nExported from Qjo AI\n\n---\n\n${body}`);
    }

    function filteredAllChats() {
      const q = chatSearchQuery.trim().toLowerCase();
      if (!q) return allChatsCache;
      return allChatsCache.filter(chat => String(chat.title || '').toLowerCase().includes(q));
    }

    function createChatRow(chat, compact = false) {
      const row = document.createElement('div');
      row.className = 'chat-row' + (chat.id === currentChatId ? ' active' : '');

      const openBtn = document.createElement('button');
      openBtn.className = 'chat-open-btn';
      openBtn.type = 'button';
      openBtn.innerHTML = '<span>' + escapeHtml(chat.title || t('newChat')) + '</span>';
      openBtn.addEventListener('click', () => {
        loadChat(chat.id);
        if (!compact) allChatsModal.classList.remove('show');
        if (window.innerWidth <= 768) document.body.classList.remove('drawer-open');
      });

      const renameBtn = document.createElement('button');
      renameBtn.className = 'chat-action-btn chat-rename-btn';
      renameBtn.type = 'button';
      renameBtn.title = t('renameBtnTitle');
      renameBtn.setAttribute('aria-label', t('renameBtnTitle'));
      renameBtn.textContent = '✎';
      renameBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        renameChat(chat.id, chat.title || t('newChat'));
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'chat-action-btn chat-delete-btn';
      deleteBtn.type = 'button';
      deleteBtn.title = t('deleteBtnTitle');
      deleteBtn.setAttribute('aria-label', t('deleteBtnTitle'));
      deleteBtn.innerHTML = '×';
      deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        deleteChat(chat.id, chat.title || t('newChat'));
      });

      row.appendChild(openBtn);
      row.appendChild(renameBtn);
      row.appendChild(deleteBtn);
      return row;
    }

    function renderChatList(chats) {
      allChatsCache = (Array.isArray(chats) ? chats : []).filter(chat => !chat.deleted);
      chatList.innerHTML = '';

      if (!allChatsCache.length) {
        chatList.innerHTML = `<div class="empty-chats">${qjoLanguage === 'ar' ? 'لا توجد محادثات بعد' : 'No chats yet'}</div>`;
        if (showAllChatsBtn) showAllChatsBtn.style.display = 'none';
        renderAllChatsModal();
        return;
      }

      allChatsCache.forEach(chat => {
        chatList.appendChild(createChatRow(chat, true));
      });

      if (showAllChatsBtn) showAllChatsBtn.style.display = 'none';
      renderAllChatsModal();
    }

    function renderAllChatsModal() {
      allChatsList.innerHTML = '';
      const visibleChats = filteredAllChats();
      if (!allChatsCache.length) {
        allChatsList.innerHTML = '<div class="empty-chats">لا توجد محادثات بعد</div>';
        return;
      }
      if (!visibleChats.length) {
        allChatsList.innerHTML = '<div class="empty-chats">لا توجد نتائج مطابقة</div>';
        return;
      }
      visibleChats.forEach(chat => allChatsList.appendChild(createChatRow(chat, false)));
    }

    async function deleteChat(chatId, title) {
      if (!firebaseReady || !currentUser || !chatId) return;
      const ok = confirm((qjoLanguage === 'ar' ? 'حذف المحادثة؟\n' : 'Delete chat?\n') + title);
      if (!ok) return;

      const previousChats = allChatsCache.slice();
      allChatsCache = allChatsCache.filter(chat => chat.id !== chatId);
      renderChatList(allChatsCache);

      try {
        const chatRef = userChatsRef().doc(chatId);

        // Soft delete first: this works even when subcollection deletion is restricted,
        // and immediately removes the chat from the UI.
        await deleteRagRecordsForChat(chatId);
        await deleteCloudRagRecordsForChat(chatId);
        await chatRef.set({
          deleted: true,
          deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Best-effort physical cleanup. Failure here should not undo the user action.
        try {
          while (true) {
            const snap = await chatRef.collection('messages').limit(400).get();
            if (snap.empty) break;
            const batch = db.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
          }
        } catch (cleanupError) {
          console.warn('Messages cleanup failed after soft delete:', cleanupError);
        }

        if (currentChatId === chatId) {
          dropStored(activeChatStorageKey());
          clearChat();
        }
      } catch (error) {
        allChatsCache = previousChats;
        renderChatList(allChatsCache);
        console.error('Delete chat failed:', error);
        alert('تعذر حذف المحادثة. تحقق من الاتصال أو صلاحيات Firebase.');
      }
    }

    async function ensureChatDocument(firstText) {
      if (!firebaseReady || !currentUser) return null;
      if (currentChatId) return currentChatId;
      const title = (firstText || 'محادثة جديدة').slice(0, 48);
      const doc = await userChatsRef().add({
        title,
        messageCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      currentChatId = doc.id;
      writeStored(activeChatStorageKey(), currentChatId);
      messageSeq = 0;
      return currentChatId;
    }

    async function persistMessage(message) {
      if (!firebaseReady || !currentUser || !currentChatId || !message) return;
      const seq = messageSeq++;
      const chatRef = userChatsRef().doc(currentChatId);
      const msgRef = chatRef.collection('messages').doc(String(seq).padStart(6, '0'));
      await msgRef.set({
        role: message.role,
        content: String(message.content || '').slice(0, 120000),
        seq,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await chatRef.set({
        lastMessagePreview: String(message.content || '').slice(0, 180),
        messageCount: firebase.firestore.FieldValue.increment(1),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    async function loadChat(chatId) {
      if (!firebaseReady || !currentUser || !chatId) return;
      if (busy) cancelActiveRequest();

      try {
        const chatRef = userChatsRef().doc(chatId);
        const doc = await chatRef.get();
        if (!doc.exists) {
          alert('هذه المحادثة غير موجودة أو تم حذفها.');
          return;
        }

        const data = doc.data() || {};
        if (data.deleted) {
          alert('هذه المحادثة محذوفة.');
          return;
        }

        currentChatId = chatId;
        writeStored(activeChatStorageKey(), currentChatId);
        renderChatList(allChatsCache);
        history.length = 0;

        // New storage format: messages subcollection.
        // If Firestore rules don't allow reading the subcollection yet, do not fail the whole chat.
        // Fall back to legacy chat.messages below.
        let subcollectionReadFailed = false;
        try {
          const messagesSnap = await chatRef.collection('messages').orderBy('seq', 'asc').limit(160).get();
          messagesSnap.forEach(mdoc => {
            const m = mdoc.data() || {};
            if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
              history.push({ role: m.role, content: sanitizeStoredMessageContent(m.content, m.role) });
            }
          });
        } catch (messageReadError) {
          subcollectionReadFailed = true;
          console.warn('Could not read messages subcollection; trying legacy messages array:', messageReadError);
        }

        // Backward compatibility: old builds stored messages as an array on the chat document.
        if (!history.length && Array.isArray(data.messages)) {
          data.messages.forEach(m => {
            if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
              history.push({ role: m.role, content: sanitizeStoredMessageContent(m.content, m.role) });
            }
          });

          // Best-effort migration to the new subcollection format.
          if (history.length) {
            try {
              const batch = db.batch();
              history.slice(0, 160).forEach((m, index) => {
                const msgRef = chatRef.collection('messages').doc(String(index).padStart(6, '0'));
                batch.set(msgRef, {
                  role: m.role,
                  content: m.content,
                  seq: index,
                  createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                  migratedFromLegacy: true
                });
              });
              batch.set(chatRef, {
                messages: firebase.firestore.FieldValue.delete(),
                messageCount: history.length,
                migratedAt: firebase.firestore.FieldValue.serverTimestamp()
              }, { merge: true });
              await batch.commit();
            } catch (migrationError) {
              console.warn('Legacy chat migration failed:', migrationError);
            }
          }
        }

        messageSeq = history.length;
        messagesInner.innerHTML = '';
        if (history.length) {
          history.forEach(m => addMessage(m.role, m.content));
          if (welcomeEl) welcomeEl.style.display = 'none';
        } else {
          showWelcomeHero();
        }

        allChatsModal.classList.remove('show');
        document.body.classList.remove('drawer-open');
        setTimeout(() => scrollToBottom(false), 50);
      } catch (error) {
        console.error('Load chat failed:', error);
        alert('تعذر فتح المحادثة. غالبًا المشكلة من Firestore Rules لمسار الرسائل. حدّث القواعد ثم جرّب مرة أخرى.');
      }
    }


    async function logoutUser() {
      userSettingsModal.classList.remove('show');
      currentChatId = null;
      activeRagIndexes = [];
      pendingAttachments = [];
      renderAttachments();
      messageSeq = 0;
      cancelActiveRequest();
      busy = false;
      fileProcessing = false;
      history.length = 0;
      showWelcomeHero();
      if (inputEl) { inputEl.value = ''; inputEl.disabled = false; autoResize(); clearDraft(); }
      if (sendBtn) sendBtn.disabled = false;
      if (attachBtn) attachBtn.disabled = false;
      clearAuthGrace();
      clearRecentUser();
      hasAuthenticatedThisSession = false;
      if (auth) await auth.signOut();
    }

    messagesEl.addEventListener('scroll', updateScrollBottomButton, { passive: true });
    window.addEventListener('scroll', updateScrollBottomButton, { passive: true });
    scrollBottomBtn.addEventListener('click', () => scrollToBottom(true));

    mobileMenuBtn.addEventListener('click', () => document.body.classList.add('drawer-open'));

    // Desktop sidebar toggle (hide/show)
    const sidebarToggle = el('sidebarToggle');
    if (sidebarToggle) {
      // Restore last state
      if (readStored('qjo_sidebar_collapsed') === '1') {
        document.body.classList.add('sidebar-collapsed');
      }
      sidebarToggle.addEventListener('click', () => {
        const collapsed = document.body.classList.toggle('sidebar-collapsed');
        try { writeStored('qjo_sidebar_collapsed', collapsed ? '1' : '0'); } catch(e){}
      });
    }
    drawerBackdrop.addEventListener('click', () => document.body.classList.remove('drawer-open'));
    themeToggleBtn.addEventListener('click', toggleTheme);
    if (exportChatBtn) exportChatBtn.addEventListener('click', exportCurrentChatMarkdown);
    showAllChatsBtn.addEventListener('click', () => {
      renderAllChatsModal();
      allChatsModal.classList.add('show');
    });
    closeAllChatsModal.addEventListener('click', () => allChatsModal.classList.remove('show'));
    allChatsModal.addEventListener('click', (e) => { if (e.target === allChatsModal) allChatsModal.classList.remove('show'); });
    if (chatSearchInput) chatSearchInput.addEventListener('input', () => {
      chatSearchQuery = chatSearchInput.value || '';
      renderAllChatsModal();
    });
    userSettingsBtn.addEventListener('click', () => userSettingsModal.classList.add('show'));
    directLogoutBtn.addEventListener('click', logoutUser);
    closeUserSettingsModal.addEventListener('click', () => userSettingsModal.classList.remove('show'));
    userSettingsModal.addEventListener('click', (e) => { if (e.target === userSettingsModal) userSettingsModal.classList.remove('show'); });
    languageSelect.addEventListener('change', () => setLanguage(languageSelect.value));
    settingsThemeBtn.addEventListener('click', toggleTheme);
    settingsLogoutBtn.addEventListener('click', logoutUser);
    savePreferencesBtn.addEventListener('click', saveUserPreferences);
    const openTrainingBtn = el('openTrainingBtn');
    if (openTrainingBtn) openTrainingBtn.addEventListener('click', () => {
      userSettingsModal.classList.remove('show');
      openTraining();
    });
    if (refreshMemoryBtn) refreshMemoryBtn.addEventListener('click', renderMemoryList);
    if (clearMemoryBtn) clearMemoryBtn.addEventListener('click', clearLocalMemory);
    googleLoginBtn.addEventListener('click', signInWithGoogle);
    githubLoginBtn.addEventListener('click', signInWithGitHub);
    emailLoginBtn.addEventListener('click', signInWithEmail);
    emailSignupBtn.addEventListener('click', signUpWithEmail);
    [authEmail, authPassword].forEach(field => {
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          signInWithEmail();
        }
      });
    });
    clearBtn.addEventListener('click', clearChat);
    newChatBtn.addEventListener('click', clearChat);
    if (normalModeBtn) normalModeBtn.addEventListener('click', () => setMode('normal'));
    if (advancedModeBtn) advancedModeBtn.addEventListener('click', () => setMode('advanced'));

    // Swallow clicks on the coming-soon entries so nothing navigates and no
    // other delegated handler treats them as an app switch.
    [qsparkNavBtn, qcodeNavBtn].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); showMicroToast('هذه الميزة قادمة قريبًا ✨'); });
      btn.style.cursor='pointer';
    });


    document.addEventListener('click', (event) => {
      const appBtn = event.target.closest('[data-qjo-app]');
      if (!appBtn) return;
      const targetApp = appBtn.dataset.qjoApp;
      if (QJO_APPS_COMING_SOON.has(targetApp)) {
        event.preventDefault();
        event.stopPropagation();
        showMicroToast('هذه الميزة قادمة قريبًا ✨');
      }
    });

    document.querySelectorAll('[data-prompt]').forEach(btn => {
      btn.addEventListener('click', () => sendMessage(btn.dataset.prompt));
    });

    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      addFiles(fileInput.files);
      fileInput.value = '';
    });

    cancelRequestBtn.addEventListener('click', cancelActiveRequest);
    sendBtn.addEventListener('click', () => sendMessage());
    inputEl.addEventListener('input', () => {
      autoResize();
      saveDraft();
    });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });



    closeModal.addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });
    copyAdminLinkBtn.addEventListener('click', async () => {
      const ok = await copyText(adminLink.value);
      runtimeStatus.textContent = ok ? 'تم نسخ رابط لوحة الإدارة.' : 'تعذر النسخ التلقائي.';
    });
    openAdminLinkBtn.addEventListener('click', () => window.open(adminLink.value, '_blank', 'noopener,noreferrer'));

    pasteRuntimeBtn.addEventListener('click', async () => {
      try {
        runtimeTokenInput.value = (await navigator.clipboard.readText()).trim();
        if (runtimeTokenInput.value) setActivationStatus('', 'بانتظار الفحص');
      } catch (_) {
        runtimeStatus.textContent = 'المتصفح منع اللصق التلقائي. الصق الرمز يدويًا.';
      }
    });

    toggleRuntimeBtn.addEventListener('click', () => {
      if (runtimeTokenInput.type === 'password') {
        runtimeTokenInput.type = 'text';
        toggleRuntimeBtn.textContent = 'إخفاء';
      } else {
        runtimeTokenInput.type = 'password';
        toggleRuntimeBtn.textContent = 'إظهار';
      }
    });

    runtimeTokenInput.addEventListener('input', () => {
      if (runtimeTokenInput.value.trim()) setActivationStatus('', 'بانتظار الفحص');
      else if (!runtimeToken) setActivationStatus('', 'غير مفعل');
    });

    saveRuntimeBtn.addEventListener('click', async () => {
      const firebaseRaw = firebaseConfigInput.value.trim();
      if (firebaseRaw) {
        try {
          parseFirebaseConfig(firebaseRaw);
          writeStored(FIREBASE_CONFIG_KEY, firebaseRaw);
          if (!firebaseReady) initializeFirebase();
          runtimeStatus.textContent = 'تم حفظ إعدادات Firebase. تشغيل الذكاء الاصطناعي يتم من الخادم الآمن.';
          return;
        } catch (error) {
          runtimeStatus.textContent = error.message;
          return;
        }
      }
      updateRuntimeStatus();
    });

    forgetRuntimeBtn.addEventListener('click', () => {
      dropStored(STORAGE_KEY);
      dropStored(OLD_STORAGE_KEY);
      runtimeStatus.textContent = 'تم حذف أي رموز قديمة من المتصفح. الإنتاج يستخدم الخادم الآمن.';
    });

    closeTrainingModal.addEventListener('click', closeTraining);
    trainingModal.addEventListener('click', (e) => { if (e.target === trainingModal) closeTraining(); });
    saveTrainingBtn.addEventListener('click', () => {
      qjoTraining = trainingText.value.trim();
      writeStored(TRAINING_KEY, qjoTraining);
      updateTrainingStatus();
    });
    sampleTrainingBtn.addEventListener('click', () => {
      trainingText.value = `Qjo مساعد عام قوي ومباشر للناس، اسمه Qjo وله هوية مستقلة كمساعد ذكاء اصطناعي.\nيرد بلغة المستخدم، وإذا كان المستخدم عربيًا يرد بعربية واضحة وسهلة.\nفي الوضع العادي: يرد باختصار ووضوح، مثل مساعد سريع ومفيد.\nفي الوضع المتقدم: يعطي شرحًا أعمق مع خطوات، أمثلة، مقارنة، وتحليل عملي.\nQjo يوازن بين التعاطف والصراحة: يتفهم المستخدم، لكنه يصحح الأخطاء بلطف ويعتمد على الحقائق.\nQjo لا يذكر أي تفاصيل داخلية عن التشغيل أو الرموز أو مزود الخدمة للمستخدمين.\nQjo لا يدعي قدرات غير موجودة، ولا يخترع معلومات أو مصادر.\nQjo يساعد في الأسئلة العامة، الكتابة، البرمجة، الدراسة، المشاريع، الأفكار، التخطيط، والتحليل، ويمتلك تخصصًا قويًا في هندسة الشبكات العصبية وتصميم نماذج التعلم العميق.\nQjo يحافظ على الخصوصية ولا يطلب كلمات مرور أو رموز تشغيل أو معلومات حساسة من المستخدمين.\nQjo يقدّم إجابات مرتبة وقابلة للتنفيذ، ويتجنب الحشو والمبالغة.\nعند تحليل الملفات أو الصور، Qjo يتعامل كخبير: يلخص، يستخرج النقاط المهمة، يكتشف المشاكل، يقيّم الجودة، ويقترح خطوات عملية. إذا لم يكن محتوى الملف مرئيًا له، يقول ذلك بصراحة ولا يدّعي أنه شاهده.`;
      trainingStatus.textContent = 'تم وضع مثال جاهز. اضغط حفظ التدريب لاعتماده.';
    });
    clearTrainingBtn.addEventListener('click', () => {
      qjoTraining = '';
      trainingText.value = '';
      dropStored(TRAINING_KEY);
      updateTrainingStatus();
    });

    const brandImg = document.querySelector('.brand-mark img');
    if (brandImg && authLogoImg) authLogoImg.src = brandImg.src;
    window.qjoExportCurrentChat = exportCurrentChatMarkdown;
    window.qjoAuthDebug = () => ({
      firebaseReady,
      authPersistenceReady,
      authInProgress,
      embeddedPreview: isEmbeddedPreview(),
      authStateSettled,
      inAuthGrace: inAuthGrace(),
      user: auth?.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email } : null,
      domain: location.hostname,
      protocol: location.protocol,
      storageAvailable: (() => { try { writeStored('__qjo_test','1'); dropStored('__qjo_test'); return true; } catch { return false; } })()
    });


    function isMobileViewport() {
      return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    }

    function safeFocusComposer() {
      // On phones, auto-focus opens the keyboard unexpectedly and hides the last messages.
      // Keep desktop fast, keep mobile calm.
      if (!isMobileViewport()) {
        try { inputEl.focus({ preventScroll: true }); } catch (_) { inputEl.focus(); }
      }
    }

    function installMobileViewportController() {
      const root = document.documentElement;
      const composerWrap = document.querySelector('.composer-wrap');
      const composerShell = document.querySelector('.composer-shell');
      const topbar = document.querySelector('.topbar');
      let raf = 0;

      let lastVhHeight = 0;
      let lastComposerH = 0;
      let lastTopbarH = 0;
      let lastKeyboardOpen = false;

      const apply = () => {
        raf = 0;
        const vv = window.visualViewport;
        const height = Math.max(420, Math.round(vv ? vv.height : window.innerHeight));
        if (Math.abs(height - lastVhHeight) >= 1) {
          lastVhHeight = height;
          root.style.setProperty('--qjo-vh', (height * 0.01) + 'px');
        }

        if (composerWrap) {
          const composerHeight = Math.ceil(composerWrap.getBoundingClientRect().height || 152);
          if (Math.abs(composerHeight - lastComposerH) >= 1) {
            lastComposerH = composerHeight;
            root.style.setProperty('--qjo-composer-height', composerHeight + 'px');
          }
        }
        if (topbar) {
          const topbarHeight = Math.ceil(topbar.getBoundingClientRect().height || 72);
          if (Math.abs(topbarHeight - lastTopbarH) >= 1) {
            lastTopbarH = topbarHeight;
            root.style.setProperty('--qjo-topbar-height', topbarHeight + 'px');
          }
        }

        const keyboardOpen = Boolean(vv && (window.innerHeight - vv.height - vv.offsetTop) > 120);
        if (keyboardOpen !== lastKeyboardOpen) {
          lastKeyboardOpen = keyboardOpen;
          document.body.classList.toggle('qjo-keyboard-open', keyboardOpen);
        }
      };

      const schedule = () => {
        if (raf) return;
        raf = requestAnimationFrame(apply);
      };

      apply();
      window.addEventListener('resize', schedule, { passive: true });
      window.addEventListener('orientationchange', () => setTimeout(schedule, 180), { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', schedule, { passive: true });
        window.visualViewport.addEventListener('scroll', schedule, { passive: true });
      }
      if (window.ResizeObserver && composerShell) {
        new ResizeObserver(schedule).observe(composerShell);
      }

      inputEl.addEventListener('focus', () => {
        document.body.classList.add('qjo-input-focused');
        schedule();
        if (isMobileViewport() && isNearBottom()) {
          setTimeout(() => scrollToBottom(false), 220);
        }
      });
      inputEl.addEventListener('blur', () => {
        document.body.classList.remove('qjo-input-focused');
        setTimeout(schedule, 120);
      });
      inputEl.addEventListener('input', () => {
        schedule();
        // Only follow the user to the bottom if they were already there —
        // yanking the view down on every keystroke (even while scrolled up
        // reading earlier messages) is what produced the "flicker/jump"
        // feeling while typing.
        if (isMobileViewport() && isNearBottom()) setTimeout(() => scrollToBottom(false), 30);
      });
    }

    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);
    installMobileViewportController();

    applyTheme();
    applyLanguage();
    loadPublicConfig();
    loadClientContext();
    initializeFirebase();
    // Independent of auth: a task left running belongs to the page, and waiting
    // for a sign-in branch that may never fire loses it on reload.
    restoreActiveTask().catch(e => console.warn('Task restore skipped:', e));
    updateModeUI();
    updateRuntimeStatus();
    updateTrainingStatus();
    safeFocusComposer();
    sprinkleWelcomeConfetti();
    installTypingSparkle();
    installSuggestionPop();
    installFunctionToggles();
    installQuickCategories();
    // Re-wire suggestion pop if suggestions re-render (they don't, but safe)
    setTimeout(installSuggestionPop, 400);

    // --- Function toggles (Search / Deep / Reason) ---
    // ── Composer function toggles ────────────────────────────────────────
    // These used to only add a CSS class and show a toast: nothing ever read
    // their state, so Search / Deep Search / Reasoning were decorative. They
    // now drive real request behaviour and survive a reload.
    //
    // State lives here rather than being read back off the DOM, so the desktop
    // pills and the mobile tools sheet cannot disagree about what is enabled.
    function loadFunctionToggles() {
      try {
        const saved = readJSON(FUNCTION_TOGGLES_KEY, {});
        qjoFunctions = {
          search: Boolean(saved.search),
          deep: Boolean(saved.deep)
        };
        // Deep search IS a search, so the pair can never be left inconsistent.
        if (qjoFunctions.deep) qjoFunctions.search = true;
      } catch (_) {
        qjoFunctions = { search: false, deep: false };
      }
    }

    function saveFunctionToggles() {
      try { writeStored(FUNCTION_TOGGLES_KEY, JSON.stringify(qjoFunctions)); }
      catch (_) { /* private mode — the toggles still work for this session */ }
    }

    // Mirrors state onto the pills, the mobile sheet and the notch indicator.
    function renderFunctionToggles() {
      FUNCTION_TOGGLES.forEach(({ id, key }) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const active = Boolean(qjoFunctions[key]);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      document.dispatchEvent(new CustomEvent('qjo:functions-changed'));
    }

    function setFunctionToggle(key, active, { announce = true } = {}) {
      const next = Boolean(active);
      if (qjoFunctions[key] === next) return;
      qjoFunctions[key] = next;

      // Dependency: deep search implies search; clearing search clears deep.
      let implied = '';
      if (key === 'deep' && next && !qjoFunctions.search) {
        qjoFunctions.search = true;
        implied = qjoLanguage === 'ar' ? ' (وتم تفعيل البحث تلقائيًا)' : ' (search enabled too)';
      }
      if (key === 'search' && !next && qjoFunctions.deep) {
        qjoFunctions.deep = false;
        implied = qjoLanguage === 'ar' ? ' (وتم إيقاف البحث العميق)' : ' (deep search disabled too)';
      }

      saveFunctionToggles();
      renderFunctionToggles();

      if (!announce) return;
      const def = FUNCTION_TOGGLES.find(t => t.key === key);
      if (!def) return;
      const msg = (next ? def.on : def.off)[qjoLanguage === 'ar' ? 'ar' : 'en'];
      showMicroToast(msg + implied);
    }

    function installFunctionToggles(){
      loadFunctionToggles();
      FUNCTION_TOGGLES.forEach(({ id, key }) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', () => setFunctionToggle(key, !qjoFunctions[key]));
      });
      renderFunctionToggles();
    }

    function installQuickCategories(){
      const suggestionsAr = {
        code: [
          'أنشئ لي مكون React حديث لقائمة مهام (Todo List) بتصميم زجاجي داكن',
          'اكتب لي دالة Python لقراءة ملف CSV وتحليل البيانات بـ pandas',
          'أنشئ واجهة تسجيل دخول عصرية بـ Next.js + Tailwind',
          'اكتب CSS animation لزر مع تأثير موجات (ripple) عند النقر',
          'أنشئ REST API بسيط بـ Node.js + Express لإدارة المهام'
        ],
        launch: [
          'كيف أرفع تطبيق Next.js على Vercel خطوة بخطوة؟',
          'أريد إطلاق MVP بسرعة، ما هي أسرع استضافة لمشروعي؟',
          'أنشئ لي خطة إطلاق تطبيق موبايل على App Store و Google Play',
          'ما الفرق بين Vercel و Netlify و Render؟ وما الأنسب لـ SaaS صغير؟',
          'اكتب لي config لـ Docker لتطبيق Node.js'
        ],
        ui: [
          'أنشئ لي مجموعة أزرار (button system) بتصميم زجاجي glassmorphism',
          'اكتب لي Navbar متجاوب مع قائمة موبايل (hamburger)',
          'أريد كارد (Card) حديث بتأثير hover رفع وإضاءة',
          'صمم لي dashboard layout بـ CSS Grid مع sidebar',
          'أنشئ لي Form تسجيل دخول بتأثيرات focus على الحقول'
        ],
        theme: [
          'اقترح لي باليت ألوان بنفسجي/وردي (aurora) لتطبيق دردشة ذكاء اصطناعي',
          'ما أفضل التدرجات (gradients) لثيم داكن فاخر؟',
          'اقترح خطوط عربية وإنجليزية متناسقة لتطبيق إنتاجي',
          'أفكار لثيم فاتح أنيق بدون أن يكون مُبهر (off-white)',
          'كيف أطبق dark/light mode مع CSS variables بشكل نقي؟'
        ],
        dashboard: [
          'صمم لي واجهة Dashboard إحصائية بالرسوم البيانية',
          'أنشئ لي قائمة مستخدمين (users table) مع بحث وفلترة وترقيم صفحات',
          'أريد صفحة إعدادات (settings page) بتبويبات أنيقة',
          'صمم لي profile page ببطاقات إحصائيات وبيانات المستخدم',
          'أنشئ لي نظام إشعارات (notifications panel) منسدل أنيق'
        ],
        landing: [
          'اكتب لي Hero section لتطبيق AI chat مع عنوان قوي وCTA',
          'أنشئ لي pricing section بـ 3 باقات (مجاني/برو/مؤسسات)',
          'صمم لي FAQ accordion قابل للفتح والإغلاق بـ HTML/CSS/JS',
          'اكتب لي testimonials section ببطاقات آراء العملاء',
          'أريد Footer احترافي مع روابط وسوشيال ميديا واشتراك newsletter'
        ],
        docs: [
          'اكتب لي ملف README احترافي لمشروعي على GitHub',
          'كيف أجهز ملف PDF لرفعه وتحليله بالذكاء الاصطناعي؟',
          'أنشئ لي قالب docs-style documentation page',
          'اكتب لي CHANGELOG.md بصيغة Keep a Changelog',
          'كيف أستخرج نص من ملف Word أو Excel في المتصفح؟'
        ],
        images: [
          'أريد برومبت لإنشاء صورة hero بنفسجية أورورا لشات AI',
          'أنشئ لي SVG icon set minimal لتطبيق دردشة',
          'كيف أضغط وأحسن الصور لموقعي (WebP/AVIF)؟',
          'اكتب لي CSS لصورة أفاتار دائرية مع حدود متدرجة',
          'أفكار لصور أيقونية (illustrations) بنفسجية للـ empty states'
        ]
      };
      const suggestionsEn = {
        code: [
          'Build a modern React Todo List component with dark glassmorphism',
          'Write a Python function to read a CSV and analyze data with pandas',
          'Create a modern login UI using Next.js and Tailwind CSS',
          'Write a CSS button animation with ripple effect on click',
          'Build a simple Node.js + Express REST API for task management'
        ],
        launch: [
          'How do I deploy a Next.js app on Vercel step by step?',
          'I want to launch an MVP quickly, what is the best hosting?',
          'Create a mobile app launch plan for App Store and Google Play',
          'What is the difference between Vercel, Netlify, and Render?',
          'Write a Dockerfile and docker-compose config for a Node.js app'
        ],
        ui: [
          'Create a button system with glassmorphism styling',
          'Write a responsive Navbar with a mobile hamburger menu',
          'I need a modern card component with hover lift and glow',
          'Design a dashboard layout with CSS Grid and a collapsible sidebar',
          'Create a sleek login form with focus animations'
        ],
        theme: [
          'Suggest a purple/pink aurora color palette for an AI chat app',
          'What are the best dark gradients for a luxury modern UI?',
          'Suggest paired English and Arabic fonts for a productivity app',
          'Ideas for an elegant, non-glaring off-white light theme',
          'How to implement clean dark/light mode with CSS variables?'
        ],
        dashboard: [
          'Design a statistical dashboard interface with charts',
          'Build a users table with search, filtering, and pagination',
          'I need a settings page with tabbed navigation',
          'Design a user profile page with metric cards',
          'Create an elegant dropdown notifications panel'
        ],
        landing: [
          'Write a high-converting Hero section for an AI app with CTA',
          'Build a pricing section with 3 tiers (Free / Pro / Enterprise)',
          'Design an accessible FAQ accordion with HTML/CSS/JS',
          'Write a testimonials section with customer review cards',
          'Create a modern footer with social links and newsletter signup'
        ],
        docs: [
          'Write a professional README.md for my GitHub project',
          'How do I prepare a PDF file for AI analysis and RAG?',
          'Create a documentation template page with sidebar navigation',
          'Write a CHANGELOG.md following the Keep a Changelog standard',
          'How can I extract text from Word or Excel files in the browser?'
        ],
        images: [
          'Give me a prompt to generate a purple aurora hero image for an AI app',
          'Create a minimal SVG icon set for a chat application',
          'How to optimize and compress images for web using WebP/AVIF?',
          'Write CSS for a circular avatar with animated gradient border',
          'Ideas for modern purple illustrations for empty states'
        ]
      };
      const panel = document.getElementById('quickSuggestionsPanel');
      const list = document.getElementById('qsList');
      const header = document.getElementById('qsHeader');
      const categoryLabelsAr = {
        code: '💻 توليد كود',
        launch: '🚀 إطلاق تطبيقات',
        ui: '🎨 مكونات واجهة',
        theme: '🎭 ثيمات وألوان',
        dashboard: '👤 لوحات المستخدم',
        landing: '🖥️ صفحات هبوط',
        docs: '📄 رفع مستندات',
        images: '🖼️ صور وأصول'
      };
      const categoryLabelsEn = {
        code: '💻 Code Gen',
        launch: '🚀 App Launch',
        ui: '🎨 UI Components',
        theme: '🎭 Themes & Colors',
        dashboard: '👤 Dashboard UI',
        landing: '🖥️ Landing Pages',
        docs: '📄 Upload Docs',
        images: '🖼️ Images & Assets'
      };
      let activeCat = null;

      function getCategoryLabel(cat) {
        return (qjoLanguage === 'en' ? categoryLabelsEn[cat] : categoryLabelsAr[cat]) || cat;
      }
      function getSuggestions(cat) {
        return (qjoLanguage === 'en' ? suggestionsEn[cat] : suggestionsAr[cat]) || [];
      }

      document.querySelectorAll('.quick-cat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const cat = btn.dataset.cat;
          const currentSuggestions = getSuggestions(cat);
          if (!currentSuggestions.length) return;
          if (activeCat === cat && panel && !panel.hidden){
            activeCat = null;
            panel.hidden = true;
            btn.classList.remove('active');
            return;
          }
          document.querySelectorAll('.quick-cat-btn').forEach(b => b.classList.remove('active'));
          activeCat = cat;
          btn.classList.add('active');
          if (header) header.textContent = getCategoryLabel(cat);
          if (list) {
            list.innerHTML = currentSuggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('');
            if (panel) panel.hidden = false;
            list.querySelectorAll('li').forEach((li, i) => {
              li.style.animation = `qjoRise .25s cubic-bezier(.2,.8,.2,1) ${i*0.03}s both`;
              li.addEventListener('click', (eLi) => {
                eLi.stopPropagation();
                const input = document.getElementById('input');
                if (input) {
                  input.value = li.textContent;
                  input.focus();
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (panel) panel.hidden = true;
                document.querySelectorAll('.quick-cat-btn').forEach(b => b.classList.remove('active'));
                activeCat = null;
              });
            });
          }
        });
      });

      document.addEventListener('click', (e) => {
        if (panel && !panel.hidden && !e.target.closest('#quickCommandCats') && !e.target.closest('#quickSuggestionsPanel')) {
          panel.hidden = true;
          document.querySelectorAll('.quick-cat-btn').forEach(b => b.classList.remove('active'));
          activeCat = null;
        }
      });
    }


    // ---- Avatar Picker Modal ----
    (function installAvatarPicker(){
      const modal = el('avatarModal');
      if(!modal) return;
      const preview = el('avatarPreview');
      const grid = el('avatarPickerGrid');
      const status = el('avatarStatus');
      const googleBtn = el('useGoogleAvatar');
      const resetBtn = el('resetAvatar');
      const closeBtn = el('closeAvatarModal');
      if(!preview || !grid) return;

      let currentChoice = readStored('qjo_user_avatar') || (currentUser && currentUser.photoURL ? 'google' : 'initial');

      function renderPreview(){
        preview.innerHTML = '';
        if(currentChoice === 'google' && currentUser && currentUser.photoURL){
          const img = document.createElement('img'); img.src = currentUser.photoURL; img.alt='';
          img.referrerPolicy='no-referrer';
          img.onerror = () => { currentChoice='initial'; renderPreview(); };
          preview.appendChild(img);
        } else if(currentChoice && currentChoice.startsWith('svg:')){
          preview.innerHTML = buildAvatarSVG(currentChoice.slice(4), 140);
        } else {
          const div = document.createElement('div');
          div.style.cssText = 'width:100%;height:100%;display:grid;place-items:center;font-size:48px;font-weight:800;color:#fff;font-family:inherit;';
          const letter = currentUser && currentUser.displayName ? currentUser.displayName.trim().charAt(0).toUpperCase() : 'Q';
          div.textContent = letter;
          preview.appendChild(div);
        }
        // mark selected in grid
        grid.querySelectorAll('.avatar-option').forEach(b => {
          b.classList.toggle('selected', b.dataset.val === currentChoice);
        });
      }

      function buildOptions(){
        grid.innerHTML = '';
        // Initial letter
        const initialBtn = document.createElement('button');
        initialBtn.type='button'; initialBtn.className='avatar-option'; initialBtn.dataset.val='initial';
        initialBtn.innerHTML = `<svg viewBox="0 0 100 100" width="64" height="64"><defs><linearGradient id="av-grad-init" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="0.5" stop-color="#a855f7"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#av-grad-init)"/><text x="50" y="62" text-anchor="middle" font-size="44" font-weight="800" fill="#fff" font-family="inherit">${currentUser && currentUser.displayName ? currentUser.displayName.trim().charAt(0).toUpperCase() : 'Q'}</text></svg>`;
        initialBtn.addEventListener('click', () => { currentChoice='initial'; renderPreview(); status.textContent='اخترت الحرف الأول.'; });
        grid.appendChild(initialBtn);

        // SVG avatars
        Object.keys(AVATAR_SVGS).forEach(id => {
          const btn = document.createElement('button');
          btn.type='button'; btn.className='avatar-option'; btn.dataset.val = 'svg:'+id;
          btn.innerHTML = buildAvatarSVG(id, 72);
          btn.addEventListener('click', () => { currentChoice='svg:'+id; renderPreview(); status.textContent='أفاتار رائع! اضغط خارج النافذة أو إغلاق للحفظ.'; });
          grid.appendChild(btn);
        });
      }

      function openPicker(){
        currentChoice = readStored('qjo_user_avatar') || (currentUser && currentUser.photoURL ? 'google' : 'initial');
        if(googleBtn){
          googleBtn.style.display = (currentUser && currentUser.photoURL) ? '' : 'none';
        }
        buildOptions();
        renderPreview();
        modal.classList.add('show');
        modal.setAttribute('aria-hidden','false');
      }
      window.__qjoOpenAvatarPicker = openPicker;
      function closePicker(save){
        if(save){
          writeStored('qjo_user_avatar', currentChoice);
          updateUserUI(currentUser);
          status.textContent = 'تم حفظ الصورة.';
        }
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden','true');
      }
      userAvatar.addEventListener('click', openPicker);
      if(accountCard){
        accountCard.addEventListener('click', (e) => {
          // Open picker only if click not on settings/logout buttons
          if(e.target.closest('.account-settings') || e.target.closest('.account-logout-direct')) return;
          openPicker();
        });
      }
      closeBtn && closeBtn.addEventListener('click', () => closePicker(true));
      modal.addEventListener('click', e => { if(e.target === modal) closePicker(true); });
      googleBtn && googleBtn.addEventListener('click', () => {
        if(!(currentUser && currentUser.photoURL)) return;
        currentChoice = 'google';
        renderPreview();
        status.textContent = 'سيتم استخدام صورة جوجل.';
      });
      resetBtn && resetBtn.addEventListener('click', () => {
        currentChoice = 'initial';
        renderPreview();
        status.textContent = 'تمت إعادة الصورة للحرف الأول.';
      });
    })();

    // Re-bind avatar picker trigger any time the avatar/account card is replaced (after sign-in render)
    function rebindAvatarTrigger(){
      const av = el('userAvatar');
      const ac = el('accountCard');
      if (!av || av.dataset.bound === '1') return;
      av.dataset.bound = '1';
      av.style.cursor = 'pointer';
      av.addEventListener('click', (e) => {
        e.stopPropagation();
        const m = el('avatarModal');
        if (m) {
          // trigger existing openPicker by dispatching a custom event (simpler: call via window)
          if (window.__qjoOpenAvatarPicker) window.__qjoOpenAvatarPicker();
        }
      });
    }
    rebindAvatarTrigger();
    // Also try a few times after load (for Firebase redirect)
    setTimeout(rebindAvatarTrigger, 500);
    setTimeout(rebindAvatarTrigger, 1500);

    // ---- Interactive Cloud Mascot (SVG vector, Eyes tracking, smooth blinking & shy password closing) ----
    function initCloudMascot() {
      const mascot = document.getElementById('cloudMascot');
      if (!mascot) return;
      const leftPupil = mascot.querySelector('.left-pupil');
      const rightPupil = mascot.querySelector('.right-pupil');
      const leftEye = mascot.querySelector('.left-eye-group');
      const rightEye = mascot.querySelector('.right-eye-group');
      const passwordInput = document.getElementById('authPassword');

      let isPasswordFocused = false;

      function trackEye(eye, pupil, mouseX, mouseY) {
        if (isPasswordFocused || !eye || !pupil) return;
        const rect = eye.getBoundingClientRect();
        const eyeCenterX = rect.left + rect.width / 2;
        const eyeCenterY = rect.top + rect.height / 2;
        const dx = mouseX - eyeCenterX;
        const dy = mouseY - eyeCenterY;
        const dist = Math.hypot(dx, dy);
        const maxDist = 4.5;
        const moveX = dist > 0 ? (dx / dist) * Math.min(dist, maxDist) : 0;
        const moveY = dist > 0 ? (dy / dist) * Math.min(dist, maxDist * 1.2) : 0;
        pupil.style.transform = `translate(${moveX}px, ${moveY}px)`;
      }

      window.addEventListener('mousemove', (e) => {
        if (!isPasswordFocused) {
          trackEye(leftEye, leftPupil, e.clientX, e.clientY);
          trackEye(rightEye, rightPupil, e.clientX, e.clientY);
        }
      }, { passive: true });

      // Blink periodically every 3.5s
      setInterval(() => {
        if (isPasswordFocused) return;
        mascot.classList.add('blink');
        setTimeout(() => mascot.classList.remove('blink'), 180);
      }, 3500);

      // Password input focus -> eyes smoothly close into happy arcs & hands cover up!
      if (passwordInput) {
        passwordInput.addEventListener('focus', () => {
          if (passwordInput.type === 'password') {
            isPasswordFocused = true;
            mascot.classList.add('cloud-eyes-closed');
            if (leftPupil) leftPupil.style.transform = '';
            if (rightPupil) rightPupil.style.transform = '';
          }
        });
        passwordInput.addEventListener('blur', () => {
          isPasswordFocused = false;
          mascot.classList.remove('cloud-eyes-closed');
        });
      }

      const togglePassBtn = document.getElementById('togglePasswordVisibility');
      if (togglePassBtn && passwordInput) {
        togglePassBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const willShow = passwordInput.type === 'password';
          passwordInput.type = willShow ? 'text' : 'password';
          togglePassBtn.classList.toggle('showing-password', willShow);
          togglePassBtn.setAttribute('title', willShow ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
          togglePassBtn.setAttribute('aria-pressed', willShow ? 'true' : 'false');

          if (willShow) {
            isPasswordFocused = false;
            mascot.classList.remove('cloud-eyes-closed');
          } else {
            isPasswordFocused = true;
            mascot.classList.add('cloud-eyes-closed');
            if (leftPupil) leftPupil.style.transform = '';
            if (rightPupil) rightPupil.style.transform = '';
          }
          passwordInput.focus();
        });
      }
    }
    initCloudMascot();
    setTimeout(initCloudMascot, 300);

    // --- Mobile Side Notch & Tools Drawer (ChatGPT / Gemini style) ---
    function installMobileToolsNotch() {
      const notch = document.getElementById('mobileToolsNotch');
      const sheet = document.getElementById('mobileToolsSheet');
      const backdrop = document.getElementById('mobileToolsBackdrop');
      const closeBtn = document.getElementById('closeToolsSheetBtn');
      const togglesGrid = document.getElementById('mobileSheetToggles');
      const modeRow = document.getElementById('mobileSheetMode');
      const catsGrid = document.getElementById('mobileSheetCats');
      const indicator = document.getElementById('notchIndicator');

      if (!notch || !sheet || !backdrop) return;

      const toggleDefs = [
        { id: 'toggleSearch', icon: '🔍', titleKey: 'searchTitle', descKey: 'searchDesc' },
        { id: 'toggleDeep', icon: '🎯', titleKey: 'deepSearchTitle', descKey: 'deepSearchDesc' },
        { id: 'toggleTask', icon: '🎯', titleKey: 'taskModeTitle', descKey: 'taskModeDesc' }
      ];

      function updateIndicator() {
        const anyActive = toggleDefs.some(t => document.getElementById(t.id)?.classList.contains('active'));
        if (indicator) indicator.classList.toggle('active', anyActive);
      }

      function renderSheetMode() {
        if (!modeRow) return;
        const options = [
          { mode: 'normal', icon: '⚡', labelKey: 'normal', descKey: 'flashModeTitle' },
          { mode: 'advanced', icon: '◆', labelKey: 'advanced', descKey: 'maxModeTitle' }
        ];
        modeRow.innerHTML = '';
        options.forEach(opt => {
          const active = (opt.mode === 'advanced') === (qjoMode === 'advanced');
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'sheet-mode-card' + (active ? ' active' : '');
          card.setAttribute('role', 'radio');
          card.setAttribute('aria-checked', active ? 'true' : 'false');
          card.innerHTML = `
            <span class="sheet-mode-icon">${opt.icon}</span>
            <span class="sheet-mode-name">${t(opt.labelKey)}</span>
            <span class="sheet-mode-desc">${t(opt.descKey)}</span>
          `;
          card.addEventListener('click', () => {
            setMode(opt.mode);
            renderSheetMode();
          });
          modeRow.appendChild(card);
        });
      }

      function renderSheetToggles() {
        if (!togglesGrid) return;
        togglesGrid.innerHTML = '';
        toggleDefs.forEach(def => {
          const origBtn = document.getElementById(def.id);
          const isActive = Boolean(origBtn?.classList.contains('active'));
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'sheet-toggle-card' + (isActive ? ' active' : '');
          item.innerHTML = `
            <div class="sheet-toggle-icon">${def.icon}</div>
            <div class="sheet-toggle-info">
              <span class="sheet-toggle-name">${t(def.titleKey)}</span>
              <span class="sheet-toggle-desc">${t(def.descKey)}</span>
            </div>
            <div class="sheet-toggle-switch">
              <span class="sheet-toggle-knob"></span>
            </div>
          `;
          item.addEventListener('click', () => {
            if (origBtn) origBtn.click();
            const nowActive = Boolean(origBtn?.classList.contains('active'));
            item.classList.toggle('active', nowActive);
            updateIndicator();
          });
          togglesGrid.appendChild(item);
        });
        updateIndicator();
      }

      function renderSheetCats() {
        if (!catsGrid) return;
        catsGrid.innerHTML = '';
        const origCats = document.querySelectorAll('.quick-command-cats .quick-cat-btn');
        origCats.forEach(catBtn => {
          const cat = catBtn.dataset.cat;
          const label = catBtn.querySelector('span')?.textContent || '';
          const iconSvg = catBtn.querySelector('svg')?.outerHTML || '⚡';
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'sheet-cat-chip';
          item.innerHTML = `
            <div class="sheet-cat-icon-wrap">${iconSvg}</div>
            <span class="sheet-cat-label">${label}</span>
          `;
          item.addEventListener('click', () => {
            catBtn.click();
            closeSheet();
            inputEl?.focus();
          });
          catsGrid.appendChild(item);
        });
      }

      function openSheet() {
        renderSheetMode();
        renderSheetToggles();
        renderSheetCats();
        sheet.classList.add('show');
        backdrop.classList.add('show');
        document.body.classList.add('sheet-open');
      }

      function closeSheet() {
        sheet.classList.remove('show');
        backdrop.classList.remove('show');
        document.body.classList.remove('sheet-open');
      }

      const triggerBtn = document.getElementById('mobileToolsTriggerBtn');
      if (triggerBtn) triggerBtn.addEventListener('click', openSheet);
      notch.addEventListener('click', openSheet);
      if (closeBtn) closeBtn.addEventListener('click', closeSheet);
      backdrop.addEventListener('click', closeSheet);

      // Listen for toggle changes from any source
      toggleDefs.forEach(def => {
        const origBtn = document.getElementById(def.id);
        if (origBtn) {
          const obs = new MutationObserver(() => updateIndicator());
          obs.observe(origBtn, { attributes: true, attributeFilter: ['class'] });
        }
      });
      updateIndicator();
    }
    installMobileToolsNotch();
    setTimeout(installMobileToolsNotch, 400);

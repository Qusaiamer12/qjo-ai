const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBo902a2kkFRla-asU2nAzFkBaDW7yJTVI",
  authDomain: "qjo1-8ae37.firebaseapp.com",
  projectId: "qjo1-8ae37",
  storageBucket: "qjo1-8ae37.firebasestorage.app",
  messagingSenderId: "549387435430",
  appId: "1:549387435430:web:563fd4dcb108f360eb6367",
  measurementId: "G-J5RGLP3EG5"
};

const $ = (id) => document.getElementById(id);
let auth;
let currentConfig;

function setStatus(text) { $('status').textContent = text || ''; }
function setLoginStatus(text) { $('loginStatus').textContent = text || ''; }
function setDiagnostics(data) { const box = $('diagnosticsBox'); if (box) box.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2); }

async function token() {
  return auth.currentUser.getIdToken();
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (auth.currentUser) headers.Authorization = 'Bearer ' + await token();
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderSuggestions(items = []) {
  const box = $('suggestionsFields');
  box.innerHTML = '';
  const suggestions = items.length ? items : [{}, {}, {}];
  suggestions.slice(0, 6).forEach((item, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'admin-field';
    wrap.innerHTML = `
      <label>اقتراح ${index + 1}</label>
      <input data-suggestion-title="${index}" placeholder="العنوان" value="${escapeHtml(item.title || '')}" />
      <input data-suggestion-text="${index}" placeholder="الوصف" value="${escapeHtml(item.text || '')}" />
      <input data-suggestion-prompt="${index}" placeholder="الأمر المرسل" value="${escapeHtml(item.prompt || '')}" />
    `;
    box.appendChild(wrap);
  });
}

function escapeHtml(text) {
  return String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'", '&#039;');
}

function fillForm(config) {
  currentConfig = config;
  $('assistantName').value = config.assistantName || 'Qjo';
  $('tagline').value = config.tagline || '';
  $('welcomeTitle').value = config.welcomeTitle || '';
  $('welcomeText').value = config.welcomeText || '';
  $('globalTraining').value = config.globalTraining || '';
  renderSuggestions(config.suggestions || []);
}

function collectForm() {
  const suggestions = [];
  document.querySelectorAll('[data-suggestion-title]').forEach((node) => {
    const i = node.dataset.suggestionTitle;
    suggestions.push({
      title: node.value,
      text: document.querySelector(`[data-suggestion-text="${i}"]`)?.value || '',
      prompt: document.querySelector(`[data-suggestion-prompt="${i}"]`)?.value || ''
    });
  });
  return {
    assistantName: $('assistantName').value,
    tagline: $('tagline').value,
    welcomeTitle: $('welcomeTitle').value,
    welcomeText: $('welcomeText').value,
    globalTraining: $('globalTraining').value,
    suggestions
  };
}

async function loadAdmin() {
  setStatus('جاري التحميل...');
  const data = await api('/api/admin/me');
  fillForm(data.config);
  $('adminApp').hidden = false;
  $('loginBox').hidden = true;
  setStatus('');
}

async function loadDiagnostics() {
  setDiagnostics('جاري الفحص...');
  try {
    const data = await api('/api/admin/diagnostics');
    setDiagnostics(data);
  } catch (error) {
    setDiagnostics('فشل الفحص: ' + error.message);
  }
}

async function saveAdmin() {
  setStatus('جاري الحفظ...');
  const data = await api('/api/admin/config', { method: 'POST', body: JSON.stringify(collectForm()) });
  fillForm(data.config);
  setStatus('تم الحفظ بنجاح.');
}

function init() {
  firebase.initializeApp(DEFAULT_FIREBASE_CONFIG);
  auth = firebase.auth();
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      $('adminApp').hidden = true;
      $('loginBox').hidden = false;
      return;
    }
    try { await loadAdmin(); }
    catch (error) {
      $('adminApp').hidden = true;
      $('loginBox').hidden = false;
      setLoginStatus(error.message);
    }
  });

  $('googleLoginBtn').addEventListener('click', async () => {
    try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
    catch (error) { setLoginStatus(error.message); }
  });
  $('logoutBtn').addEventListener('click', () => auth.signOut());
  $('saveBtn').addEventListener('click', saveAdmin);
  $('reloadBtn').addEventListener('click', loadAdmin);
  const diagnosticsBtn = $('diagnosticsBtn');
  if (diagnosticsBtn) diagnosticsBtn.addEventListener('click', loadDiagnostics);
}

window.addEventListener('DOMContentLoaded', init);

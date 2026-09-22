// App shell: auth flow, router, bottom nav, shared UI helpers.
import * as db from './db.js?v=4';
import { loadCatalog } from './nutrition.js?v=4';
import { renderHome } from './views/home.js?v=4';
import { renderPantry } from './views/pantry.js?v=4';
import { renderRecipes, renderRecipeDetail } from './views/recipes.js?v=4';
import { renderWeek } from './views/week.js?v=4';
import { renderShopping } from './views/shopping.js?v=4';

export const $ = sel => document.querySelector(sel);
export function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

export function toast(msg, ms = 2200) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function openSheet(html) {
  closeSheet();
  const back = document.createElement('div'); back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet">${html}</div>`;
  back.addEventListener('click', e => { if (e.target === back) closeSheet(); });
  document.body.appendChild(back);
  return back.querySelector('.sheet');
}
export function closeSheet() { document.querySelectorAll('.sheet-back').forEach(s => s.remove()); }

export const AV_COLORS = { 'יובל': '#2f6b3c', 'רון': '#3a6ea5' };
export function avColor(name) { return AV_COLORS[name] || '#8a7ec9'; }
export function avatar(name, cls = 'mini-av') {
  return `<span class="${cls}" style="background:${avColor(name)}">${esc((name || '?').slice(0, 1))}</span>`;
}

export const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  pantry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16v18H4z"/><path d="M4 9h16M9 13h2"/></svg>',
  recipes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
  week: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  shopping: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.5"/><circle cx="19" cy="21" r="1.5"/><path d="M2 3h3l2.6 12.5a2 2 0 0 0 2 1.5h8.7a2 2 0 0 0 2-1.6L22 7H6"/></svg>',
};

const TABS = [
  { id: 'home', label: 'בית', render: renderHome },
  { id: 'pantry', label: 'מזווה', render: renderPantry },
  { id: 'recipes', label: 'מתכונים', render: renderRecipes },
  { id: 'week', label: 'שבוע', render: renderWeek },
  { id: 'shopping', label: 'קניות', render: renderShopping },
];
let currentTab = 'home';
let detailRecipeId = null;
let navOpts = {};

export function navigate(tab, arg) {
  if (tab === 'recipe-detail') { detailRecipeId = arg; navOpts = {}; render(); return; }
  detailRecipeId = null;
  currentTab = tab;
  navOpts = arg || {};
  localStorage.setItem('last_tab', tab);
  render();
}
export function getDetailRecipeId() { return detailRecipeId; }

function render() {
  // preserve focus + caret across re-renders (realtime updates while typing)
  const ae = document.activeElement;
  const focusId = ae && ae.id ? ae.id : null;
  const focusVal = focusId ? ae.value : null;
  const caret = focusId ? ae.selectionStart : null;
  const app = $('#app');
  const who = db.myName();
  app.innerHTML = `
    <div class="topbar">
      <span class="sync-dot" title="מסונכרן"></span>
      <h1 id="view-title"></h1>
      <button class="who-chip" id="who-btn" title="החלפת משתמש / התנתקות">
        ${avatar(who)}<span>${esc(who)}</span>
      </button>
    </div>
    <div class="content" id="content"></div>
    <nav class="bottom-nav">
      ${TABS.map(t => `<button class="nav-item ${t.id === currentTab && !detailRecipeId ? 'active' : ''}" data-tab="${t.id}">${ICONS[t.id]}<span>${t.label}</span></button>`).join('')}
    </nav>`;
  app.querySelectorAll('.nav-item').forEach(b => b.onclick = () => navigate(b.dataset.tab));
  $('#who-btn').onclick = whoMenu;
  const content = $('#content');
  if (detailRecipeId) { $('#view-title').textContent = 'מתכון'; renderRecipeDetail(content, detailRecipeId); }
  else {
    const tab = TABS.find(t => t.id === currentTab);
    $('#view-title').textContent = tab.label === 'בית' ? greeting() : tab.label;
    tab.render(content, navOpts);
    navOpts = {};
  }
  const d = document.querySelector('.sync-dot'); if (d) d.className = 'sync-dot';
  if (focusId) {
    const el2 = document.getElementById(focusId);
    if (el2 && el2.value === focusVal) { el2.focus(); try { el2.setSelectionRange(caret, caret); } catch {} }
  }
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
}

function whoMenu() {
  const sheet = openSheet(`
    <h3>מחובר/ת כ${esc(db.myName())}</h3>
    <p class="muted">החשבון משותף לבית. כל שינוי מסתנכן מיד לשנייכם.</p>
    <button class="btn secondary" id="copy-code">העתקת קוד בית: ${esc(window.__joinCode || '')}</button>
    <button class="btn ghost" id="do-signout" style="color:var(--red)">התנתקות</button>`);
  sheet.querySelector('#do-signout').onclick = async () => { closeSheet(); await db.signOut(); boot(); };
  sheet.querySelector('#copy-code').onclick = async () => {
    try { await navigator.clipboard.writeText(window.__joinCode || ''); toast('הקוד הועתק'); } catch { toast(window.__joinCode || ''); }
  };
}

/* ---------- auth screens ---------- */
function renderLogin() {
  const app = $('#app');
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-logo">🍳</div>
      <h1 class="auth-title">הבית שלנו</h1>
      <p class="auth-sub">מזווה, מתכונים וקניות - משותף ליובל ורון</p>
      <div class="field"><label>אימייל</label><input id="email" type="email" inputmode="email" dir="ltr" placeholder="you@example.com" autocomplete="email"></div>
      <div class="auth-err" id="err"></div>
      <button class="btn" id="send">שלחו לי קישור כניסה</button>
    </div>`;
  const emailEl = $('#email');
  emailEl.focus();
  $('#send').onclick = async () => {
    const email = emailEl.value.trim();
    if (!email || !email.includes('@')) { $('#err').textContent = 'כתובת אימייל לא תקינה'; return; }
    $('#send').textContent = 'שולח...'; $('#send').disabled = true;
    try { await db.sendOtp(email); renderSent(email); }
    catch (e) { $('#err').textContent = 'שגיאה בשליחה: ' + (e.message || e); $('#send').textContent = 'שלחו לי קישור כניסה'; $('#send').disabled = false; }
  };
  emailEl.addEventListener('keydown', e => { if (e.key === 'Enter') $('#send').click(); });
}

function renderSent(email) {
  const app = $('#app');
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-logo">📬</div>
      <h1 class="auth-title">קישור נשלח</h1>
      <p class="auth-sub">נשלח קישור כניסה ל-${esc(email)}.<br>לחצו עליו באותו המכשיר - והאפליקציה תיפתח מחוברת.<br>בדקו גם בספאם.</p>
      <button class="btn secondary" id="resend">לא קיבלתם? שליחה חוזרת</button>
      <button class="btn ghost" id="back">חזרה</button>
    </div>`;
  $('#resend').onclick = async () => { try { await db.sendOtp(email); toast('נשלח שוב'); } catch (e) { toast('שגיאה בשליחה'); } };
  $('#back').onclick = renderLogin;
}

function renderClaim() {
  const app = $('#app');
  let sel = null;
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-logo">🏠</div>
      <h1 class="auth-title">מי את/ה?</h1>
      <p class="auth-sub">כניסה ראשונה - בחרו מי אתם והזינו את קוד הבית</p>
      <div class="who-grid">
        <button class="who-card" data-who="יובל"><span class="who-avatar" style="background:${avColor('יובל')};color:#fff">י</span>יובל</button>
        <button class="who-card" data-who="רון"><span class="who-avatar" style="background:${avColor('רון')};color:#fff">ר</span>רון</button>
      </div>
      <div class="field"><label>קוד בית (6 תווים)</label><input id="jcode" type="text" dir="ltr" style="text-align:center;letter-spacing:4px;text-transform:uppercase" maxlength="6" placeholder="BAYIT26"></div>
      <div class="auth-err" id="err"></div>
      <button class="btn" id="claim">כניסה לבית</button>
      <p class="hint">את הקוד מקבלים מבן/בת הזוג שכבר נכנס/ה,<br>או מיובל 😄</p>
    </div>`;
  app.querySelectorAll('.who-card').forEach(b => b.onclick = () => {
    app.querySelectorAll('.who-card').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); sel = b.dataset.who;
  });
  $('#claim').onclick = async () => {
    if (!sel) { $('#err').textContent = 'בחרו מי אתם'; return; }
    const code = $('#jcode').value.trim();
    if (!code) { $('#err').textContent = 'חסר קוד בית'; return; }
    $('#claim').disabled = true; $('#claim').textContent = 'נכנס...';
    try { await db.claimProfile(sel, code); boot(); }
    catch (e) {
      $('#err').textContent = e.message === 'קוד שגוי' ? 'קוד שגוי - בדקו שוב' : 'השם כבר תפוס או שגיאה: ' + (e.message || e);
      $('#claim').disabled = false; $('#claim').textContent = 'כניסה לבית';
    }
  };
}

/* ---------- boot ---------- */
export async function boot() {
  const app = $('#app');
  app.innerHTML = '<div class="boot"><div class="boot-logo">🍳</div><div class="boot-text">הבית שלנו</div></div>';
  const user = await db.getSession();
  if (!user) { renderLogin(); return; }
  const profile = await db.loadProfile();
  if (!profile) { renderClaim(); return; }
  await db.loadFromCache();
  render();
  await db.loadMembers();
  await db.refreshAll();
  // join code for sharing with partner
  const { data: hh } = await db.sb.from('households').select('join_code').eq('id', profile.household_id).maybeSingle();
  window.__joinCode = hh?.join_code || '';
  loadCatalog(db.getData('ingredient_nutrition'));
  db.startRealtime();
  db.flushOutbox();
  render();
}

db.subscribe(() => {
  if (!db.getProfile()) return;
  loadCatalog(db.getData('ingredient_nutrition'));
  render();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();

// מזווה: חיפוש, פילטרים, כמויות גסות, פתוח/תוקף, פעולות מהירות.
import * as db from '../db.js?v=4';
import { esc, toast, openSheet, closeSheet, $ } from '../app.js?v=4';
import { catalog } from '../nutrition.js?v=4';
import { localDateKey } from '../match.js?v=5';

const LOC_ICON = { fridge: '🧊', freezer: '❄️', pantry: '🗄️' };
const LOC_NAME = { fridge: 'מקרר', freezer: 'מקפיא', pantry: 'מזווה' };
const QTY = [['full', 'מלא'], ['half', 'חצי'], ['low', 'מעט']];
const CATS = ['ירקות ופירות', 'חלב וביצים', 'בשר ודגים', 'מאפים ולחם', 'מזווה ושימורים', 'קפואים', 'חטיפים ושתייה', 'אחר'];

let filter = 'all', query = '';

export function renderPantry(el, opts = {}) {
  const pantry = db.getData('pantry_items');
  const q = query.trim();
  let items = pantry.filter(p => {
    if (q && !p.name.includes(q)) return false;
    if (filter === 'open') return p.is_open;
    if (filter === 'low') return p.quantity_state === 'low';
    if (filter === 'protein') return p.is_protein;
    if (filter === 'freezer') return p.location === 'freezer';
    return true;
  });

  el.innerHTML = `
    <div class="search-box">🔍 <input id="p-search" placeholder="חיפוש במזווה..." value="${esc(query)}"></div>
    <div class="chip-row">
      ${[['all', 'הכל'], ['open', 'פתוח'], ['low', 'נגמר בקרוב'], ['protein', 'חלבון 💪'], ['freezer', 'מקפיא ❄️']]
        .map(([id, l]) => `<button class="chip ${filter === id ? 'on' : ''}" data-f="${id}">${l}</button>`).join('')}
    </div>
    <div class="section-title">${items.length} פריטים <button class="btn small secondary" id="p-add" style="margin-right:auto">+ הוספה</button></div>
    <div id="p-list">
      ${items.length ? items.map(itemHtml).join('') : '<div class="empty"><div class="big">🥕</div>המזווה ריק כאן.<br>הוסיפו את המוצר הראשון!</div>'}
    </div>`;

  $('#p-search').oninput = e => { query = e.target.value; refreshList(); };
  el.querySelectorAll('.chip').forEach(c => c.onclick = () => { filter = c.dataset.f; renderPantry(el); });
  $('#p-add').onclick = () => addSheet();
  bindItems(el);
  if (opts.add) addSheet();
}

function refreshList() {
  const pantry = db.getData('pantry_items');
  const q = query.trim();
  let items = pantry.filter(p => {
    if (q && !p.name.includes(q)) return false;
    if (filter === 'open') return p.is_open;
    if (filter === 'low') return p.quantity_state === 'low';
    if (filter === 'protein') return p.is_protein;
    if (filter === 'freezer') return p.location === 'freezer';
    return true;
  });
  const list = document.querySelector('#p-list');
  if (list) { list.innerHTML = items.length ? items.map(itemHtml).join('') : '<div class="empty">לא נמצאו פריטים</div>'; bindItems(document); }
}

function itemHtml(p) {
  const openedDays = p.opened_at ? Math.floor((Date.now() - new Date(p.opened_at).getTime()) / 86400000) : null;
  return `
  <div class="p-item" data-id="${p.id}">
    <div class="p-main">
      <div class="p-loc" title="${LOC_NAME[p.location]}">${LOC_ICON[p.location]}</div>
      <div class="p-name">${esc(p.name)}
        <div class="p-sub">
          ${p.is_open ? `<span class="badge open">פתוח${openedDays != null ? (openedDays === 0 ? ' · היום' : ` · לפני ${openedDays} ימים`) : ''}</span>` : ''}
          ${p.quantity_state === 'low' ? '<span class="badge low">נגמר בקרוב</span>' : ''}
          ${p.is_protein ? '<span class="badge protein">חלבון</span>' : ''}
          ${p.package_size ? `<span>${esc(p.package_size)}</span>` : ''}
        </div>
      </div>
      <div class="qty-toggle" title="כמות">
        ${QTY.map(([v, l]) => `<button data-q="${v}" class="${p.quantity_state === v ? 'on' : ''}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="p-actions">
      <button class="act a-open">${p.is_open ? '✓ סגירה' : 'פתיחה'}</button>
      <button class="act a-shop">🛒 לקניות</button>
      <button class="danger a-done">נגמר</button>
    </div>
  </div>`;
}

function bindItems(root) {
  root.querySelectorAll('.p-item').forEach(card => {
    const id = card.dataset.id;
    const p = db.getData('pantry_items').find(x => x.id === id);
    if (!p) return;
    card.querySelectorAll('.qty-toggle button').forEach(b => b.onclick = async e => {
      e.stopPropagation();
      await db.mutate('pantry_items', 'update', { quantity_state: b.dataset.q }, id);
      toast('עודכן');
    });
    card.querySelector('.a-open').onclick = async () => {
      await db.mutate('pantry_items', 'update', p.is_open
        ? { is_open: false, opened_at: null }
        : { is_open: true, opened_at: localDateKey() }, id);
    };
    card.querySelector('.a-shop').onclick = async () => {
      await db.mutate('shopping_items', 'insert', { name: p.name, section: p.category || 'אחר', added_by: db.myName() });
      toast('נוסף לקניות 🛒');
    };
    card.querySelector('.a-done').onclick = async () => {
      const sheet = openSheet(`
        <h3>הסתיים "${esc(p.name)}"?</h3>
        <button class="btn" id="d1">נגמר - והוסף לקניות</button>
        <button class="btn secondary" id="d2">נגמר בלבד</button>
        <button class="btn ghost" id="d3">ביטול</button>`);
      sheet.querySelector('#d1').onclick = async () => {
        await db.mutate('pantry_items', 'update', { deleted_at: new Date().toISOString() }, id);
        await db.mutate('shopping_items', 'insert', { name: p.name, section: p.category || 'אחר', added_by: db.myName() });
        closeSheet(); toast('הוסר מהמזווה ונוסף לקניות');
      };
      sheet.querySelector('#d2').onclick = async () => {
        await db.mutate('pantry_items', 'update', { deleted_at: new Date().toISOString() }, id);
        closeSheet(); toast('הוסר מהמזווה');
      };
      sheet.querySelector('#d3').onclick = closeSheet;
    };
  });
}

function addSheet() {
  const names = Object.values(catalog()).map(i => i.name_he);
  const sheet = openSheet(`
    <h3>מוצר חדש במזווה</h3>
    <div class="field"><label>שם</label><input id="np-name" list="np-names" placeholder="למשל: משקה חלבון וניל">
      <datalist id="np-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
    <div class="form-grid">
      <div class="field"><label>קטגוריה</label><select id="np-cat">${CATS.map(c => `<option>${c}</option>`).join('')}</select></div>
      <div class="field"><label>מיקום</label><select id="np-loc"><option value="fridge">מקרר 🧊</option><option value="freezer">מקפיא ❄️</option><option value="pantry">מזווה 🗄️</option></select></div>
      <div class="field"><label>כמות</label><select id="np-qty">${QTY.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      <div class="field"><label>גודל אריזה (אופציונלי)</label><input id="np-pkg" placeholder='350 מ"ל / 500 גרם'></div>
    </div>
    <div class="row" style="gap:18px;margin:6px 0 2px">
      <label class="row" style="gap:6px"><input type="checkbox" id="np-open"> פתוח</label>
      <label class="row" style="gap:6px"><input type="checkbox" id="np-protein"> חלבון 💪</label>
    </div>
    <button class="btn" id="np-save">הוספה למזווה</button>`);
  sheet.querySelector('#np-name').focus();
  sheet.querySelector('#np-save').onclick = async () => {
    const name = sheet.querySelector('#np-name').value.trim();
    if (!name) { toast('חסר שם'); return; }
    const isOpen = sheet.querySelector('#np-open').checked;
    await db.mutate('pantry_items', 'insert', {
      name, category: sheet.querySelector('#np-cat').value,
      location: sheet.querySelector('#np-loc').value,
      quantity_state: sheet.querySelector('#np-qty').value,
      package_size: sheet.querySelector('#np-pkg').value.trim() || null,
      is_open: isOpen, opened_at: isOpen ? localDateKey() : null,
      is_protein: sheet.querySelector('#np-protein').checked,
      added_by: db.myName(),
    });
    closeSheet(); toast('נוסף למזווה 🥕');
  };
}

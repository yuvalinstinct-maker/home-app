// קניות: רשימה משותפת חיה לפי מחלקות בסופר, מי הוסיף, checkoff חי, סיום קנייה למזווה.
import * as db from '../db.js';
import { esc, toast, openSheet, closeSheet, avatar, avColor } from '../app.js';

const SECTIONS = ['ירקות ופירות', 'חלב וביצים', 'בשר ודגים', 'מאפים ולחם', 'מזווה ושימורים', 'קפואים', 'חטיפים ושתייה', 'ניקיון וטואלטיקה', 'אחר'];
const SEC_ICON = { 'ירקות ופירות': '🥬', 'חלב וביצים': '🥛', 'בשר ודגים': '🍗', 'מאפים ולחם': '🍞', 'מזווה ושימורים': '🥫', 'קפואים': '❄️', 'חטיפים ושתייה': '🍪', 'ניקיון וטואלטיקה': '🧴', 'אחר': '📦' };

export function renderShopping(el) {
  const items = db.getData('shopping_items');
  const open = items.filter(i => !i.checked);
  const done = items.filter(i => i.checked);

  el.innerHTML = `
    <div class="add-row">
      <input id="sh-add" placeholder="+ מה קונים?">
    </div>
    ${items.length === 0 ? '<div class="empty"><div class="big">🛒</div>הרשימה ריקה.<br>הוסיפו למעלה, או מהמתכון / המזווה.</div>' : ''}
    ${SECTIONS.map(sec => {
      const list = open.filter(i => i.section === sec);
      if (!list.length) return '';
      return `<div class="shop-section">
        <div class="shop-sec-title">${SEC_ICON[sec]} ${sec} <span class="muted">(${list.length})</span></div>
        ${list.map(itemHtml).join('')}
      </div>`;
    }).join('')}
    ${done.length ? `
      <div class="shop-sec-title" style="color:var(--ink-soft)">✓ בסל (${done.length})</div>
      ${done.map(itemHtml).join('')}
      <div class="finish-bar"><button class="btn" id="sh-finish">סיימתי קנייה - הכנסה למזווה</button></div>` : ''}`;

  const input = $('#sh-add');
  input.onkeydown = async e => {
    if (e.key !== 'Enter') return;
    const name = input.value.trim();
    if (!name) return;
    await db.mutate('shopping_items', 'insert', { name, section: guessSection(name), added_by: db.myName() });
    input.value = ''; toast('נוסף');
    input.focus();
  };
  el.querySelectorAll('.shop-item').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('.si-check').onclick = async () => {
      const it = db.getData('shopping_items').find(x => x.id === id);
      await db.mutate('shopping_items', 'update', it.checked
        ? { checked: false, checked_at: null }
        : { checked: true, checked_at: new Date().toISOString() }, id);
    };
    row.querySelector('.si-del').onclick = async () => {
      await db.mutate('shopping_items', 'delete', {}, id);
    };
  });
  const fin = $('#sh-finish');
  if (fin) fin.onclick = () => finishSheet(done);
}

function itemHtml(i) {
  return `<div class="shop-item ${i.checked ? 'checked' : ''}" data-id="${i.id}">
    <button class="si-check">${i.checked ? '✓' : ''}</button>
    <span class="si-name">${esc(i.name)}</span>
    ${i.qty ? `<span class="si-qty">${i.qty} ${esc(i.unit || '')}</span>` : ''}
    ${i.added_by ? `<span class="si-who" style="background:${avColor(i.added_by)}" title="${esc(i.added_by)}">${esc(i.added_by.slice(0, 1))}</span>` : ''}
    <button class="si-del" style="color:var(--ink-soft);font-size:17px;padding:2px 6px">×</button>
  </div>`;
}

function guessSection(name) {
  const n = name || '';
  const rules = [
    [/חלב|יוגורט|קוטג|שמנת|ביצ|גבינ|משקה חלבון/, 'חלב וביצים'],
    [/עוף|פרגי|בשר|דג|סלמון|טונה|פסטרמ/, 'בשר ודגים'],
    [/לחם|פיתה|חלה|בורקס/, 'מאפים ולחם'],
    [/קפוא|גלידה|אפונה/, 'קפואים'],
    [/עגבנ|מלפפון|בצל|גזר|פלפל|פטרי|בננה|אבוקדו|לימון|ירק|פירות/, 'ירקות ופירות'],
    [/חומוס|טחינה|פסטה|אטרי|אורז|שימורים|קקאו|קמח|סוכר|קסנטן|ממתיק|רוטב|שמן/, 'מזווה ושימורים'],
    [/חטיף|במבה|שוקולד|אוראו|שתיי|קולה|בירה/, 'חטיפים ושתייה'],
    [/ניקיון|סבון|נייר|טואלטיקה|אקונומיקה/, 'ניקיון וטואלטיקה'],
  ];
  for (const [re, sec] of rules) if (re.test(n)) return sec;
  return 'אחר';
}

function finishSheet(done) {
  const sheet = openSheet(`
    <h3>מה נכנס למזווה?</h3>
    <p class="muted">סמנו את מה שקניתם וצריך לחזור למזווה</p>
    <div style="max-height:45vh;overflow-y:auto">
    ${done.map((d, i) => `<label class="review-ing">
      <input type="checkbox" checked data-id="${d.id}">
      <span style="flex:1">${esc(d.name)}</span>
      <select data-qty="${d.id}" style="padding:6px;border:1px solid var(--line);border-radius:8px">
        <option value="full">מלא</option><option value="half">חצי</option><option value="low">מעט</option>
      </select>
    </label>`).join('')}
    </div>
    <button class="btn" id="fs-go">הכנסה למזווה וניקוי הרשימה</button>
    <button class="btn ghost" id="fs-clear">רק ניקוי הרשימה</button>`);
  sheet.querySelector('#fs-go').onclick = async () => {
    for (const cb of sheet.querySelectorAll('input[type=checkbox]:checked')) {
      const it = done.find(d => d.id === cb.dataset.id);
      const qty = sheet.querySelector(`select[data-qty="${cb.dataset.id}"]`).value;
      await db.mutate('pantry_items', 'insert', { name: it.name, category: it.section || 'אחר', quantity_state: qty, added_by: db.myName() });
    }
    for (const d of done) await db.mutate('shopping_items', 'delete', {}, d.id);
    closeSheet(); toast('המזווה עודכן 🎉');
  };
  sheet.querySelector('#fs-clear').onclick = async () => {
    for (const d of done) await db.mutate('shopping_items', 'delete', {}, d.id);
    closeSheet(); toast('הרשימה נוקתה');
  };
}

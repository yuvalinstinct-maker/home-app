// בית: מה מבשלים הערב, לסיים קודם, פעולות מהירות, תצוגת שבוע.
import * as db from '../db.js?v=4';
import { esc, navigate, avatar, $ } from '../app.js?v=4';
import { calcRecipe } from '../nutrition.js?v=4';
import { pantryMatch, fmtKcalProtein, localDateKey } from '../match.js?v=5';

function daysAgo(d) { if (!d) return null; return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }

export function renderHome(el) {
  const recipes = db.getData('recipes');
  const pantry = db.getData('pantry_items');
  const ings = db.getData('recipe_ingredients');
  const ratings = db.getData('ratings');
  const plan = db.getData('meal_plan_entries');

  // suggestions: rank by match ratio, then shortest time
  const sugg = recipes.map(r => {
    const ri = ings.filter(i => i.recipe_id === r.id);
    const m = pantryMatch(ri, pantry);
    const calc = calcRecipe(ri, r.servings);
    return { r, m, calc };
  }).sort((a, b) => (b.m.ratio - a.m.ratio) || ((a.r.time_minutes || 99) - (b.r.time_minutes || 99))).slice(0, 3);

  const open = pantry.filter(p => p.is_open || p.quantity_state === 'low')
    .sort((a, b) => (a.opened_at || '').localeCompare(b.opened_at || ''));

  const today = new Date();
  const days = [...Array(4)].map((_, i) => {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const key = localDateKey(d);
    const e = plan.find(p => p.day === key && p.slot === 'dinner');
    const rec = e && e.recipe_id ? recipes.find(r => r.id === e.recipe_id) : null;
    return { d, key, label: e ? (rec ? rec.title : e.label) : null };
  });
  const dayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  el.innerHTML = `
    <div class="hero">
      <p class="hero-q">מה מבשלים הערב? 🍽️</p>
      ${sugg.length ? sugg.map(({ r, m, calc }) => `
        <div class="sugg" data-id="${r.id}" role="button">
          <div class="s-emoji">${r.emoji || '🍲'}</div>
          <div class="s-body">
            <div class="s-title">${esc(r.title)}</div>
            <div class="s-meta">⏱ ${r.time_minutes || '—'} דק׳ · ≈${calc.kcal_per_serving} קק״ל · ${calc.protein_per_serving}g חלבון למנה</div>
          </div>
          <span class="s-miss ${m.missing.length === 0 ? 'ok' : ''}">${m.missing.length === 0 ? 'יש הכל ✓' : `חסר ${m.missing.length}`}</span>
        </div>`).join('') : '<div class="muted" style="color:#fff">עוד אין מתכונים - הוסיפו את הראשון!</div>'}
    </div>

    <div class="quick-row">
      <button class="quick-btn" id="qa-pantry"><span>🥕</span>הוספת מוצר</button>
      <button class="quick-btn" id="qa-recipe"><span>📝</span>מתכון חדש</button>
      <button class="quick-btn" id="qa-shop"><span>🛒</span>לקניות</button>
    </div>

    ${open.length ? `
      <div class="section-title">לסיים קודם <span class="count">${open.length}</span></div>
      <div class="finish-row">
        ${open.map(p => {
          const ago = daysAgo(p.opened_at);
          return `<div class="finish-card" data-id="${p.id}">
            <div class="f-name">${esc(p.name)}</div>
            <div class="f-open">${p.quantity_state === 'low' ? '⚠️ נגמר בקרוב' : 'פתוח' + (ago != null ? ` כבר ${ago} ימים` : '')}</div>
            <div class="qty-dots">${['full','half','low'].map((s, i) => `<span class="qty-dot ${['full','half','low'].indexOf(p.quantity_state) >= i ? 'f' : ''}"></span>`).join('')}</div>
          </div>`;}).join('')}
      </div>` : ''}

    <div class="section-title">הימים הקרובים</div>
    <div class="week-strip">
      ${days.map((d, i) => `
        <div class="day-mini ${i === 0 ? 'today' : ''}">
          <div class="d-name">${i === 0 ? 'היום' : dayNames[d.d.getDay()]}</div>
          <div class="d-num">${d.d.getDate()}</div>
          <div class="d-meal ${d.label ? '' : 'empty-d'}">${d.label ? esc(d.label) : '—'}</div>
        </div>`).join('')}
    </div>`;

  el.querySelectorAll('.sugg').forEach(s => s.onclick = () => navigate('recipe-detail', s.dataset.id));
  el.querySelectorAll('.finish-card').forEach(c => c.onclick = () => navigate('pantry'));
  $('#qa-pantry').onclick = () => navigate('pantry', { add: true });
  $('#qa-recipe').onclick = () => navigate('recipes', { add: true });
  $('#qa-shop').onclick = () => navigate('shopping');
  const ws = el.querySelector('.week-strip'); if (ws) ws.onclick = () => navigate('week');
}

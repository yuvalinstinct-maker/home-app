// שבוע: 7 ימים, ארוחת ערב קודם, הוספת חסרים לקניות עם מסך סקירה.
import * as db from '../db.js?v=4';
import { esc, toast, openSheet, closeSheet, navigate, $ } from '../app.js?v=4';
import { calcRecipe } from '../nutrition.js?v=4';
import { pantryMatch, guessSection, localDateKey } from '../match.js?v=5';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function renderWeek(el) {
  const recipes = db.getData('recipes');
  const plan = db.getData('meal_plan_entries');
  const ings = db.getData('recipe_ingredients');
  const pantry = db.getData('pantry_items');
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const days = [...Array(7)].map((_, i) => {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const key = localDateKey(d);
    return { d, key, entries: plan.filter(p => p.day === key) };
  });

  el.innerHTML = `
    <div class="week-scroll">
      ${days.map(({ d, key, entries }, i) => `
        <div class="day-col ${i === 0 ? 'today' : ''}" data-day="${key}">
          <div class="dc-head">
            <div class="dc-name">${i === 0 ? 'היום' : i === 1 ? 'מחר' : DAY_NAMES[d.getDay()]}</div>
            <div class="dc-date">${d.getDate()}.${d.getMonth() + 1}</div>
          </div>
          ${['dinner'].map(slot => {
            const e = entries.find(x => x.slot === slot);
            if (!e) return `<button class="meal-slot" data-day="${key}" data-slot="${slot}"><span class="ms-slot">ערב</span><span style="font-size:20px">+</span></button>`;
            const rec = e.recipe_id ? recipes.find(r => r.id === e.recipe_id) : null;
            const calc = rec ? calcRecipe(ings.filter(x => x.recipe_id === rec.id), rec.servings) : null;
            return `<div class="meal-slot filled" data-entry="${e.id}">
              <span class="ms-slot">ערב</span>
              <span class="ms-title">${esc(rec ? rec.title : (e.label || ''))}</span>
              ${calc ? `<span class="ms-meta">≈${calc.kcal_per_serving} קק״ל · ${calc.protein_per_serving}g חלבון</span>` : ''}
              <button class="btn ghost small ms-del" data-entry="${e.id}" style="font-size:11px;padding:0;color:var(--red)">הסרה</button>
            </div>`;
          }).join('')}
        </div>`).join('')}
    </div>
    <button class="btn" id="wk-missing" style="margin-top:16px">🛒 הוסף חסרים לקניות</button>
    <p class="muted" style="text-align:center">מחשב מה חסר במזווה לכל הארוחות המתוכננות השבוע</p>`;

  el.querySelectorAll('.meal-slot:not(.filled)').forEach(slot => slot.onclick = () => pickMeal(slot.dataset.day, slot.dataset.slot));
  el.querySelectorAll('.meal-slot.filled .ms-title').forEach(t => t.onclick = () => {
    const e = plan.find(p => p.id === t.closest('.meal-slot').dataset.entry);
    if (e?.recipe_id) navigate('recipe-detail', e.recipe_id);
  });
  el.querySelectorAll('.ms-del').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    await db.mutate('meal_plan_entries', 'delete', {}, b.dataset.entry);
    toast('הוסר מהתכנון');
  });
  $('#wk-missing').onclick = () => reviewMissing(days, recipes, ings, pantry);
}

function pickMeal(day, slot) {
  const recipes = db.getData('recipes');
  const sheet = openSheet(`
    <h3>מה בא לכם?</h3>
    ${recipes.map(r => `<button class="btn secondary" style="margin-bottom:8px" data-r="${r.id}">${esc(r.title)}</button>`).join('')}
    <div class="row" style="gap:8px;margin-top:6px">
      <button class="btn ghost" data-label="שאריות" style="flex:1">🍱 שאריות</button>
      <button class="btn ghost" data-label="בחוץ" style="flex:1">🥡 בחוץ</button>
    </div>`);
  sheet.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => {
    await db.mutate('meal_plan_entries', 'insert', { day, slot, recipe_id: b.dataset.r, created_by: db.myName() });
    closeSheet(); toast('נוסף 📅');
  });
  sheet.querySelectorAll('[data-label]').forEach(b => b.onclick = async () => {
    await db.mutate('meal_plan_entries', 'insert', { day, slot, label: b.dataset.label, created_by: db.myName() });
    closeSheet(); toast('נוסף 📅');
  });
}

function reviewMissing(days, recipes, ings, pantry) {
  const ids = new Set();
  for (const { entries } of days) for (const e of entries) if (e.recipe_id) ids.add(e.recipe_id);
  if (!ids.size) { toast('אין ארוחות מתוכננות השבוע'); return; }
  const missing = [];
  for (const rid of ids) {
    const rec = recipes.find(r => r.id === rid);
    const m = pantryMatch(ings.filter(i => i.recipe_id === rid), pantry);
    for (const ing of m.missing) missing.push({ ...ing, recipeTitle: rec?.title });
  }
  if (!missing.length) { toast('הכל במזווה! 🎉'); return; }
  const sheet = openSheet(`
    <h3>חסרים לשבוע (${missing.length})</h3>
    <p class="muted">סמנו מה להוסיף לקניות</p>
    <div style="max-height:50vh;overflow-y:auto">
    ${missing.map((m, i) => `<label class="review-ing">
      <input type="checkbox" checked data-i="${i}">
      <span style="flex:1">${esc(m.name)} <span class="muted">${m.amount ?? ''} ${m.unit || ''}</span></span>
      <span class="muted" style="font-size:11px">${esc(m.recipeTitle || '')}</span>
    </label>`).join('')}
    </div>
    <button class="btn" id="rv-add">הוספה לקניות</button>`);
  sheet.querySelector('#rv-add').onclick = async () => {
    let n = 0;
    for (const cb of sheet.querySelectorAll('input[type=checkbox]:checked')) {
      const m = missing[Number(cb.dataset.i)];
      await db.mutate('shopping_items', 'insert', { name: m.name, qty: m.amount, unit: m.unit, section: guessSection(m.name), added_by: db.myName(), recipe_id: m.recipe_id });
      n++;
    }
    closeSheet(); toast(`${n} פריטים נוספו לקניות 🛒`);
  };
}

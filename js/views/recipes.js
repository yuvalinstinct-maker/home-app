// מתכונים: כרטיסים, דירוג זוגי, פירוט קלוריות, מצב בישול, package-fit.
import * as db from '../db.js?v=4';
import { esc, toast, openSheet, closeSheet, navigate, avatar, avColor, $ } from '../app.js?v=4';
import { calcRecipe, calcIngredient, packageFit, catalog } from '../nutrition.js?v=4';
import { pantryMatch } from '../match.js?v=4';

const RECIPE_EMOJI = ['🍲', '🍝', '🍳', '🥗', '🍦', '🍗', '🥘', '🫕', '🍜', '🥪'];

function ratingFor(ratings, recipeId, who) { return ratings.find(r => r.recipe_id === recipeId && r.who === who); }
function starsHtml(n) { return [1,2,3,4,5].map(i => `<span style="color:${i <= (n || 0) ? '#f2a83b' : 'var(--line)'}">★</span>`).join(''); }

export function renderRecipes(el, opts = {}) {
  const recipes = db.getData('recipes');
  const ings = db.getData('recipe_ingredients');
  const pantry = db.getData('pantry_items');
  const ratings = db.getData('ratings');

  el.innerHTML = `
    <div class="section-title">${recipes.length} מתכונים <button class="btn small secondary" id="r-add" style="margin-right:auto">+ מתכון חדש</button></div>
    ${recipes.length ? `<div class="recipe-grid">
      ${recipes.map((r, i) => {
        const ri = ings.filter(x => x.recipe_id === r.id);
        const m = pantryMatch(ri, pantry);
        const calc = calcRecipe(ri, r.servings);
        const ry = ratingFor(ratings, r.id, 'יובל'), rn = ratingFor(ratings, r.id, 'רון');
        const hue = (r.title.charCodeAt(0) * 7) % 360;
        return `<div class="r-card" data-id="${r.id}">
          <div class="r-photo" style="background:linear-gradient(135deg,hsl(${hue},45%,88%),hsl(${(hue+40)%360},50%,80%))">
            ${RECIPE_EMOJI[i % RECIPE_EMOJI.length]}
            <span class="badge ${m.missing.length ? 'miss' : 'have'}">${m.missing.length ? `חסר ${m.missing.length}` : 'יש הכל ✓'}</span>
          </div>
          <div class="r-body">
            <div class="r-title">${esc(r.title)}</div>
            <div class="r-meta"><span>⏱ ${r.time_minutes || '—'} דק׳</span><span>≈${calc.kcal_per_serving} קק״ל</span><span>${calc.protein_per_serving}g חלבון</span></div>
            <div class="r-ratings">
              <span class="yr">יובל ${starsHtml(ry?.stars)}</span>
              <span class="rn">רון ${starsHtml(rn?.stars)}</span>
            </div>
          </div>
        </div>`;}).join('')}
    </div>` : '<div class="empty"><div class="big">📝</div>עוד אין מתכונים.<br>הוסיפו את הראשון!</div>'}`;

  el.querySelectorAll('.r-card').forEach(c => c.onclick = () => navigate('recipe-detail', c.dataset.id));
  $('#r-add').onclick = () => recipeForm();
  if (opts.add) recipeForm();
}

/* ---------- detail ---------- */
export function renderRecipeDetail(el, id) {
  const r = db.getData('recipes').find(x => x.id === id);
  if (!r) { el.innerHTML = '<div class="empty">המתכון לא נמצא</div>'; return; }
  const pantry = db.getData('pantry_items');
  let servings = Number(localStorage.getItem('serv_' + id)) || r.servings || 2;
  const ratings = db.getData('ratings');
  const hue = (r.title.charCodeAt(0) * 7) % 360;

  function draw() {
    const base = db.getData('recipe_ingredients').filter(x => x.recipe_id === id);
    const scale = servings / (r.servings || 1);
    const scaled = base.map(i => ({ ...i, amount: i.amount != null ? Math.round(i.amount * scale * 10) / 10 : null }));
    const m = pantryMatch(scaled, pantry);
    const calc = calcRecipe(scaled, servings);

    // package-fit suggestions
    const fits = [];
    for (const ing of scaled) {
      const match = pantry.find(p => p.package_size && p.name && ing.name &&
        (p.name.includes(ing.name) || ing.name.includes(p.name.split(' ').slice(0, 2).join(' '))));
      if (!match) continue;
      const pkgG = parseFloat(match.package_size);
      if (isNaN(pkgG)) continue;
      const ci = calcIngredient(ing);
      if (!ci.matched) continue;
      const fit = packageFit(ci.grams, pkgG);
      if (fit) fits.push(`📦 ${esc(ing.name)}: במקום ${Math.round(ci.grams)} גרם/מ״ל - אפשר ${fit} ולסיים את האריזה (${esc(match.package_size)})`);
    }

    el.innerHTML = `
      <button class="btn ghost" id="rd-back" style="width:auto;padding:0 0 10px">→ חזרה למתכונים</button>
      <div class="detail-photo" style="background:linear-gradient(135deg,hsl(${hue},45%,88%),hsl(${(hue+40)%360},50%,80%))">${RECIPE_EMOJI[0]}</div>
      <h2 style="margin:0 0 4px;font-size:22px">${esc(r.title)}</h2>
      <div class="muted" style="margin-bottom:14px">⏱ ${r.time_minutes || '—'} דקות · ${r.notes ? esc(r.notes) : ''}</div>

      <div class="servings-row">
        <span style="font-weight:700">מנות</span>
        <div class="stepper">
          <button id="sv-minus">−</button><span class="val">${servings}</span><button id="sv-plus">+</button>
        </div>
      </div>

      <div class="macro-row">
        <div class="macro"><div class="m-val">≈${calc.kcal_per_serving}</div><div class="m-lbl">קק״ל למנה</div></div>
        <div class="macro"><div class="m-val">${calc.protein_per_serving}<small>g</small></div><div class="m-lbl">חלבון למנה</div></div>
        <div class="macro"><div class="m-val">${calc.protein_per_100kcal}<small>g</small></div><div class="m-lbl">חלבון ל-100 קק״ל</div></div>
      </div>
      <button class="btn ghost small" id="calc-details" style="width:auto">≈ פירוט החישוב</button>

      ${fits.length ? `<div class="pkg-fit" style="margin-top:12px">${fits.join('<br>')}</div>` : ''}

      <div class="section-title">מרכיבים <span class="count">${m.have.length}/${scaled.length} במזווה</span>
        ${m.missing.length ? `<button class="btn small orange" id="add-missing" style="margin-right:auto">הוסף ${m.missing.length} חסרים לקניות</button>` : ''}</div>
      <div class="card" style="padding:6px 16px">
        ${scaled.map((ing, i) => {
          const has = m.have.includes(ing);
          return `<div class="ing-row">
            <span class="ing-check ${has ? 'have' : 'miss'}">${has ? '✓' : '!'}</span>
            <span class="ing-name">${esc(ing.name)}${ing.matched === false ? ' <span class="badge miss" title="אין נתון תזונה">?</span>' : ''}</span>
            <span class="ing-amt">${ing.amount != null ? ing.amount + ' ' + (ing.unit || 'יח׳') : ''}</span>
          </div>`;}).join('')}
      </div>

      <div class="section-title">הוראות הכנה <button class="btn small secondary" id="cook-mode" style="margin-right:auto">🍳 מצב בישול</button></div>
      <div class="card" id="steps-card" style="padding:6px 16px">
        ${(r.steps || []).map((s, i) => `<div class="step-row" data-i="${i}"><span class="step-num">${i + 1}</span><span class="step-txt">${esc(s)}</span></div>`).join('') || '<div class="muted">אין שלבים עדיין</div>'}
      </div>

      <div class="section-title">איך יצא?</div>
      ${['יובל', 'רון'].map(who => rateBox(who, ratingFor(ratings, id, who))).join('')}

      <div class="row" style="gap:10px;margin:14px 0 24px">
        <button class="btn secondary" id="rd-edit" style="flex:1">✏️ עריכה</button>
        <button class="btn" id="rd-plan" style="flex:1">📅 תכנון לשבוע</button>
      </div>`;

    $('#rd-back').onclick = () => navigate('recipes');
    $('#sv-minus').onclick = () => { if (servings > 1) { servings--; localStorage.setItem('serv_' + id, servings); draw(); } };
    $('#sv-plus').onclick = () => { servings++; localStorage.setItem('serv_' + id, servings); draw(); };
    el.querySelectorAll('.step-row').forEach(sr => sr.onclick = () => sr.classList.toggle('done'));
    const am = $('#add-missing');
    if (am) am.onclick = async () => {
      for (const ing of m.missing) {
        await db.mutate('shopping_items', 'insert', {
          name: ing.name, qty: ing.amount, unit: ing.unit,
          section: 'אחר', added_by: db.myName(), recipe_id: id });
      }
      toast(`${m.missing.length} חסרים נוספו לקניות 🛒`);
    };
    $('#calc-details').onclick = () => calcSheet(calc, scaled);
    $('#cook-mode').onclick = cookMode;
    $('#rd-edit').onclick = () => recipeForm(r);
    $('#rd-plan').onclick = () => {
      const sheet = openSheet(`<h3>לאיזה יום?</h3>` + [0,1,2,3,4,5,6].map(i => {
        const d = new Date(); d.setDate(d.getDate() + i);
        const names = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
        return `<button class="btn secondary" style="margin-bottom:8px" data-d="${d.toISOString().slice(0,10)}">${i === 0 ? 'היום' : i === 1 ? 'מחר' : 'יום ' + names[d.getDay()]} (${d.getDate()}.${d.getMonth()+1})</button>`;
      }).join(''));
      sheet.querySelectorAll('button[data-d]').forEach(b => b.onclick = async () => {
        await db.mutate('meal_plan_entries', 'insert', { day: b.dataset.d, slot: 'dinner', recipe_id: id, created_by: db.myName() });
        closeSheet(); toast('נוסף לתכנון 📅');
      });
    };
    bindRatings(el, id);
  }

  function cookMode() {
    const card = $('#steps-card');
    card.classList.add('cook-mode');
    if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
    toast('מצב בישול - המסך לא יכבה 🍳');
  }

  function rateBox(who, rating) {
    const mine = db.myName() === who;
    return `<div class="rate-box" data-who="${who}">
      <div class="rate-head">${avatar(who)}<b>${who}</b>
        <span class="stars" data-who="${who}">${[1,2,3,4,5].map(i => `<button data-s="${i}" class="${rating && i <= rating.stars ? 'on' : ''}">★</button>`).join('')}</span>
      </div>
      <div class="row" style="gap:14px;font-size:14px">
        <label class="row" style="gap:6px"><input type="checkbox" class="rt-again" ${rating?.again ? 'checked' : ''}> שווה שוב?</label>
      </div>
      <input class="rt-note" placeholder="לפעם הבאה: מה לשנות?" value="${esc(rating?.next_time || '')}"
        style="width:100%;margin-top:8px;padding:9px 12px;border:1.5px solid var(--line);border-radius:10px">
      ${mine ? '<div class="muted" style="font-size:11px;margin-top:4px">הדירוג שלך - נשמר אוטומטית</div>' : ''}
    </div>`;
  }

  function bindRatings(el2, recipeId) {
    el2.querySelectorAll('.rate-box').forEach(box => {
      const who = box.dataset.who;
      const save = async (patch) => {
        const existing = ratingFor(db.getData('ratings'), recipeId, who);
        const row = { recipe_id: recipeId, who, stars: existing?.stars || null, again: existing?.again || false, next_time: existing?.next_time || null, ...patch, updated_at: new Date().toISOString() };
        if (existing) await db.mutate('ratings', 'update', row, existing.id);
        else { row.id = crypto.randomUUID(); await db.mutate('ratings', 'insert', row); }
      };
      box.querySelectorAll('.stars button').forEach(b => b.onclick = async () => { await save({ stars: Number(b.dataset.s) }); toast('נשמר ⭐'); });
      box.querySelector('.rt-again').onchange = async e => { await save({ again: e.target.checked }); };
      box.querySelector('.rt-note').onchange = async e => { await save({ next_time: e.target.value.trim() || null }); toast('נשמר'); };
    });
  }

  function calcSheet(calc, scaled) {
    const sheet = openSheet(`
      <h3>≈ פירוט החישוב</h3>
      <p class="muted">הערכה גסה לפי ערכים תזונתיים מקובלים ל-100 גרם/מ״ל. תיקונים נשמרים לבית שלכם.</p>
      ${calc.details.map(d => `<div class="calc-row">
        <span>${esc(d.name)} <span class="muted">${d.amount ?? ''} ${d.unit || ''}</span></span>
        ${d.matched ? `<span>≈${Math.round(d.kcal)} קק״ל · ${Math.round(d.protein * 10) / 10}g</span>` : '<span class="unmatched">לא זוהה</span>'}
      </div>`).join('')}
      <div class="calc-row" style="font-weight:800;border-top:2px solid var(--line)"><span>סה״כ (${servings} מנות)</span><span>≈${calc.total_kcal} קק״ל · ${calc.total_protein}g</span></div>
      ${calc.unmatched.length ? `<p class="muted">לא זוהו: ${calc.unmatched.map(esc).join(', ')} - אפשר לערוך את המרכיב ולבחור שם מוכר.</p>` : ''}
      <button class="btn secondary" id="cs-close">סגירה</button>`);
    sheet.querySelector('#cs-close').onclick = closeSheet;
  }

  draw();
}

/* ---------- recipe form (new / edit) ---------- */
function recipeForm(existing) {
  const isEdit = !!existing;
  const ings = isEdit ? db.getData('recipe_ingredients').filter(i => i.recipe_id === existing.id).sort((a, b) => a.position - b.position) : [];
  const names = Object.values(catalog()).map(i => i.name_he);
  const UNITS = ['גרם', 'מ"ל', 'כף', 'כפית', 'כוס', 'יחידה', 'ק"ג', 'ליטר'];

  const sheet = openSheet(`
    <h3>${isEdit ? 'עריכת מתכון' : 'מתכון חדש'}</h3>
    <div class="field"><label>שם</label><input id="rf-title" value="${esc(existing?.title || '')}" placeholder="למשל: גלידת חלבון וניל"></div>
    <div class="form-grid">
      <div class="field"><label>זמן (דקות)</label><input id="rf-time" type="number" inputmode="numeric" value="${existing?.time_minutes || ''}"></div>
      <div class="field"><label>מנות</label><input id="rf-serv" type="number" inputmode="numeric" value="${existing?.servings || 2}"></div>
    </div>
    <div class="field"><label>מרכיבים</label><div id="rf-ings"></div>
      <button class="btn small secondary" id="rf-add-ing" style="margin-top:8px">+ מרכיב</button></div>
    <div class="field"><label>שלבים (שורה לכל שלב)</label><textarea id="rf-steps" rows="4">${esc((existing?.steps || []).join('\n'))}</textarea></div>
    <div class="field"><label>הערות</label><input id="rf-notes" value="${esc(existing?.notes || '')}"></div>
    <button class="btn" id="rf-save">${isEdit ? 'שמירה' : 'הוספת מתכון'}</button>
    <datalist id="rf-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>`);

  const ingsBox = sheet.querySelector('#rf-ings');
  function ingRow(ing = {}) {
    const row = document.createElement('div');
    row.className = 'row'; row.style.cssText = 'gap:6px;margin-bottom:6px';
    row.innerHTML = `
      <input class="ri-name" list="rf-names" placeholder="מרכיב" value="${esc(ing.name || '')}" style="flex:2;padding:9px 10px;border:1.5px solid var(--line);border-radius:10px">
      <input class="ri-amt" type="number" inputmode="decimal" placeholder="כמות" value="${ing.amount ?? ''}" style="flex:1;padding:9px 10px;border:1.5px solid var(--line);border-radius:10px">
      <select class="ri-unit" style="flex:1;padding:9px 6px;border:1.5px solid var(--line);border-radius:10px">
        ${UNITS.map(u => `<option ${ing.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select>
      <button class="ri-del" style="color:var(--red);font-size:18px;padding:4px">×</button>`;
    row.querySelector('.ri-del').onclick = () => row.remove();
    ingsBox.appendChild(row);
  }
  if (ings.length) ings.forEach(ingRow); else ingRow();
  sheet.querySelector('#rf-add-ing').onclick = () => ingRow();

  sheet.querySelector('#rf-save').onclick = async () => {
    const title = sheet.querySelector('#rf-title').value.trim();
    if (!title) { toast('חסר שם למתכון'); return; }
    const ingRows = [...ingsBox.querySelectorAll('.row')].map((row, i) => ({
      name: row.querySelector('.ri-name').value.trim(),
      amount: parseFloat(row.querySelector('.ri-amt').value) || null,
      unit: row.querySelector('.ri-unit').value,
      position: i,
    })).filter(x => x.name);
    const steps = sheet.querySelector('#rf-steps').value.split('\n').map(s => s.trim()).filter(Boolean);
    const recRow = {
      title, time_minutes: parseInt(sheet.querySelector('#rf-time').value) || null,
      servings: parseFloat(sheet.querySelector('#rf-serv').value) || 2,
      steps, notes: sheet.querySelector('#rf-notes').value.trim() || null,
    };
    if (isEdit) {
      await db.mutate('recipes', 'update', recRow, existing.id);
      // replace ingredients: delete old, insert new
      for (const old of db.getData('recipe_ingredients').filter(i => i.recipe_id === existing.id)) {
        await db.mutate('recipe_ingredients', 'delete', {}, old.id);
      }
      for (const ing of ingRows) {
        const c = calcIngredient(ing);
        await db.mutate('recipe_ingredients', 'insert', { ...ing, recipe_id: existing.id,
          grams: c.grams || null, nutrition_key: c.key || null, kcal: c.kcal || null, protein: c.protein || null, matched: !!c.matched });
      }
      closeSheet(); toast('נשמר ✓'); navigate('recipe-detail', existing.id);
    } else {
      const recId = await db.mutate('recipes', 'insert', { ...recRow, created_by: db.myName() });
      for (const ing of ingRows) {
        const c = calcIngredient(ing);
        await db.mutate('recipe_ingredients', 'insert', { ...ing, recipe_id: recId,
          grams: c.grams || null, nutrition_key: c.key || null, kcal: c.kcal || null, protein: c.protein || null, matched: !!c.matched });
      }
      closeSheet(); toast('המתכון נוסף 🎉'); navigate('recipe-detail', recId);
    }
  };
}

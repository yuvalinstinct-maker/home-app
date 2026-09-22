// Home-app smoke suite: auth/RLS, cross-device round-trip, realtime checkoff,
// calorie-calc correctness, offline outbox replay.
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';

const SB_URL = 'https://tvoipuianfvonbjtcndp.supabase.co';
const KEY = 'sb_publishable_g6-a_G_E-5iXOrMr4DVwsg_g0gM5vi8';
const USERS = [
  { email: 'test1@homeapp.dev', password: 'TestHomeApp2026!', name: 'יובל' },
  { email: 'test2@homeapp.dev', password: 'TestHomeApp2026!', name: 'רון' },
];
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('✅', name); }
  catch (e) { results.push(['FAIL', name + ' :: ' + (e.message || e)]); console.log('❌', name, '-', (e.stack||e).toString().split('\n').slice(0,4).join(' | ')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function signIn(u) {
  const c = createClient(SB_URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  assert.ifError(error);
  return c;
}

const A = await signIn(USERS[0]);
const B = await signIn(USERS[1]);
const ANON = createClient(SB_URL, KEY, { auth: { persistSession: false } });
let cleanup = { pantry: [], shopping: [] };

await test('RLS: anonymous cannot read pantry_items', async () => {
  const { data, error } = await ANON.from('pantry_items').select('*');
  assert.ifError(error);
  assert.equal(data.length, 0, 'anon saw rows');
});

await test('RLS: anonymous cannot read recipes', async () => {
  const { data } = await ANON.from('recipes').select('*');
  assert.equal(data.length, 0);
});

await test('Seed data visible to member: 3 recipes, >=11 pantry items, 58 nutrition rows', async () => {
  const { data: r } = await A.from('recipes').select('*');
  const { data: p } = await A.from('pantry_items').select('*');
  const { data: n } = await A.from('ingredient_nutrition').select('key');
  assert.equal(r.length, 3, 'recipes=' + r.length);
  assert.ok(p.length >= 11, 'pantry=' + p.length);
  assert.ok(n.length >= 58, 'nutrition=' + n.length);
});

await test('Round-trip: pantry item added by A is visible to B with added_by=יובל', async () => {
  const name = 'טסט מלפפון חמוץ ' + Date.now();
  const { error } = await A.from('pantry_items').insert({
    household_id: '11111111-1111-1111-1111-111111111111', name, added_by: 'יובל', category: 'מזווה ושימורים' });
  assert.ifError(error);
  let found = null;
  for (let i = 0; i < 10 && !found; i++) {
    const { data } = await B.from('pantry_items').select('*').eq('name', name);
    found = data && data[0];
    if (!found) await sleep(500);
  }
  assert.ok(found, 'B did not see the item');
  assert.equal(found.added_by, 'יובל');
  cleanup.pantry.push(found.id);
});

await test('Realtime: shopping checkoff by A reaches B via subscription', async () => {
  const itemName = 'טסט קניות ' + Date.now();
  const { data: ins, error } = await A.from('shopping_items').insert({
    household_id: '11111111-1111-1111-1111-111111111111', name: itemName, added_by: 'רון' }).select().single();
  assert.ifError(error);
  cleanup.shopping.push(ins.id);
  const got = await new Promise(async (resolve) => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    B.channel('test-shop')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shopping_items' },
        payload => { if (payload.new.id === ins.id && payload.new.checked === true) finish(true); })
      .subscribe(async st => {
        if (st === 'SUBSCRIBED') {
          await sleep(1000);
          await A.from('shopping_items').update({ checked: true, checked_at: new Date().toISOString() }).eq('id', ins.id);
        }
      });
    setTimeout(() => finish(false), 15000);
  });
  assert.ok(got, 'no realtime update within 10s');
  const { data } = await B.from('shopping_items').select('checked').eq('id', ins.id).single();
  assert.equal(data.checked, true);
});

// --- calorie calc correctness (browser engine, fed from bundled catalog) ---
await test('Calorie calc matches Python reference on 3 seeded recipes', async () => {
  const { calcRecipe } = await import('../js/nutrition.js');
  const expected = {
    'גלידת חלבון שוקולד (נינג\'ה קרימי)': { kcal: 181, protein: 21.0, total: 361 },
    'גלידת חלבון קרמל מלוח (ללא קוטג\')': { kcal: 240, protein: 16.9, total: 481 },
    'נודלס ווק עם פרגיות': { kcal: 449, protein: 31.6, total: 1795 },
  };
  const { data: recipes } = await A.from('recipes').select('*');
  const { data: ings } = await A.from('recipe_ingredients').select('*');
  for (const r of recipes) {
    const exp = expected[r.title];
    assert.ok(exp, 'unexpected recipe ' + r.title);
    const ri = ings.filter(i => i.recipe_id === r.id);
    const calc = calcRecipe(ri, r.servings);
    // rounding differs between engines (JS half-up vs Python banker's); tolerance 1 kcal / 0.15 g
    assert.ok(Math.abs(calc.kcal_per_serving - exp.kcal) <= 1, `${r.title} kcal/serving ${calc.kcal_per_serving} != ${exp.kcal}`);
    assert.ok(Math.abs(calc.protein_per_serving - exp.protein) <= 0.15, `${r.title} protein/serving ${calc.protein_per_serving} != ${exp.protein}`);
    assert.ok(Math.abs(calc.total_kcal - exp.total) <= 1, `${r.title} total kcal ${calc.total_kcal} != ${exp.total}`);
    assert.equal(calc.unmatched.length, 0, `${r.title} unmatched: ${calc.unmatched}`);
  }
});

// --- offline outbox replay, using the app's real db.js with shims ---
await test('Offline queue: writes while offline replay in order on reconnect', async () => {
  // shim browser globals, then import the app's db.js with npm supabase-js
  const { indexedDB } = await import('fake-indexeddb');
  globalThis.indexedDB = indexedDB;
  globalThis.window = { addEventListener() {}, __joinCode: '' }; globalThis.document = { querySelector() { return null; }, querySelectorAll() { return []; } };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  const fs = await import('node:fs');
  let src = fs.readFileSync(new URL('../js/db.js', import.meta.url), 'utf8');
  src = src.replace("from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'", "from '@supabase/supabase-js'");
  src = src.replace(/import { SUPABASE_URL, SUPABASE_KEY } from '\.\/config\.js[^']*';/,
    "const SUPABASE_URL = '" + SB_URL + "'; const SUPABASE_KEY = '" + KEY + "';");
  fs.writeFileSync(new URL('./.db-shim.mjs', import.meta.url), src);
  const db = await import('./.db-shim.mjs');

  // sign in through the app's client
  const { error } = await db.sb.auth.signInWithPassword({ email: USERS[0].email, password: USERS[0].password });
  assert.ifError(error);
  await db.claimProfileTestHook?.(); // no-op if absent
  // set profile manually (profiles row already exists from setup)
  db.getState().profile = { user_id: db.sb.auth ? (await db.sb.auth.getUser()).data.user.id : null,
    household_id: '11111111-1111-1111-1111-111111111111', display_name: 'יובל' };

  // go "offline": break global fetch
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new TypeError('fetch failed (offline)'));
  const n1 = 'טסט-אופליין-א ' + Date.now();
  const n2 = 'טסט-אופליין-ב ' + Date.now();
  await db.mutate('pantry_items', 'insert', { name: n1, added_by: 'יובל', category: 'אחר' });
  await db.mutate('pantry_items', 'insert', { name: n2, added_by: 'יובל', category: 'אחר' });
  assert.equal(db.getState().outboxCount >= 2, true, 'outbox should hold 2 ops, has ' + db.getState().outboxCount);

  // back online: restore fetch, flush
  globalThis.fetch = realFetch;
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  await db.flushOutbox();
  assert.equal(db.getState().outboxCount, 0, 'outbox not empty after flush: ' + db.getState().outboxCount);
  const { data } = await B.from('pantry_items').select('name').in('name', [n1, n2]);
  assert.equal(data.length, 2, 'replayed rows missing: ' + JSON.stringify(data));
  // order check: created_at of n1 <= n2
  const { data: order } = await B.from('pantry_items').select('name, created_at').in('name', [n1, n2]).order('created_at');
  assert.equal(order[0].name, n1, 'replay order wrong');
});

await test('Cleanup test rows', async () => {
  const { data: rows } = await A.from('pantry_items').select('id,name').like('name', 'טסט%');
  for (const r of rows || []) await A.from('pantry_items').delete().eq('id', r.id);
  const { data: shops } = await A.from('shopping_items').select('id,name').like('name', 'טסט%');
  for (const s of shops || []) await A.from('shopping_items').delete().eq('id', s.id);
  // meal_plan + ratings leftovers
  await A.from('meal_plan_entries').delete().like('note', 'טסט%');
});

await test('Local calendar dates do not shift to UTC', async () => {
  const { localDateKey } = await import('../js/match.js');
  const original = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  assert.equal(localDateKey(new Date(2026, 8, 22, 23, 30)), '2026-09-22');
  process.env.TZ = original;
});

const fails = results.filter(r => r[0] === 'FAIL');
console.log(`\n=== ${results.length - fails.length}/${results.length} passed ===`);
process.exit(fails.length ? 1 : 0);

// Data layer: Supabase + IndexedDB cache + offline outbox + realtime.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export const TABLES = ['pantry_items','recipes','recipe_ingredients','ratings','meal_plan_entries','shopping_items','ingredient_nutrition'];

const state = {
  user: null, profile: null, members: [],
  data: { pantry_items: [], recipes: [], recipe_ingredients: [], ratings: [], meal_plan_entries: [], shopping_items: [], ingredient_nutrition: [] },
  listeners: new Set(),
  sync: 'ok', // ok | pending | offline
  outboxCount: 0,
};

/* ---------- IndexedDB ---------- */
let idb;
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('homeapp', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('cache');
      r.result.createObjectStore('outbox', { keyPath: 'qid', autoIncrement: true });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(store, key) {
  const db = await idbOpen();
  return new Promise(res => { const q = db.transaction(store).objectStore(store).get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
}
async function idbSet(store, key, val) {
  const db = await idbOpen();
  return new Promise(res => {
    const os = db.transaction(store, 'readwrite').objectStore(store);
    const q = key == null ? os.put(val) : os.put(val, key);
    q.onsuccess = () => res(); q.onerror = () => res();
  });
}
async function idbAll(store) {
  const db = await idbOpen();
  return new Promise(res => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
}
async function idbClear(store) {
  const db = await idbOpen();
  return new Promise(res => { const q = db.transaction(store, 'readwrite').objectStore(store).clear(); q.onsuccess = () => res(); q.onerror = () => res(); });
}

/* ---------- pub/sub ---------- */
export function subscribe(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }
function emit() { state.listeners.forEach(fn => fn()); updateSyncBadge(); }
function updateSyncBadge() {
  const d = document.querySelector('.sync-dot'); if (!d) return;
  d.className = 'sync-dot' + (state.sync === 'pending' || state.outboxCount > 0 ? ' pending' : state.sync === 'offline' ? ' offline' : '');
  d.title = state.sync === 'offline' ? 'לא מחובר' : state.outboxCount > 0 ? `${state.outboxCount} שינויים ממתינים` : 'מסונכרן';
}

/* ---------- auth ---------- */
export async function getSession() {
  const { data } = await sb.auth.getSession();
  state.user = data.session?.user || null;
  return state.user;
}
export async function sendOtp(email) {
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}
export async function verifyOtp(email, token) {
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  state.user = data.user;
  return data.user;
}
export async function signOut() { await sb.auth.signOut(); state.user = null; state.profile = null; }

export async function loadProfile() {
  if (!state.user) return null;
  const { data } = await sb.from('profiles').select('*').eq('user_id', state.user.id).maybeSingle();
  state.profile = data || null;
  return state.profile;
}
export async function claimProfile(displayName, joinCode) {
  const { data: hid, error } = await sb.rpc('household_by_code', { code: joinCode });
  if (error || !hid) throw new Error('קוד שגוי');
  const { error: e2 } = await sb.from('profiles').insert({ user_id: state.user.id, household_id: hid, display_name: displayName });
  if (e2) throw e2;
  return loadProfile();
}
export async function loadMembers() {
  const { data } = await sb.from('profiles').select('*');
  state.members = data || [];
  return state.members;
}

/* ---------- data loading ---------- */
export function getData(t) { return state.data[t] || []; }
export function getProfile() { return state.profile; }
export function getMembers() { return state.members; }
export function myName() { return state.profile?.display_name || ''; }
export function householdId() { return state.profile?.household_id; }

async function cacheTable(t) { await idbSet('cache', t, state.data[t]); }

export async function loadFromCache() {
  for (const t of TABLES) {
    const c = await idbGet('cache', t);
    if (c) state.data[t] = c;
  }
  emit();
}

export async function refreshAll() {
  if (!householdId()) return;
  try {
    const hid = householdId();
    const [pantry, recipes, rIngs, ratings, plan, shop, nut] = await Promise.all([
      sb.from('pantry_items').select('*').is('deleted_at', null).order('created_at'),
      sb.from('recipes').select('*').is('deleted_at', null).order('created_at'),
      sb.from('recipe_ingredients').select('*').order('position'),
      sb.from('ratings').select('*'),
      sb.from('meal_plan_entries').select('*'),
      sb.from('shopping_items').select('*').order('created_at'),
      sb.from('ingredient_nutrition').select('*'),
    ]);
    for (const r of [pantry, recipes, rIngs, ratings, plan, shop, nut]) if (r.error) throw r.error;
    state.data.pantry_items = pantry.data; state.data.recipes = recipes.data;
    state.data.recipe_ingredients = rIngs.data; state.data.ratings = ratings.data;
    state.data.meal_plan_entries = plan.data; state.data.shopping_items = shop.data;
    state.data.ingredient_nutrition = nut.data;
    for (const t of TABLES) await cacheTable(t);
    state.sync = 'ok';
    emit();
  } catch (e) {
    state.sync = navigator.onLine ? 'pending' : 'offline';
    emit();
  }
}
export async function refreshTable(t) {
  try {
    let q = sb.from(t).select('*');
    if (t === 'pantry_items' || t === 'recipes') q = q.is('deleted_at', null);
    const { data, error } = await q;
    if (error) throw error;
    state.data[t] = data; await cacheTable(t); emit();
  } catch (e) { state.sync = navigator.onLine ? 'pending' : 'offline'; emit(); }
}

/* ---------- realtime ---------- */
let channel = null;
export function startRealtime() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('home-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items' }, () => refreshTable('pantry_items'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, () => refreshTable('recipes'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_ingredients' }, () => refreshTable('recipe_ingredients'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings' }, () => refreshTable('ratings'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan_entries' }, () => refreshTable('meal_plan_entries'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, () => refreshTable('shopping_items'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredient_nutrition' }, () => refreshTable('ingredient_nutrition'))
    .subscribe();
}

/* ---------- mutations with outbox ---------- */
function uuid() { return crypto.randomUUID(); }
async function queueOp(op) {
  await idbSet('outbox', null, op);
  state.outboxCount++;
  emit();
}
export async function flushOutbox() {
  const ops = await idbAll('outbox');
  if (!ops.length) { state.outboxCount = 0; emit(); return; }
  let done = 0;
  for (const op of ops) {
    try { await runOp(op); done++; }
    catch (e) { break; } // keep order; retry later
  }
  if (done) {
    const remaining = ops.slice(done);
    await idbClear('outbox');
    for (const op of remaining) await idbSet('outbox', null, op);
  }
  state.outboxCount = (await idbAll('outbox')).length;
  emit();
}
async function runOp(op) {
  const { table, op: kind, row, id } = op;
  if (kind === 'insert') { const { error } = await sb.from(table).insert(row); if (error) throw error; }
  else if (kind === 'update') { const { error } = await sb.from(table).update(row).eq('id', id); if (error) throw error; }
  else if (kind === 'delete') { const { error } = await sb.from(table).delete().eq('id', id); if (error) throw error; }
  else if (kind === 'upsert') { const { error } = await sb.from(table).upsert(row); if (error) throw error; }
}

// Optimistic mutation: apply locally, then remote; queue on failure.
export async function mutate(table, kind, row, id) {
  const hid = householdId();
  if (kind === 'insert' || kind === 'upsert') {
    row.id = row.id || uuid();
    if (!row.household_id && table !== 'ingredient_nutrition') row.household_id = hid;
    if (!row.household_id && table === 'ingredient_nutrition') row.household_id = hid;
    row.updated_at = new Date().toISOString();
  }
  id = id || row.id;
  // local apply
  const list = state.data[table];
  if (kind === 'insert') list.push({ ...row, created_at: row.created_at || new Date().toISOString() });
  else if (kind === 'update' || kind === 'upsert') {
    const i = list.findIndex(r => r.id === id);
    if (i >= 0) list[i] = { ...list[i], ...row }; else list.push({ ...row });
  } else if (kind === 'delete') {
    const i = list.findIndex(r => r.id === id); if (i >= 0) list.splice(i, 1);
  }
  await cacheTable(table);
  emit();
  // remote
  try {
    await runOp({ table, op: kind, row, id });
    state.sync = 'ok';
    refreshTable(table); // reconcile with server (realtime also covers)
  } catch (e) {
    await queueOp({ table, op: kind, row, id });
    state.sync = navigator.onLine ? 'pending' : 'offline';
  }
  emit();
  return id;
}

window.addEventListener('online', () => { state.sync = 'ok'; flushOutbox().then(refreshAll); });
window.addEventListener('offline', () => { state.sync = 'offline'; emit(); });
setInterval(() => { if (navigator.onLine) flushOutbox(); }, 30000);

export function getState() { return state; }

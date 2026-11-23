/* =====================================================
   Whisked by Trix — admin dashboard
   Orders (live) + menu editor. Uses js/store.js.
   ===================================================== */
const $ = id => document.getElementById(id);
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');
// Customer-supplied text is untrusted: always escape before putting it in HTML
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LABEL = { new: 'New', preparing: 'Preparing', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' };
const NEXT_STATUS = { new: 'preparing', preparing: 'ready', ready: 'completed' };
const nextText = o => ({ new: 'Start preparing', preparing: 'Mark ready', ready: o.method === 'delivery' ? 'Mark delivered' : 'Mark picked up' }[o.status]);
const isActive = o => ['new', 'preparing', 'ready'].includes(o.status);

let orders = [];
let filter = 'active';
let knownIds = null;          // null until the first batch has loaded (so old orders don't beep)
let unsubOrders = () => {};
let menuItems = [];
let soundOn = (() => { try { return localStorage.getItem('wbt_sound') !== '0'; } catch (e) { return true; } })();

/* ---------- Small helpers ---------- */
function showToast(msg) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(showToast._t); showToast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function beep() {
  if (!soundOn) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((f, i) => {
      const t0 = ctx.currentTime + i * 0.18, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.15, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
      o.start(t0); o.stop(t0 + 0.17);
    });
  } catch (e) { /* audio blocked — visual alert still shows */ }
}

function show(id, on) { $(id).hidden = !on; }

/* ---------- Boot & auth ---------- */
(async function init() {
  await Store.ready;
  const banner = $('mode-banner');
  if (Store.mode === 'demo') {
    banner.hidden = false;
    banner.innerHTML = '<strong>Demo mode.</strong> Firebase isn\'t set up yet, so orders and menu changes are saved <em>only in this browser</em> — customers on other devices won\'t see them. Follow <strong>SETUP.md</strong> to go live.';
    $('email-group').hidden = true; $('login-email').required = false;
    $('login-hint').textContent = 'Demo password: ' + ((window.WBT_CONFIG && window.WBT_CONFIG.demoPassword) || 'trix123');
  } else if (Store.mode === 'offline') {
    banner.hidden = false; banner.classList.add('error');
    banner.textContent = 'Can\'t reach Firebase. Check your internet connection and refresh the page.';
  }

  $('sound-toggle').textContent = soundOn ? '🔔' : '🔕';
  $('sound-toggle').setAttribute('aria-pressed', String(soundOn));

  Store.onAuth(user => user ? enterDashboard() : enterLogin());
})();

function enterLogin() {
  unsubOrders(); unsubOrders = () => {}; knownIds = null;
  show('dash-view', false); show('header-actions', false);
  show('login-view', Store.mode !== 'offline');
  document.title = 'Admin | Whisked by Trix';
}

function enterDashboard() {
  show('login-view', false); show('dash-view', true); show('header-actions', true);
  unsubOrders();
  unsubOrders = Store.watchOrders(onOrders, err => {
    console.error(err);
    $('orders-list').innerHTML = '<p class="empty">Couldn\'t load orders (' + esc(err.code || err.message) + '). Check your Firestore rules and that you\'re signed in with the admin email.</p>';
  });
  loadMenu();
}

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('login-error'), btn = $('login-btn');
  err.hidden = true; btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    await Store.signIn($('login-email').value.trim(), $('login-password').value);
    $('login-password').value = '';
    if (Store.mode === 'demo') enterDashboard();   // firebase path continues via onAuth
  } catch (ex) {
    const bad = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email', 'demo/wrong-password'].includes(ex.code);
    err.textContent = bad ? 'Wrong email or password.' : (ex.code === 'auth/too-many-requests' ? 'Too many attempts. Try again in a few minutes.' : ex.message);
    err.hidden = false;
  }
  btn.disabled = false; btn.textContent = 'Sign in';
});

$('signout-btn').addEventListener('click', async () => { await Store.signOut(); enterLogin(); });

$('sound-toggle').addEventListener('click', () => {
  soundOn = !soundOn;
  try { localStorage.setItem('wbt_sound', soundOn ? '1' : '0'); } catch (e) { /* ignore */ }
  $('sound-toggle').textContent = soundOn ? '🔔' : '🔕';
  $('sound-toggle').setAttribute('aria-pressed', String(soundOn));
  if (soundOn) beep();
});

/* ---------- Tabs ---------- */
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  const name = tab.dataset.tab;
  document.querySelectorAll('.tab').forEach(t => { const on = t === tab; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
  show('panel-orders', name === 'orders'); show('panel-menu', name === 'menu');
}));

/* ---------- Orders ---------- */
function onOrders(list) {
  if (knownIds) {
    const fresh = list.filter(o => !knownIds.has(o.id) && o.status === 'new');
    if (fresh.length) { beep(); showToast(fresh.length === 1 ? `New order from ${fresh[0].name || 'a customer'}! 🍵` : `${fresh.length} new orders! 🍵`); }
  }
  knownIds = new Set(list.map(o => o.id));
  orders = list;
  renderOrders();
}

function renderOrders() {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const today = orders.filter(o => o.createdAt >= startOfDay.getTime() && o.status !== 'cancelled');
  const sales = today.reduce((s, o) => s + (o.total || 0), 0);
  const newCount = orders.filter(o => o.status === 'new').length;
  const activeCount = orders.filter(isActive).length;

  $('stats').innerHTML = `
    <div class="stat"><span>${newCount}</span>New</div>
    <div class="stat"><span>${activeCount}</span>Active</div>
    <div class="stat"><span>${today.length}</span>Orders today</div>
    <div class="stat"><span>${peso(sales)}</span>Sales today</div>`;

  const badge = $('orders-count');
  badge.textContent = newCount; badge.hidden = newCount === 0;
  document.title = (newCount ? `(${newCount}) ` : '') + 'Admin | Whisked by Trix';

  const shown = orders.filter(o => filter === 'all' || (filter === 'active' ? isActive(o) : !isActive(o)));
  $('orders-list').innerHTML = shown.length ? shown.map(orderCard).join('')
    : `<p class="empty">${filter === 'active' ? 'No active orders right now. New orders appear here automatically.' : 'Nothing here yet.'}</p>`;
}

function orderCard(o) {
  const when = o.createdAt ? new Date(o.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const items = (o.items || []).map(i => `<li><span>${esc(i.qty)}× ${esc(i.name)} <em>(${esc(i.size)})</em><small>${esc(i.vibe)}</small></span><span>${peso(i.total)}</span></li>`).join('');
  const phone = esc(o.phone);
  const actions = isActive(o) ? `
      <button type="button" class="btn-primary small" data-act="next" data-id="${esc(o.id)}">${nextText(o)}</button>
      <button type="button" class="btn-outline small danger" data-act="cancel" data-id="${esc(o.id)}">Cancel</button>` : '';
  return `
  <article class="order-card status-${esc(o.status)}">
    <div class="order-top">
      <div><strong>#${esc(o.id)}</strong><span class="muted-text"> · ${esc(when)}</span></div>
      <span class="badge ${esc(o.status)}">${esc(LABEL[o.status] || o.status)}</span>
    </div>
    <div class="order-who">
      <strong>${esc(o.name)}</strong>
      <a href="tel:${phone}">📞 ${phone}</a>
      <a href="sms:${phone}">💬 Text</a>
    </div>
    <p class="order-where"><span class="pill">${o.method === 'delivery' ? '🛵 Delivery' : '🏪 Pick-up'}</span> <span class="pill">${esc(o.payment)}</span> ${o.method === 'delivery' ? esc(o.address) : ''}</p>
    ${o.notes ? `<p class="order-notes">📝 ${esc(o.notes)}</p>` : ''}
    <ul class="order-items">${items}</ul>
    <div class="order-total"><span>${o.deliveryFee ? 'Includes ' + peso(o.deliveryFee) + ' delivery' : 'No delivery fee'}</span><strong>${peso(o.total)}</strong></div>
    ${actions ? `<div class="order-actions">${actions}</div>` : ''}
  </article>`;
}

$('order-filters').addEventListener('click', e => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  filter = chip.dataset.filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
  renderOrders();
});

$('orders-list').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const o = orders.find(x => x.id === btn.dataset.id); if (!o) return;
  try {
    if (btn.dataset.act === 'next') {
      btn.disabled = true;
      await Store.updateOrder(o.id, { status: NEXT_STATUS[o.status] });
    } else if (btn.dataset.act === 'cancel') {
      if (!confirm(`Cancel order #${o.id} from ${o.name}?`)) return;
      await Store.updateOrder(o.id, { status: 'cancelled' });
    }
  } catch (ex) { console.error(ex); showToast('Could not update: ' + (ex.code || ex.message)); btn.disabled = false; }
});

/* ---------- Menu editor ---------- */
async function loadMenu() {
  try { menuItems = await Store.getMenu({ raw: true }); } catch (e) { console.error(e); menuItems = []; }
  renderMenu();
}

let restoreDismissed = false;
function updateRestoreBar() {
  const bar = $('restore-bar');
  const missing = menuItems.length ? DEFAULT_MENU.filter(d => !menuItems.some(m => m.id === d.id)) : [];
  if (!missing.length || restoreDismissed) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `<span>Missing from your menu: <strong>${missing.map(m => esc(m.name)).join(', ')}</strong></span>
    <button type="button" class="btn-primary small" id="restore-btn">Restore</button>
    <button type="button" class="restore-x" id="restore-x" aria-label="Dismiss">✕</button>`;
  $('restore-btn').addEventListener('click', async () => {
    try { const n = await Store.restoreDefaults(); showToast(n ? `Restored ${n} drink${n > 1 ? 's' : ''}. Please check the price${n > 1 ? 's' : ''} below ✓` : 'Nothing to restore'); await loadMenu(); }
    catch (ex) { console.error(ex); showToast('Could not restore: ' + (ex.code || ex.message)); }
  });
  $('restore-x').addEventListener('click', () => { restoreDismissed = true; bar.hidden = true; });
}

function renderMenu(draft) {
  const list = $('menu-list');
  if (!menuItems.length && !draft) {
    $('add-drink-btn').hidden = true; $('restore-bar').hidden = true;
    list.innerHTML = `<div class="empty">
      <p>No drinks are saved yet, so your public menu is showing the built-in defaults.</p>
      <p><button type="button" class="btn-primary" id="seed-btn">Load default menu to edit</button></p></div>`;
    $('seed-btn').addEventListener('click', async () => {
      try { await Store.seedDefaults(); showToast('Default menu loaded'); loadMenu(); }
      catch (ex) { showToast('Could not save: ' + (ex.code || ex.message)); }
    });
    return;
  }
  $('add-drink-btn').hidden = false;
  list.innerHTML = (draft ? menuForm(draft, true) : '') + menuItems.map(i => menuForm(i, false)).join('');
  updateRestoreBar();
}

function menuForm(i, isNew) {
  const p = i.prices || {};
  return `
  <form class="menu-edit${i.available === false ? ' soldout' : ''}" data-id="${esc(i.id || '')}" data-new="${isNew ? '1' : ''}">
    <div class="menu-edit-head">
      ${i.image ? `<img class="menu-thumb" src="${esc(i.image)}" alt="" width="44" height="44">` : ''}
      <input class="emoji-input" name="emoji" value="${esc(i.emoji || '🍵')}" maxlength="4" aria-label="Emoji">
      <input name="name" value="${esc(i.name || '')}" placeholder="Drink name" required maxlength="40" aria-label="Drink name">
      <label class="switch"><input type="checkbox" name="available" ${i.available === false ? '' : 'checked'}><span>Available</span></label>
    </div>
    <input name="ingredients" value="${esc(i.ingredients || '')}" placeholder="Ingredients (e.g. matcha, milk, agave)" maxlength="80" aria-label="Ingredients">
    <div class="price-row">
      <label>12oz ₱ <input type="number" name="p12" min="1" step="1" value="${esc(p['12oz'] || '')}" required></label>
      <label>16oz ₱ <input type="number" name="p16" min="1" step="1" value="${esc(p['16oz'] || '')}" required></label>
    </div>
    <div class="menu-edit-actions">
      <button type="submit" class="btn-primary small">${isNew ? 'Add to menu' : 'Save changes'}</button>
      <button type="button" class="btn-outline small danger" data-del="1">${isNew ? 'Discard' : 'Delete'}</button>
    </div>
  </form>`;
}

$('add-drink-btn').addEventListener('click', () => {
  if (document.querySelector('.menu-edit[data-new="1"]')) return;
  renderMenu({ emoji: '🍵', name: '', ingredients: '', prices: {}, available: true });
  document.querySelector('.menu-edit[data-new="1"] input[name="name"]').focus();
});

$('menu-list').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, isNew = f.dataset.new === '1';
  const name = f.name.value.trim();
  const p12 = Math.round(Number(f.p12.value)), p16 = Math.round(Number(f.p16.value));
  if (!name || !(p12 > 0) || !(p16 > 0)) { showToast('Please enter a name and both prices.'); return; }
  const existing = menuItems.find(x => x.id === f.dataset.id);
  const id = isNew ? (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'drink') + '-' + Math.random().toString(36).slice(2, 6) : f.dataset.id;
  const sort = existing ? existing.sort : (menuItems.reduce((m, x) => Math.max(m, x.sort || 0), 0) + 1);
  const item = { id, name, ingredients: f.ingredients.value.trim(), emoji: f.emoji.value.trim() || '🍵', prices: { '12oz': p12, '16oz': p16 }, available: f.available.checked, sort };
  if (existing && existing.image) item.image = existing.image;   // keep the drink's photo when editing
  try { await Store.saveMenuItem(item); showToast('Saved ✓'); await loadMenu(); }
  catch (ex) { console.error(ex); showToast('Could not save: ' + (ex.code || ex.message)); }
});

$('menu-list').addEventListener('change', async e => {
  if (e.target.name !== 'available') return;
  const f = e.target.form;
  if (f.dataset.new === '1') return;                       // drafts save with the form
  const item = menuItems.find(x => x.id === f.dataset.id); if (!item) return;
  try {
    await Store.saveMenuItem({ ...item, available: e.target.checked });
    item.available = e.target.checked;
    f.classList.toggle('soldout', !e.target.checked);
    showToast(e.target.checked ? `${item.name} is available` : `${item.name} marked sold out`);
  } catch (ex) { console.error(ex); e.target.checked = !e.target.checked; showToast('Could not update: ' + (ex.code || ex.message)); }
});

$('menu-list').addEventListener('click', async e => {
  const del = e.target.closest('[data-del]'); if (!del) return;
  const f = del.closest('form');
  if (f.dataset.new === '1') { renderMenu(); return; }
  const item = menuItems.find(x => x.id === f.dataset.id);
  if (!confirm(`Delete "${item ? item.name : 'this drink'}" from the menu?`)) return;
  try { await Store.deleteMenuItem(f.dataset.id); showToast('Deleted'); await loadMenu(); }
  catch (ex) { console.error(ex); showToast('Could not delete: ' + (ex.code || ex.message)); }
});


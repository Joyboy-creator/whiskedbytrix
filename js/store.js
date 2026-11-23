/* =====================================================
   Whisked by Trix — data layer
   One API, two backends:
   • Firebase (Firestore + Auth) when js/config.js has a firebase config
   • Demo mode (localStorage) otherwise
   Public pages and admin.html both use this file.
   ===================================================== */
const DEFAULT_MENU = [
  { id: 'classic-matcha', name: 'Classic Matcha', ingredients: 'matcha, milk, agave', emoji: '🍵', image: 'assets/drinks/classic.webp', prices: { '12oz': 215, '16oz': 275 }, available: true, sort: 1 },
  { id: 'seasalt-matcha', name: 'Seasalt Matcha', ingredients: 'matcha, milk, agave', emoji: '🧂', image: 'assets/drinks/seasalt.webp', prices: { '12oz': 235, '16oz': 295 }, available: true, sort: 2 },
  { id: 'dream-matcha', name: 'Dream Matcha', ingredients: 'matcha, milk, agave + cereal crunch', emoji: '🥣', image: 'assets/drinks/dream.webp', prices: { '12oz': 249, '16oz': 309 }, available: true, sort: 3 },
  // NOTE: prices below are placeholders (same as Classic). Set the real ones in the admin Menu tab.
  { id: 'hojicha-latte', name: 'Hojicha Latte', ingredients: 'toasty, smooth, creamy', emoji: '☕', image: 'assets/drinks/hojicha.webp', prices: { '12oz': 215, '16oz': 275 }, available: true, sort: 4, tone: 'tan', badge: 'NEW' }
];

const Store = (() => {
  const cfg = window.WBT_CONFIG || {};
  const fbCfg = cfg.firebase && cfg.firebase.apiKey ? cfg.firebase : null;
  const needsAuth = !!window.WBT_ADMIN;
  let mode = fbCfg ? 'firebase' : 'demo';   // 'firebase' | 'demo' | 'offline'
  let db = null, auth = null;

  const ls = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  const ready = (async () => {
    if (!fbCfg) return;
    try {
      const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
      await loadScript(base + 'firebase-app-compat.js');
      const libs = [loadScript(base + 'firebase-firestore-compat.js')];
      if (needsAuth) libs.push(loadScript(base + 'firebase-auth-compat.js'));
      await Promise.all(libs);
      firebase.initializeApp(fbCfg);
      db = firebase.firestore();
      if (needsAuth) auth = firebase.auth();
    } catch (e) {
      console.error('Firebase failed to load:', e);
      mode = 'offline';
    }
  })();

  const byField = (f, dir) => (a, b) => dir * ((a[f] || 0) - (b[f] || 0));
  const requireOnline = () => { if (mode === 'offline') throw new Error('Not connected. Check your internet and refresh.'); };

  /* ---------------- Menu ---------------- */
  // raw:true returns only what is really saved (admin); otherwise falls back to defaults (customers)
  async function getMenu({ raw = false } = {}) {
    await ready;
    let list = null;
    if (mode === 'firebase') {
      try { const snap = await db.collection('menu').get(); list = snap.docs.map(d => ({ ...d.data(), id: d.id })); }
      catch (e) { console.error(e); }
    } else if (mode === 'demo') {
      list = ls.get('wbt_demo_menu', null);
    }
    // Built-in drinks always use the photo that ships with the site (custom drinks keep their own)
    (list || []).forEach(item => {
      const d = DEFAULT_MENU.find(x => x.id === item.id);
      if (d && d.image) item.image = d.image;
      if (d && d.tone) item.tone = d.tone;
      if (d && d.badge) item.badge = d.badge;
    });
    if (raw) return (list || []).sort(byField('sort', 1));
    return list && list.length ? list.sort(byField('sort', 1)) : DEFAULT_MENU.map(x => ({ ...x }));
  }

  async function saveMenuItem(item) {
    await ready; requireOnline();
    if (mode === 'firebase') { await db.collection('menu').doc(item.id).set(item); return; }
    const list = ls.get('wbt_demo_menu', []);
    const i = list.findIndex(x => x.id === item.id);
    if (i >= 0) list[i] = item; else list.push(item);
    ls.set('wbt_demo_menu', list);
  }

  async function deleteMenuItem(id) {
    await ready; requireOnline();
    if (mode === 'firebase') { await db.collection('menu').doc(id).delete(); return; }
    ls.set('wbt_demo_menu', ls.get('wbt_demo_menu', []).filter(x => x.id !== id));
  }

  async function seedDefaults() {
    for (const item of DEFAULT_MENU) await saveMenuItem({ ...item });
  }

  // Re-adds any built-in drink that is missing (e.g. deleted by accident); never touches existing drinks
  async function restoreDefaults() {
    const have = new Set((await getMenu({ raw: true })).map(x => x.id));
    let restored = 0;
    for (const d of DEFAULT_MENU) {
      if (!have.has(d.id)) { await saveMenuItem({ ...d }); restored++; }
    }
    return restored;
  }

  /* ---------------- Orders ---------------- */
  const localSubs = new Set();
  const localOrders = () => ls.get('wbt_demo_orders', []).sort(byField('createdAt', -1));
  const notifyLocal = () => localSubs.forEach(fn => fn());

  async function placeOrder(order) {
    await ready; requireOnline();
    if (mode === 'firebase') { await db.collection('orders').doc(order.id).set(order); return; }
    const list = ls.get('wbt_demo_orders', []); list.push(order); ls.set('wbt_demo_orders', list);
  }

  // Returns an unsubscribe function immediately; callback fires on every change
  function watchOrders(cb, onError) {
    let cancelled = false, unsub = () => {};
    ready.then(() => {
      if (cancelled) return;
      if (mode === 'firebase') {
        unsub = db.collection('orders').orderBy('createdAt', 'desc').limit(300)
          .onSnapshot(s => cb(s.docs.map(d => ({ ...d.data(), id: d.id }))), err => onError && onError(err));
      } else if (mode === 'demo') {
        const push = () => cb(localOrders());
        const onStorage = e => { if (e.key === 'wbt_demo_orders') push(); };
        localSubs.add(push); window.addEventListener('storage', onStorage); push();
        unsub = () => { localSubs.delete(push); window.removeEventListener('storage', onStorage); };
      } else if (onError) onError(new Error('Not connected'));
    });
    return () => { cancelled = true; unsub(); };
  }

  async function updateOrder(id, patch) {
    await ready; requireOnline();
    if (mode === 'firebase') { await db.collection('orders').doc(id).update(patch); return; }
    const list = ls.get('wbt_demo_orders', []);
    const o = list.find(x => x.id === id);
    if (o) Object.assign(o, patch);
    ls.set('wbt_demo_orders', list); notifyLocal();
  }

  /* ---------------- Admin auth ---------------- */
  function onAuth(cb) {
    ready.then(() => {
      if (mode === 'firebase') auth.onAuthStateChanged(u => cb(u ? { email: u.email } : null));
      else if (mode === 'demo') cb(sessionStorage.getItem('wbt_demo_admin') ? { email: 'demo' } : null);
      else cb(null);
    });
  }

  async function signIn(email, password) {
    await ready; requireOnline();
    if (mode === 'firebase') { await auth.signInWithEmailAndPassword(email, password); return; }
    if (password === (cfg.demoPassword || 'trix123')) { sessionStorage.setItem('wbt_demo_admin', '1'); return; }
    const err = new Error('Wrong password'); err.code = 'demo/wrong-password'; throw err;
  }

  async function signOut() {
    sessionStorage.removeItem('wbt_demo_admin');
    await ready;
    if (mode === 'firebase' && auth) await auth.signOut();
  }

  return { ready, get mode() { return mode; }, getMenu, saveMenuItem, deleteMenuItem, seedDefaults, restoreDefaults,
           placeOrder, watchOrders, updateOrder, onAuth, signIn, signOut };
})();

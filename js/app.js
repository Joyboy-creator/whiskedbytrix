/* =====================================================
   Whisked by Trix — shop logic
   Edit the SETTINGS block below to update business info.
   ===================================================== */
const SETTINGS = Object.assign(
  { deliveryFee: 40, gcashNumber: '0917-000-0000', gcashName: 'Whisked by Trix', messengerUrl: '' },
  (window.WBT_CONFIG && window.WBT_CONFIG.settings) || {}
);

// The menu comes from the data layer (js/store.js): Firebase when set up, otherwise the defaults
let MENU_ITEMS = typeof DEFAULT_MENU !== 'undefined' ? DEFAULT_MENU : [];

/* ---------- State & safe storage ---------- */
function loadCart() {
  try {
    const data = JSON.parse(localStorage.getItem('wbt_cart'));
    return Array.isArray(data) ? data : [];
  } catch (e) { return []; }
}
let cart = loadCart();
let activeProduct = null;
let selectedSize = '12oz';
let modalQty = 1;
let lastFocused = null;
let orderSummaryText = '';

const peso = n => `₱${n.toLocaleString('en-PH')}`;
const $ = id => document.getElementById(id);
const escHtml = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

document.addEventListener('DOMContentLoaded', async () => {
  updateCartCount();
  const num = $('gcash-number'); if (num) num.textContent = SETTINGS.gcashNumber;
  const nm = $('gcash-name'); if (nm) nm.textContent = SETTINGS.gcashName;
  const nmWrap = $('gcash-name-wrap'); if (nmWrap) nmWrap.hidden = !SETTINGS.gcashName;
  if ($('cart-items-container')) { renderCart(); toggleGcashInfo(); }
  if ($('menu-grid') || $('featured-grid')) {
    const skeleton = '<div class="skeleton-card" aria-hidden="true"><div class="skeleton sk-art"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line s"></div><div class="skeleton sk-btn"></div></div>'.repeat(3);
    if ($('menu-grid')) $('menu-grid').innerHTML = skeleton;
    if ($('featured-grid')) $('featured-grid').innerHTML = skeleton;
    try { await Store.ready; MENU_ITEMS = await Store.getMenu(); } catch (e) { console.error(e); }
    if ($('menu-grid')) renderMenu();
    renderFeatured();
  }
});

/* Close any open modal with Escape or a click on the backdrop */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('customizer-modal') && !$('customizer-modal').classList.contains('hidden')) closeModal();
});
document.addEventListener('click', e => {
  if (e.target.id === 'customizer-modal') closeModal();
});

/* ---------- Helpers ---------- */
function saveCart() {
  try { localStorage.setItem('wbt_cart', JSON.stringify(cart)); } catch (e) { /* private mode: cart lasts for this page only */ }
  updateCartCount();
}

function updateCartCount() {
  const total = cart.reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll('.cart-count').forEach(el => { el.textContent = total; });
  renderCartBar();
}

/* Sticky "view cart" bar for phones (not shown on the cart page itself) */
function renderCartBar() {
  if ($('checkout-form')) return;
  const count = cart.reduce((sum, i) => sum + i.qty, 0);
  const subtotal = cart.reduce((sum, i) => sum + i.total, 0);
  let bar = $('cart-bar');
  if (!bar) {
    bar = document.createElement('a');
    bar.id = 'cart-bar'; bar.className = 'cart-bar'; bar.href = 'cart.html';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<span>🛒 ${count} item${count === 1 ? '' : 's'}<small>${peso(subtotal)} subtotal</small></span><span class="cb-go">View cart →</span>`;
  bar.setAttribute('aria-label', `View your cart, ${count} item${count === 1 ? '' : 's'}`);
  bar.classList.toggle('show', count > 0);
  document.body.classList.toggle('has-cartbar', count > 0);
}

/* A little copy of the drink flies into the cart (phones: the green bar; desktop: the Cart button) */
function flyToCart(imgEl) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!imgEl || reduce || !imgEl.animate) { bumpCart(); return; }
  let target = document.querySelector('.cart-bar.show');
  if (!target || !target.getBoundingClientRect().width) target = document.querySelector('.cart-trigger');
  if (!target) { bumpCart(); return; }
  const from = imgEl.getBoundingClientRect(), to = target.getBoundingClientRect();
  const clone = imgEl.cloneNode(false);
  clone.removeAttribute('loading'); clone.setAttribute('aria-hidden', 'true');
  Object.assign(clone.style, { position: 'fixed', left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px',
    objectFit: 'contain', zIndex: 300, pointerEvents: 'none', filter: 'drop-shadow(0 10px 10px rgba(36,60,20,.3))' });
  document.body.appendChild(clone);
  const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
  const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
  const anim = clone.animate([
    { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
    { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) scale(.62) rotate(-14deg)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(.1) rotate(-24deg)`, opacity: .3 }
  ], { duration: 780, easing: 'cubic-bezier(.45,.05,.55,.95)' });
  anim.onfinish = () => { clone.remove(); bumpCart(); };
  anim.oncancel = () => clone.remove();
}

function bumpCart() {
  document.querySelectorAll('.cart-trigger, .cart-bar').forEach(el => {
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  });
}

function showToast(msg) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- Menu ---------- */
function stockPill(item) {
  return item.available === false
    ? '<span class="stock out">Sold out</span>'
    : '<span class="stock in">Available</span>';
}

function artHtml(item, size) {
  return item.image
    ? `<img src="${escHtml(item.image)}" alt="${escHtml(item.name)}" width="${size}" height="${size}" loading="lazy">`
    : `<span aria-hidden="true">${escHtml(item.emoji || '🍵')}</span>`;
}

function renderMenu() {
  $('menu-grid').innerHTML = MENU_ITEMS.map(item => `
    <article class="product-card${item.available === false ? ' sold-out' : ''}" data-id="${escHtml(item.id)}"${item.tone ? ` data-tone="${escHtml(item.tone)}"` : ''}>
      <div class="product-art">${artHtml(item, 240)}${item.badge ? `<span class="tag-new">${escHtml(item.badge)}</span>` : ''}</div>
      <div class="product-info">
        <h3 class="product-title">${escHtml(item.name)}</h3>
        <p class="product-ingredients">${escHtml(item.ingredients)}</p>
        ${stockPill(item)}
      </div>
      <div class="product-buy">
        <div class="price-list">
          <span>12oz <strong>${peso(item.prices['12oz'])}</strong></span>
          <span>16oz <strong>${peso(item.prices['16oz'])}</strong></span>
        </div>
        ${item.available === false
          ? '<button type="button" class="btn-primary" disabled>Sold out</button>'
          : `<button type="button" class="btn-primary" onclick="openCustomizer('${escHtml(item.id)}')">Customize &amp; Add</button>`}
      </div>
    </article>
  `).join('');
  if (window.FX) FX.observe($('menu-grid'));
}

/* Home page: big photo cards + the "from" price on the hero sticker */
function renderFeatured() {
  const lowest = item => Math.min(...Object.values(item.prices || {}).filter(n => n > 0));
  const grid = $('featured-grid');
  if (grid) {
    grid.innerHTML = MENU_ITEMS.map(item => `
      <article class="drink-card${item.available === false ? ' sold-out' : ''}"${item.tone ? ` data-tone="${escHtml(item.tone)}"` : ''}>
        <div class="art">${item.image
          ? `<img src="${escHtml(item.image)}" alt="${escHtml(item.name)}" width="300" height="300" loading="lazy">`
          : `<div style="display:grid;place-items:center;aspect-ratio:1;font-size:3.5rem" aria-hidden="true">${escHtml(item.emoji || '🍵')}</div>`}${item.badge ? `<span class="tag-new">${escHtml(item.badge)}</span>` : ''}</div>
        <h3>${escHtml(item.name)}</h3>
        <p class="ing">${escHtml(item.ingredients)}</p>
        ${stockPill(item)}
        <p class="from">from <strong>${peso(lowest(item))}</strong></p>
        ${item.available === false
          ? '<span class="btn-primary" aria-disabled="true" style="opacity:.6;box-shadow:none">Sold out</span>'
          : '<a class="btn-primary" href="menu.html">Order</a>'}
      </article>`).join('');
  }
  if (window.FX && grid) FX.observe(grid);
  const hero = $('hero-from');
  const open = MENU_ITEMS.filter(i => i.available !== false);
  if (hero && open.length) hero.textContent = peso(Math.min(...open.map(lowest)));
}

function openCustomizer(productId) {
  lastFocused = document.activeElement;
  activeProduct = MENU_ITEMS.find(p => p.id === productId);
  selectedSize = '12oz';
  modalQty = 1;

  $('modal-drink-name').textContent = activeProduct.name;
  $('modal-drink-desc').textContent = activeProduct.ingredients;
  $('modal-qty').textContent = modalQty;

  // Reset vibe to default each time the modal opens
  const defaultVibe = document.querySelector('input[name="matchaVibe"]');
  if (defaultVibe) defaultVibe.checked = true;

  $('size-options').innerHTML = Object.entries(activeProduct.prices).map(([size, price], idx) => `
    <label class="select-card">
      <input type="radio" name="cupSize" value="${size}" ${idx === 0 ? 'checked' : ''} onchange="selectSize('${size}')">
      <div><strong>${size}</strong><span>${peso(price)}</span></div>
    </label>
  `).join('');

  updateModalSubtotal();
  $('customizer-modal').classList.remove('hidden');
  const first = document.querySelector('#customizer-modal input[type="radio"]');
  if (first) first.focus();
}

function closeModal() {
  $('customizer-modal').classList.add('hidden');
  if (lastFocused) lastFocused.focus();
}

function selectSize(size) { selectedSize = size; updateModalSubtotal(); }

function changeModalQty(delta) {
  modalQty = Math.min(20, Math.max(1, modalQty + delta));
  $('modal-qty').textContent = modalQty;
  updateModalSubtotal();
}

function updateModalSubtotal() {
  $('modal-subtotal').textContent = peso(activeProduct.prices[selectedSize] * modalQty);
}

function confirmAddToCart() {
  const vibe = document.querySelector('input[name="matchaVibe"]:checked').value;
  const unitPrice = activeProduct.prices[selectedSize];

  // Merge with an identical line item instead of creating duplicates
  const existing = cart.find(i => i.name === activeProduct.name && i.size === selectedSize && i.vibe === vibe);
  if (existing) {
    existing.qty += modalQty;
    existing.total = existing.unitPrice * existing.qty;
  } else {
    cart.push({ id: Date.now(), name: activeProduct.name, size: selectedSize, vibe, qty: modalQty, unitPrice, total: unitPrice * modalQty });
  }

  saveCart();
  const srcImg = document.querySelector(`.product-card[data-id="${CSS.escape(activeProduct.id)}"] .product-art img`);
  closeModal();
  flyToCart(srcImg);
  showToast(`Added ${modalQty}x ${activeProduct.name} to your cart 🍵`);
}

/* ---------- Cart ---------- */
function renderCart() {
  const container = $('cart-items-container');
  if (cart.length === 0) {
    container.innerHTML = `<p class="empty-cart">Your cart is empty. <a href="menu.html">Pick a matcha drink!</a></p>`;
  } else {
    container.innerHTML = cart.map(item => `
      <div class="cart-item">
        <div>
          <strong>${item.name} (${item.size})</strong>
          <div class="cart-item-meta">${item.vibe}</div>
          <div class="item-actions">
            <div class="mini-qty">
              <button type="button" aria-label="Decrease quantity" onclick="changeCartQty(${item.id}, -1)">−</button>
              <span aria-live="polite">${item.qty}</span>
              <button type="button" aria-label="Increase quantity" onclick="changeCartQty(${item.id}, 1)">+</button>
            </div>
            <button type="button" class="remove-btn" onclick="removeFromCart(${item.id})">Remove</button>
          </div>
        </div>
        <strong>${peso(item.total)}</strong>
      </div>
    `).join('');
  }
  updateDeliveryFee();
}

function changeCartQty(itemId, delta) {
  const item = cart.find(i => i.id === itemId);
  if (!item) return;
  item.qty = Math.min(20, item.qty + delta);
  if (item.qty < 1) return removeFromCart(itemId);
  item.total = item.unitPrice * item.qty;
  saveCart();
  renderCart();
}

function removeFromCart(itemId) {
  cart = cart.filter(item => item.id !== itemId);
  saveCart();
  renderCart();
}

function updateDeliveryFee() {
  const methodInput = document.querySelector('input[name="orderMethod"]:checked');
  if (!methodInput) return;
  const isDelivery = methodInput.value === 'delivery';
  const addressGroup = $('address-group');
  const addressInput = $('cust-address');

  if (addressGroup) addressGroup.style.display = isDelivery ? 'block' : 'none';
  if (addressInput) addressInput.required = isDelivery;

  const deliveryFee = isDelivery && cart.length > 0 ? SETTINGS.deliveryFee : 0;
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  if ($('delivery-fee-display')) $('delivery-fee-display').textContent = peso(deliveryFee);
  const totalEl = $('cart-total-display');
  if (totalEl) {
    const next = peso(subtotal + deliveryFee);
    if (totalEl.textContent !== next) {
      totalEl.textContent = next;
      totalEl.classList.remove('pop'); void totalEl.offsetWidth; totalEl.classList.add('pop');
    }
  }
  const label = $('delivery-label'); if (label) label.textContent = `Local Delivery (+${peso(SETTINGS.deliveryFee)})`;
  const submit = document.querySelector('#checkout-form button[type="submit"]');
  if (submit && !submit.disabled) submit.textContent = cart.length ? `Place Order · ${peso(subtotal + deliveryFee)}` : 'Place Order';
}

function toggleGcashInfo() {
  const payment = $('payment-method').value;
  const box = $('gcash-box');
  if (box) box.classList.toggle('hidden', payment !== 'GCash');
}

/* ---------- Checkout ---------- */
const checkoutForm = $('checkout-form');
if (checkoutForm) {
  checkoutForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (cart.length === 0) { showToast('Your cart is empty — add a drink first!'); return; }

    const name = $('cust-name').value.trim();
    const phone = $('cust-phone').value.trim();
    const method = document.querySelector('input[name="orderMethod"]:checked').value;
    const address = method === 'delivery' ? $('cust-address').value.trim() : 'Store Pick-up (Calbayog City)';
    const payment = $('payment-method').value;
    const notes = $('cust-notes').value.trim();

    const subtotal = cart.reduce((sum, i) => sum + i.total, 0);
    const deliveryFee = method === 'delivery' ? SETTINGS.deliveryFee : 0;
    const total = subtotal + deliveryFee;

    // Time-based ID plus 2 random characters: effectively collision-proof for a small shop
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 4).toUpperCase();
    const orderId = `WBT-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${rand}`;

    const order = {
      id: orderId, createdAt: Date.now(), status: 'new',
      name, phone, method, address, payment, notes,
      items: cart.map(i => ({ name: i.name, size: i.size, vibe: i.vibe, qty: i.qty, unitPrice: i.unitPrice, total: i.total })),
      subtotal, deliveryFee, total
    };

    const itemsList = order.items.map(i => `• ${i.qty}x ${i.name} (${i.size}) - ${i.vibe} [${peso(i.total)}]`).join('\n');
    orderSummaryText = `WHISKED BY TRIX ORDER (#${orderId})
Customer: ${name} (${phone})
Method: ${method.toUpperCase()}
Location: ${address}
Payment: ${payment}${notes ? `\nNotes: ${notes}` : ''}

ITEMS:
${itemsList}

Inclusions: Insulated thermal bag, cup holder, straw
TOTAL: ${peso(total)}`;

    // Send the order to the shop. 'sent' = reached Trix automatically.
    const btn = checkoutForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Sending…';
    let state = 'manual';   // manual = customer must copy it to Messenger
    try {
      await Store.ready;
      await Store.placeOrder(order);
      if (Store.mode === 'firebase') state = 'sent';
    } catch (err) {
      console.error('Order send failed:', err);
      if (Store.mode === 'firebase' || Store.mode === 'offline') state = 'failed';
    }
    btn.disabled = false; updateDeliveryFee();

    $('receipt-title').textContent = state === 'sent' ? 'Order sent! 🍵' : 'Almost done! 🍵';
    $('receipt-title').classList.remove('cheer');
    if (state === 'sent') { void $('receipt-title').offsetWidth; $('receipt-title').classList.add('cheer'); confetti(); }
    $('receipt-sent-msg').hidden = state !== 'sent';
    $('receipt-sent-msg').textContent = payment === 'GCash'
      ? "Trix received your order. Please send your GCash payment screenshot via Messenger so we can confirm it."
      : "Trix received your order and will message you to confirm.";
    $('receipt-fail-msg').hidden = state !== 'failed';
    $('receipt-manual').hidden = state === 'sent';
    $('receipt-id').textContent = `#${orderId}`;
    $('receipt-summary').textContent = orderSummaryText;

    const msgBtn = $('messenger-btn');
    if (msgBtn) {
      if (SETTINGS.messengerUrl) { msgBtn.href = SETTINGS.messengerUrl; msgBtn.hidden = false; }
      else msgBtn.hidden = true;
    }
    $('receipt-modal').classList.remove('hidden');
    $('receipt-modal').querySelector('button.btn-primary').focus();
  });
}

function copyOrderSummary() {
  const done = () => showToast('Order copied! Paste it into Messenger 💬');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(orderSummaryText).then(done).catch(fallbackCopy);
  } else fallbackCopy();

  function fallbackCopy() {
    const ta = document.createElement('textarea');
    ta.value = orderSummaryText; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (err) { showToast('Could not copy — please select the text and copy it manually.'); }
    ta.remove();
  }
}

/* Cart is only cleared when the customer taps "Done", so a stray tap never loses the order */
function closeReceipt() {
  cart = [];
  saveCart();
  window.location.href = 'index.html';
}

/* Little celebration when an order is sent */
function confetti() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
  const colors = ['#F27BB2', '#34551E', '#F6C3D8', '#F2B705', '#0B7A3B', '#FDE6F0'];
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 56; i++) {
    const piece = document.createElement('i');
    const round = Math.random() < 0.4, w = rnd(6, 11);
    piece.style.cssText = `--x:${rnd(2, 98).toFixed(1)}%;--w:${w.toFixed(1)}px;--h:${(round ? w : w * rnd(1.4, 2.2)).toFixed(1)}px;` +
      `--c:${colors[i % colors.length]};--br:${round ? '50%' : '2px'};--t:${rnd(1.9, 3.1).toFixed(2)}s;--dl:${rnd(0, .5).toFixed(2)}s;` +
      `--dx:${rnd(-90, 90).toFixed(0)}px;--rot:${rnd(260, 900).toFixed(0)}deg`;
    box.appendChild(piece);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

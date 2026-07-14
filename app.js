/* =========================================================================
   Aligned Aminos — front-end cart + checkout
   No backend. Cart persists in localStorage. Order flow is display-only:
   details -> payment (Venmo/Zelle/USDT) -> printable receipt.
   Swap payment handles/addresses in the catalog.html markup.
   ========================================================================= */
(function () {
  var STORE_KEY = 'aa_cart_v1';
  var cart = load();
  var currentStep = 'details';
  var currentOrder = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(cart)); }

  function count() {
    return Object.keys(cart).reduce(function (n, k) { return n + cart[k].qty; }, 0);
  }
  function subtotal() {
    return Object.keys(cart).reduce(function (s, k) { return s + cart[k].price * cart[k].qty; }, 0);
  }

  /* ---------- rendering ---------- */
  function renderCount() {
    document.querySelectorAll('[data-cart-count]').forEach(function (el) { el.textContent = count(); });
  }
  function renderSubtotals() {
    var s = subtotal();
    var main = document.getElementById('cart-subtotal');
    if (main) main.textContent = s;
    document.querySelectorAll('.checkout-subtotal').forEach(function (el) { el.textContent = s; });
    var btn = document.getElementById('checkout-btn');
    if (btn) btn.disabled = count() === 0;
  }
  function renderCart() {
    var body = document.getElementById('cart-body');
    if (!body) return;
    var ids = Object.keys(cart);
    if (!ids.length) {
      body.innerHTML = '<div class="drawer__empty">Your order is empty. Add compounds from the catalog to begin.</div>';
      renderSubtotals(); renderCount(); return;
    }
    var html = '';
    ids.forEach(function (id) {
      var it = cart[id];
      html += '' +
        '<div class="line-item">' +
          '<div class="line-item__info">' +
            '<h4>' + esc(it.name) + '</h4>' +
            '<div class="meta">' + esc(it.id) + ' · $' + it.price + ' / unit</div>' +
            '<div class="qty">' +
              '<button onclick="AA.dec(\'' + id + '\')" aria-label="Decrease">−</button>' +
              '<span>' + it.qty + '</span>' +
              '<button onclick="AA.inc(\'' + id + '\')" aria-label="Increase">+</button>' +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div class="line-item__price">$' + (it.price * it.qty) + '</div>' +
            '<button class="line-item__remove" onclick="AA.remove(\'' + id + '\')">Remove</button>' +
          '</div>' +
        '</div>';
    });
    body.innerHTML = html;
    renderSubtotals(); renderCount();
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }

  /* ---------- cart ops ---------- */
  function add(btn) {
    var card = btn.closest('.product');
    var id = card.dataset.id;
    if (cart[id]) cart[id].qty++;
    else cart[id] = { id: id, name: card.dataset.name, price: parseFloat(card.dataset.price), qty: 1 };
    save(); renderCart(); openCart(); toast(card.dataset.name + ' added');
  }
  function inc(id) { if (cart[id]) { cart[id].qty++; save(); renderCart(); } }
  function dec(id) { if (cart[id]) { cart[id].qty--; if (cart[id].qty <= 0) delete cart[id]; save(); renderCart(); } }
  function remove(id) { delete cart[id]; save(); renderCart(); }

  /* ---------- drawer ---------- */
  function openCart() {
    document.getElementById('cart').classList.add('open');
    document.getElementById('overlay').classList.add('open');
  }
  function closeCart() {
    document.getElementById('cart').classList.remove('open');
    document.getElementById('overlay').classList.remove('open');
  }

  /* ---------- checkout ---------- */
  function startCheckout() {
    if (count() === 0) return;
    closeCart();
    goStep('details');
    document.getElementById('checkout').classList.add('open');
  }
  function closeCheckout() { document.getElementById('checkout').classList.remove('open'); }

  function goStep(step) {
    currentStep = step;
    ['details', 'payment', 'receipt'].forEach(function (s) {
      document.getElementById('step-' + s).classList.toggle('active', s === step);
    });
    var title = { details: 'Order details', payment: 'Payment', receipt: 'Order received' }[step];
    document.getElementById('checkout-title').textContent = title;
    var next = document.getElementById('next-btn');
    var back = document.getElementById('back-btn');
    var foot = document.getElementById('checkout-foot');
    if (step === 'details') { next.textContent = 'Continue →'; back.style.visibility = 'hidden'; foot.style.display = 'flex'; }
    if (step === 'payment') { next.textContent = "I've sent payment →"; back.style.visibility = 'visible'; foot.style.display = 'flex'; }
    if (step === 'receipt') { foot.style.display = 'none'; }
  }

  function checkoutNext() {
    if (currentStep === 'details') {
      var form = document.getElementById('details-form');
      if (form.website && form.website.value) return; // honeypot
      if (!form.reportValidity()) return;
      currentOrder = makeOrderNumber();
      document.querySelectorAll('.order-num').forEach(function (el) { el.textContent = currentOrder; });
      var inline = document.getElementById('order-num-inline'); if (inline) inline.textContent = currentOrder;
      renderSubtotals();
      goStep('payment');
    } else if (currentStep === 'payment') {
      buildReceipt();
      goStep('receipt');
      toast('Order ' + currentOrder + ' recorded');
    }
  }
  function checkoutBack() {
    if (currentStep === 'payment') goStep('details');
    else if (currentStep === 'details') closeCheckout();
  }

  function makeOrderNumber() {
    var d = new Date();
    var stamp = String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate());
    var rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'AA-' + stamp + '-' + rand;
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function buildReceipt() {
    var box = document.getElementById('receipt-lines');
    if (!box) return;
    var html = '';
    Object.keys(cart).forEach(function (id) {
      var it = cart[id];
      html += '<div class="receipt__line"><span>' + esc(it.name) + ' × ' + it.qty + '</span><span>$' + (it.price * it.qty) + '</span></div>';
    });
    box.innerHTML = html;
  }

  /* ---------- payment tabs ---------- */
  function payTab(which) {
    document.querySelectorAll('.pay-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.pay === which); });
    document.querySelectorAll('.pay-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'pay-' + which); });
  }

  /* ---------- utilities ---------- */
  function copy(text, btn) {
    navigator.clipboard && navigator.clipboard.writeText(text);
    flash(btn);
  }
  function copyOrder(btn) {
    if (currentOrder) { navigator.clipboard && navigator.clipboard.writeText(currentOrder); flash(btn); }
  }
  function flash(btn) { var t = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = t; }, 1200); }

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function submitInquiry(e) {
    e.preventDefault();
    var f = e.target;
    if (f.website && f.website.value) return false; // honeypot
    // No backend wired yet — swap this for your form endpoint / email service.
    toast('Thanks — we respond within 24 hours.');
    f.reset();
    return false;
  }

  /* ---------- category filter ---------- */
  function initCatNav() {
    var nav = document.getElementById('cat-nav');
    if (!nav) return;
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var cat = a.dataset.cat;
        nav.querySelectorAll('a').forEach(function (x) { x.classList.remove('active'); });
        a.classList.add('active');
        document.querySelectorAll('.cat-group').forEach(function (g) {
          g.style.display = (cat === 'all' || g.dataset.group === cat) ? '' : 'none';
        });
      });
    });
  }

  /* ---------- init ---------- */
  function init() {
    var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
    renderCart();
    initCatNav();
    // open cart if URL hash is #cart
    if (location.hash === '#cart') setTimeout(openCart, 100);
  }
  document.addEventListener('DOMContentLoaded', init);

  /* expose */
  window.AA = {
    add: add, inc: inc, dec: dec, remove: remove,
    openCart: openCart, closeCart: closeCart,
    startCheckout: startCheckout, closeCheckout: closeCheckout,
    checkoutNext: checkoutNext, checkoutBack: checkoutBack,
    payTab: payTab, copy: copy, copyOrder: copyOrder,
    toast: toast, submitInquiry: submitInquiry
  };
})();

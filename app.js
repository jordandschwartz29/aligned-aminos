/* =========================================================================
   Aligned Aminos — front-end cart + checkout
   No backend. Cart persists in localStorage. Order flow is display-only:
   details -> payment (Venmo/Zelle/Wise/USDT) -> printable receipt.

   Order rules:
     • Flat $19.99 shipping on every order (any items in cart).
     • US Inventory items (data-us="1"): 10% off any line with qty >= 3.
     • US Inventory: order with 2+ US Inventory vials total includes a
       free 3 ml BAC water ($0).
   Swap payment handles/addresses in the catalog.html markup.
   ========================================================================= */
(function () {
  var STORE_KEY = 'aa_cart_v2';
  var SHIPPING_FLAT = 19.99;
  var cart = load();
  var currentStep = 'details';
  var currentOrder = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(cart)); }

  function money(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }

  function count() {
    return Object.keys(cart).reduce(function (n, k) { return n + cart[k].qty; }, 0);
  }

  /* ---------- totals engine ---------- */
  function computeTotals() {
    var subtotal = 0, discount = 0, usUnits = 0;
    Object.keys(cart).forEach(function (k) {
      var it = cart[k];
      var line = it.price * it.qty;
      subtotal += line;
      if (it.us) {
        usUnits += it.qty;
        if (it.qty >= 3) discount += line * 0.10;
      }
    });
    var hasItems = Object.keys(cart).length > 0;
    var shipping = hasItems ? SHIPPING_FLAT : 0;
    var freeWater = usUnits >= 2;
    var total = subtotal - discount + shipping;
    return { subtotal: subtotal, discount: discount, shipping: shipping, total: total, freeWater: freeWater, usUnits: usUnits, hasItems: hasItems };
  }

  function totRow(label, value, mod) {
    return '<div class="tot-row' + (mod ? ' tot-row--' + mod : '') + '"><span>' + label + '</span><span>' + value + '</span></div>';
  }
  function totalsHTML(t) {
    if (!t.hasItems) return '';
    var h = '';
    h += totRow('Subtotal', money(t.subtotal));
    if (t.discount > 0) h += totRow('US Inventory discount (10%)', '&minus;' + money(t.discount), 'disc');
    if (t.freeWater) h += totRow('Free 3&nbsp;ml BAC water', 'Included', 'gift');
    h += totRow('Shipping (flat)', money(t.shipping));
    h += totRow('Total', money(t.total), 'grand');
    return h;
  }

  /* ---------- rendering ---------- */
  function renderCount() {
    document.querySelectorAll('[data-cart-count]').forEach(function (el) { el.textContent = count(); });
  }
  function renderMoney() {
    var t = computeTotals();
    ['cart-totals', 'totals-details', 'totals-receipt'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = totalsHTML(t);
    });
    document.querySelectorAll('.amt-total').forEach(function (el) { el.textContent = (Math.round(t.total * 100) / 100).toFixed(2); });
    var btn = document.getElementById('checkout-btn');
    if (btn) btn.disabled = !t.hasItems;
    renderCount();
  }
  function renderCart() {
    var body = document.getElementById('cart-body');
    if (body) {
      var ids = Object.keys(cart);
      if (!ids.length) {
        body.innerHTML = '<div class="drawer__empty">Your order is empty. Add compounds from the catalog to begin.</div>';
      } else {
        var html = '';
        ids.forEach(function (id) {
          var it = cart[id];
          var bulk = (it.us && it.qty >= 3) ? '<div class="meta meta--save">10% bulk discount applied</div>' : '';
          html += '' +
            '<div class="line-item">' +
              '<div class="line-item__info">' +
                '<h4>' + esc(it.name) + '</h4>' +
                '<div class="meta">' + esc(it.id) + ' · ' + money(it.price) + ' / unit' + (it.us ? ' · US' : '') + '</div>' +
                bulk +
                '<div class="qty">' +
                  '<button onclick="AA.dec(\'' + id + '\')" aria-label="Decrease">−</button>' +
                  '<span>' + it.qty + '</span>' +
                  '<button onclick="AA.inc(\'' + id + '\')" aria-label="Increase">+</button>' +
                '</div>' +
              '</div>' +
              '<div style="text-align:right;">' +
                '<div class="line-item__price">' + money(it.price * it.qty) + '</div>' +
                '<button class="line-item__remove" onclick="AA.remove(\'' + id + '\')">Remove</button>' +
              '</div>' +
            '</div>';
        });
        body.innerHTML = html;
      }
    }
    renderMoney();
  }

  /* ---------- cart ops ---------- */
  function add(btn) {
    var card = btn.closest('.product');
    var id = card.dataset.id;
    if (cart[id]) cart[id].qty++;
    else cart[id] = { id: id, name: card.dataset.name, price: parseFloat(card.dataset.price), qty: 1, us: card.dataset.us === '1' };
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
    renderMoney();
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
      renderMoney();
      goStep('payment');
    } else if (currentStep === 'payment') {
      buildReceipt();
      renderMoney();
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
    var t = computeTotals();
    var html = '';
    Object.keys(cart).forEach(function (id) {
      var it = cart[id];
      html += '<div class="receipt__line"><span>' + esc(it.name) + ' × ' + it.qty + '</span><span>' + money(it.price * it.qty) + '</span></div>';
    });
    if (t.freeWater) {
      html += '<div class="receipt__line"><span>Free 3&nbsp;ml BAC water × 1</span><span>$0.00</span></div>';
    }
    box.innerHTML = html;
  }

  /* ---------- payment tabs ---------- */
  function payTab(which) {
    document.querySelectorAll('.pay-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.pay === which); });
    document.querySelectorAll('.pay-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'pay-' + which); });
  }

  /* ---------- utilities ---------- */
  function copy(text, btn) {
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    flash(btn);
  }
  function copyOrder(btn) {
    if (currentOrder && navigator.clipboard) { navigator.clipboard.writeText(currentOrder); flash(btn); }
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

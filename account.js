/* Tropical Taste — shared account widget.
   Included on every page: injects the account icon + dropdown into .nav-right,
   handles sign in / sign out, shows order history, and syncs the cart
   (localStorage ⇄ server) for signed-in users. */
(function () {
  let ttUser = null;

  const css = `
  .acct-wrap{position:relative}
  .acct-btn{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;border:1.5px solid rgba(255,255,255,.35);background:none;color:#fff;cursor:pointer;transition:all .2s;-webkit-tap-highlight-color:transparent;padding:0}
  .acct-btn:hover{background:rgba(255,255,255,.1);border-color:#fff}
  .acct-btn svg{width:19px;height:19px}
  .acct-btn .acct-initial{font-family:'Montserrat',sans-serif;font-weight:800;font-size:.9rem}
  .acct-btn.logged{background:linear-gradient(135deg,#FF6B6B,#FF2D8B);border-color:transparent}
  .acct-dd{position:absolute;top:calc(100% + 12px);right:0;width:290px;background:#160028;border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:1.1rem;box-shadow:0 18px 60px rgba(0,0,0,.6);display:none;z-index:1001}
  .acct-dd.open{display:block;animation:acctFade .2s ease}
  @keyframes acctFade{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
  .acct-ttl{font-weight:700;font-size:.92rem;margin-bottom:.8rem;color:#fff}
  .acct-sub{font-size:.72rem;color:rgba(255,255,255,.45);margin-top:-.5rem;margin-bottom:.8rem;word-break:break-all}
  .acct-inp{width:100%;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.12);border-radius:10px;padding:.65rem .9rem;color:#fff;font-family:'Montserrat',sans-serif;font-size:.82rem;outline:none;margin-bottom:.6rem;transition:border-color .2s}
  .acct-inp:focus{border-color:#FF2D8B}
  .acct-inp::placeholder{color:rgba(255,255,255,.25)}
  .acct-submit{width:100%;background:linear-gradient(135deg,#FF6B6B,#FF2D8B);color:#fff;border:none;padding:.7rem;border-radius:50px;font-family:'Montserrat',sans-serif;font-weight:700;font-size:.8rem;cursor:pointer;transition:opacity .2s;-webkit-tap-highlight-color:transparent}
  .acct-submit:disabled{opacity:.6;cursor:wait}
  .acct-err{color:#ff8080;font-size:.72rem;margin:.4rem 0 0;display:none;line-height:1.4}
  .acct-err.on{display:block}
  .acct-foot{margin-top:.9rem;padding-top:.8rem;border-top:1px solid rgba(255,255,255,.1);font-size:.75rem;color:rgba(255,255,255,.5);text-align:center}
  .acct-foot a{color:#FF6B6B;text-decoration:none;font-weight:700}
  .acct-orders{max-height:220px;overflow-y:auto;margin:.4rem 0}
  .acct-order{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:.55rem .7rem;margin-bottom:.45rem;font-size:.72rem;line-height:1.5;color:rgba(255,255,255,.7)}
  .acct-order strong{color:#F59E0B}
  .acct-order .st-paid{color:#34d399}
  .acct-order .st-pending{color:#F59E0B}
  .acct-logout{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.7);padding:.6rem;border-radius:50px;font-family:'Montserrat',sans-serif;font-weight:600;font-size:.78rem;cursor:pointer;margin-top:.5rem;transition:all .2s;-webkit-tap-highlight-color:transparent}
  .acct-logout:hover{background:rgba(255,255,255,.12)}
  .acct-empty{font-size:.74rem;color:rgba(255,255,255,.35);text-align:center;padding:.6rem 0}
  @media(max-width:480px){.acct-dd{position:fixed;top:64px;right:.8rem;left:.8rem;width:auto}}
  `;

  const PERSON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.9-3.6 3.7-5.4 7-5.4s6.1 1.8 7 5.4"/></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function injectWidget() {
    const navRight = document.querySelector('.nav-right');
    if (!navRight) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'acct-wrap';
    wrap.innerHTML = `
      <button class="acct-btn" id="acctBtn" aria-label="Account" aria-expanded="false">${PERSON_SVG}</button>
      <div class="acct-dd" id="acctDd"></div>
    `;
    navRight.insertBefore(wrap, navRight.firstElementChild);

    document.getElementById('acctBtn').addEventListener('click', e => {
      e.stopPropagation();
      const dd = document.getElementById('acctDd');
      const open = dd.classList.toggle('open');
      document.getElementById('acctBtn').setAttribute('aria-expanded', open);
      if (open) renderDropdown();
    });
    document.addEventListener('click', e => {
      const dd = document.getElementById('acctDd');
      if (dd.classList.contains('open') && !dd.contains(e.target)) {
        dd.classList.remove('open');
        document.getElementById('acctBtn').setAttribute('aria-expanded', 'false');
      }
    });
  }

  function renderButton() {
    const btn = document.getElementById('acctBtn');
    if (!btn) return;
    if (ttUser) {
      btn.classList.add('logged');
      btn.innerHTML = `<span class="acct-initial">${esc(ttUser.name.charAt(0).toUpperCase() || '?')}</span>`;
    } else {
      btn.classList.remove('logged');
      btn.innerHTML = PERSON_SVG;
    }
  }

  function renderDropdown() {
    const dd = document.getElementById('acctDd');
    if (!ttUser) {
      dd.innerHTML = `
        <div class="acct-ttl">Sign in to Tropical Taste</div>
        <input class="acct-inp" id="acctEmail" type="email" placeholder="Email" autocomplete="email">
        <input class="acct-inp" id="acctPass" type="password" placeholder="Password" autocomplete="current-password">
        <button class="acct-submit" id="acctLoginBtn">Sign In</button>
        <p class="acct-err" id="acctErr"></p>
        <div class="acct-foot">New here? <a href="register.html">Create an account</a></div>
      `;
      document.getElementById('acctLoginBtn').addEventListener('click', doLogin);
      document.getElementById('acctPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    } else {
      dd.innerHTML = `
        <div class="acct-ttl">👋 Hi, ${esc(ttUser.name.split(' ')[0])}</div>
        <div class="acct-sub">${esc(ttUser.email)}</div>
        <div style="font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:.4rem">Recent Orders</div>
        <div class="acct-orders" id="acctOrders"><div class="acct-empty">Loading…</div></div>
        <button class="acct-logout" id="acctLogoutBtn">Sign Out</button>
      `;
      document.getElementById('acctLogoutBtn').addEventListener('click', doLogout);
      loadOrders();
    }
  }

  async function doLogin() {
    const btn = document.getElementById('acctLoginBtn');
    const err = document.getElementById('acctErr');
    err.classList.remove('on');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:    document.getElementById('acctEmail').value.trim(),
          password: document.getElementById('acctPass').value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not sign in');
      ttUser = data.user;
      window.ttUser = ttUser;
      renderButton();
      renderDropdown();
      prefillCheckout();
      await syncCart();
    } catch (e) {
      err.textContent = e.message;
      err.classList.add('on');
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }

  async function doLogout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    ttUser = null;
    window.ttUser = null;
    localStorage.removeItem('tt_cart');
    if (typeof updateBadge === 'function') updateBadge();
    renderButton();
    document.getElementById('acctDd').classList.remove('open');
    location.reload();
  }

  async function loadOrders() {
    const box = document.getElementById('acctOrders');
    try {
      const res = await fetch('/api/me/orders');
      const data = await res.json();
      if (!res.ok) throw new Error();
      if (!data.orders.length) {
        box.innerHTML = '<div class="acct-empty">No orders yet — your history will appear here.</div>';
        return;
      }
      box.innerHTML = data.orders.map(o => {
        const st = o.status === 'paid'
          ? '<span class="st-paid">● Paid</span>'
          : '<span class="st-pending">● Pending payment</span>';
        const when = o.date ? o.date.split(' ')[0] : '';
        return `<div class="acct-order"><strong>${esc(o.orderNumber)}</strong> · $${(o.totalCents/100).toFixed(2)} CAD<br>${when} · ${st}</div>`;
      }).join('');
    } catch (e) {
      box.innerHTML = '<div class="acct-empty">Could not load orders.</div>';
    }
  }

  /* Merge the local cart with the server-saved cart, keep both in sync.
     After a completed checkout (ttPushCartOnly) the local cart is the truth —
     push it as-is so purchased items don't come back from the server copy. */
  async function syncCart() {
    if (!ttUser) return;
    try {
      const local = JSON.parse(localStorage.getItem('tt_cart') || '[]');
      let merged = local;
      if (!window.ttPushCartOnly) {
        const res = await fetch('/api/me/cart');
        if (!res.ok) return;
        const data = await res.json();
        merged = [...data.items];
        local.forEach(li => { if (!merged.some(si => si.id === li.id)) merged.push(li); });
      }
      localStorage.setItem('tt_cart', JSON.stringify(merged));
      await fetch('/api/me/cart', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: merged }),
      });
      if (typeof updateBadge === 'function') updateBadge();
      if (typeof renderCart === 'function' && typeof cart !== 'undefined') {
        cart = merged;
        renderCart();
      }
    } catch (e) {}
  }

  /* On the cart page, pre-fill the checkout form with the account details */
  function prefillCheckout() {
    if (!ttUser) return;
    const map = { gName: ttUser.name, gEmail: ttUser.email, gPhone: ttUser.phone };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && !el.value && val) el.value = val;
    });
  }

  /* Push the latest cart to the server when leaving the page */
  window.addEventListener('pagehide', () => {
    if (!ttUser || !navigator.sendBeacon) return;
    const items = localStorage.getItem('tt_cart') || '[]';
    navigator.sendBeacon('/api/me/cart', new Blob([JSON.stringify({ items: JSON.parse(items) })], { type: 'application/json' }));
  });

  async function init() {
    injectWidget();
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        ttUser = (await res.json()).user;
        window.ttUser = ttUser;
      }
    } catch (e) {}
    renderButton();
    prefillCheckout();
    await syncCart();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

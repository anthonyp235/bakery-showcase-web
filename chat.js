/* Tropical Taste — floating chat widget.
   Included on every public page. For now the "bot" is simple keyword
   matching in getBotReply() — that function is the single hook to swap
   for a real backend/AI endpoint later. Conversation persists across
   pages via sessionStorage. */
(function () {
  const STORE_KEY  = 'tt_chat_history';
  const TEASER_KEY = 'tt_chat_teaser_dismissed';

  const css = `
  .tt-chat-fab{position:fixed;bottom:1.4rem;right:1.4rem;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#FF6B6B,#FF2D8B);border:none;color:#fff;font-size:1.6rem;cursor:pointer;z-index:3000;box-shadow:0 10px 30px rgba(255,45,139,.45);transition:transform .2s,box-shadow .2s;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}
  .tt-chat-fab:hover{transform:translateY(-3px);box-shadow:0 16px 40px rgba(255,45,139,.55)}
  .tt-chat-fab.hidden{display:none}
  .tt-teaser{position:fixed;bottom:2rem;right:5.6rem;background:#160028;border:1px solid rgba(255,255,255,.18);border-radius:16px 16px 4px 16px;padding:.7rem 2.1rem .7rem 1rem;color:#fff;font-family:'Montserrat',sans-serif;font-size:.82rem;font-weight:600;z-index:3000;box-shadow:0 12px 40px rgba(0,0,0,.5);opacity:0;transform:translateY(8px);transition:opacity .3s,transform .3s;pointer-events:none;white-space:nowrap}
  .tt-teaser.on{opacity:1;transform:translateY(0);pointer-events:auto}
  .tt-teaser-x{position:absolute;top:4px;right:6px;background:none;border:none;color:rgba(255,255,255,.45);font-size:.75rem;cursor:pointer;padding:2px 4px;border-radius:6px;-webkit-tap-highlight-color:transparent}
  .tt-teaser-x:hover{color:#fff;background:rgba(255,255,255,.1)}
  .tt-chat{position:fixed;bottom:1.4rem;right:1.4rem;width:min(360px,calc(100vw - 1.6rem));height:min(500px,calc(100vh - 6rem));background:#12001f;border:1px solid rgba(255,255,255,.15);border-radius:20px;z-index:3001;display:none;flex-direction:column;overflow:hidden;box-shadow:0 25px 70px rgba(0,0,0,.65);font-family:'Montserrat',sans-serif}
  .tt-chat.open{display:flex;animation:ttChatIn .25s ease}
  @keyframes ttChatIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  .tt-chat.min{height:auto}
  .tt-chat.min .tt-chat-body,.tt-chat.min .tt-chat-inp-row{display:none}
  .tt-chat-head{background:linear-gradient(135deg,#FF6B6B,#FF2D8B);padding:.85rem 1rem;display:flex;align-items:center;gap:.7rem;flex-shrink:0;cursor:pointer;user-select:none}
  .tt-chat-ava{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0}
  .tt-chat-ttl{flex:1;min-width:0}
  .tt-chat-nm{font-weight:800;font-size:.88rem;color:#fff}
  .tt-chat-st{font-size:.66rem;color:rgba(255,255,255,.75);display:flex;align-items:center;gap:.3rem}
  .tt-chat-dot{width:7px;height:7px;border-radius:50%;background:#4ade80;display:inline-block}
  .tt-chat-btn{background:rgba(255,255,255,.15);border:none;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:.85rem;display:flex;align-items:center;justify-content:center;transition:background .2s;-webkit-tap-highlight-color:transparent;flex-shrink:0}
  .tt-chat-btn:hover{background:rgba(255,255,255,.3)}
  .tt-chat-body{flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.6rem}
  .tt-chat-body::-webkit-scrollbar{width:5px}
  .tt-chat-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:3px}
  .tt-msg{max-width:82%;padding:.6rem .85rem;border-radius:14px;font-size:.8rem;line-height:1.55;white-space:pre-line;word-wrap:break-word}
  .tt-msg.bot{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.09);color:rgba(255,255,255,.85);align-self:flex-start;border-bottom-left-radius:4px}
  .tt-msg.user{background:linear-gradient(135deg,#FF6B6B,#FF2D8B);color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
  .tt-typing{display:flex;gap:4px;padding:.7rem .9rem;background:rgba(255,255,255,.07);border-radius:14px;border-bottom-left-radius:4px;align-self:flex-start}
  .tt-typing span{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.5);animation:ttBlink 1.2s infinite}
  .tt-typing span:nth-child(2){animation-delay:.2s}
  .tt-typing span:nth-child(3){animation-delay:.4s}
  @keyframes ttBlink{0%,80%,100%{opacity:.25}40%{opacity:1}}
  .tt-chat-inp-row{display:flex;gap:.5rem;padding:.8rem;border-top:1px solid rgba(255,255,255,.1);flex-shrink:0}
  .tt-chat-inp{flex:1;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.14);border-radius:50px;padding:.6rem 1rem;color:#fff;font-family:'Montserrat',sans-serif;font-size:.82rem;outline:none;transition:border-color .2s;min-width:0}
  .tt-chat-inp:focus{border-color:#FF2D8B}
  .tt-chat-inp::placeholder{color:rgba(255,255,255,.3)}
  .tt-chat-send{background:linear-gradient(135deg,#FF6B6B,#FF2D8B);border:none;color:#fff;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:.9rem;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:transform .2s;-webkit-tap-highlight-color:transparent}
  .tt-chat-send:hover{transform:scale(1.08)}
  @media(max-width:480px){.tt-chat{bottom:0;right:0;width:100vw;border-radius:20px 20px 0 0;height:min(520px,calc(100vh - 4.5rem))}}
  `;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]'); } catch (e) {}

  function saveHistory() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-40))); } catch (e) {}
  }

  /* ── The "brain" — swap this for a backend/AI call later ── */
  function getBotReply(text) {
    const t = text.toLowerCase();
    if (/\b(hour|open|close|schedule|when)\b/.test(t)) {
      return 'We\'re open Tuesday–Sunday, 9am–6pm (closed Mondays). 🕘';
    }
    if (/\b(deliver|delivery|ship|bring)\b/.test(t)) {
      return 'We deliver across Calgary for a small fee, or you can pick up for free at our bakery. You choose at checkout! 🚚';
    }
    if (/\b(price|cost|how much|cheap|expensive)\b/.test(t)) {
      return 'You can see all our prices on the Menu page 🍰 Custom cakes start at $40, pastries from $6. Everything is in CAD.';
    }
    if (/\b(custom|design|personali|birthday cake)\b/.test(t)) {
      return 'You can design your own cake on our "Design a Cake" page — pick the flavour, size, font and your message, and even see an AI preview! ✨ Custom cakes need 48–72 hrs notice.';
    }
    if (/\b(pay|payment|card|stripe|e-?transfer|google pay)\b/.test(t)) {
      return 'We accept card / Google Pay (secure checkout by Stripe) and Interac e-Transfer. 💳';
    }
    if (/\b(order|track|status|my purchase)\b/.test(t)) {
      return 'If you have an account, click the 👤 icon at the top to see your recent orders. For anything urgent call us at (403) 123-4567. 📦';
    }
    if (/\b(contact|phone|email|call|reach)\b/.test(t)) {
      return 'You can reach us at orders@tropicaltaste.ca or (403) 123-4567 — or use the form on our Contact page. 📞';
    }
    if (/\b(where|location|address|find you)\b/.test(t)) {
      return 'We\'re a home bakery in Calgary, Alberta 🇨🇦 — pickup details are shared when your order is confirmed.';
    }
    if (/\b(vegan|gluten|allerg|nut|dairy)\b/.test(t)) {
      return 'We have gluten-friendly options on some items (look for the GF tag on the menu). For allergies, please add a note at checkout or contact us directly — we take them seriously! 🌾';
    }
    if (/\b(hi|hello|hey|hola)\b/.test(t)) {
      return 'Hello! 👋 How can I help you today? You can ask me about our hours, delivery, prices, custom cakes or payments.';
    }
    if (/\b(thank|gracias|thx)\b/.test(t)) {
      return 'You\'re very welcome! 💛 Anything else I can help with?';
    }
    return 'I\'m still learning! 🤖 For that one, better ask a human: call (403) 123-4567 or email orders@tropicaltaste.ca. You can also ask me about hours, delivery, prices, custom cakes or payments.';
  }

  /* ── DOM ── */
  function build() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.innerHTML = `
      <button class="tt-chat-fab" id="ttChatFab" aria-label="Open chat">💬</button>
      <div class="tt-teaser" id="ttTeaser" role="status">
        Ask me anything 👋
        <button class="tt-teaser-x" id="ttTeaserX" aria-label="Dismiss">✕</button>
      </div>
      <div class="tt-chat" id="ttChat" role="dialog" aria-label="Chat with Tropical Taste">
        <div class="tt-chat-head" id="ttChatHead">
          <div class="tt-chat-ava">🌺</div>
          <div class="tt-chat-ttl">
            <div class="tt-chat-nm">Tropical Taste</div>
            <div class="tt-chat-st"><span class="tt-chat-dot"></span>Usually replies instantly</div>
          </div>
          <button class="tt-chat-btn" id="ttChatMin" aria-label="Minimize chat">—</button>
          <button class="tt-chat-btn" id="ttChatClose" aria-label="Close chat">✕</button>
        </div>
        <div class="tt-chat-body" id="ttChatBody"></div>
        <div class="tt-chat-inp-row">
          <input class="tt-chat-inp" id="ttChatInp" type="text" maxlength="300" placeholder="Type your question…" autocomplete="off">
          <button class="tt-chat-send" id="ttChatSend" aria-label="Send message">➤</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
  }

  function renderHistory() {
    const body = document.getElementById('ttChatBody');
    body.innerHTML = history.map(m => `<div class="tt-msg ${m.role}">${esc(m.text)}</div>`).join('');
    body.scrollTop = body.scrollHeight;
  }

  function addMsg(role, text) {
    history.push({ role, text });
    saveHistory();
    const body = document.getElementById('ttChatBody');
    const div = document.createElement('div');
    div.className = `tt-msg ${role}`;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function botRespond(userText) {
    const body = document.getElementById('ttChatBody');
    const typing = document.createElement('div');
    typing.className = 'tt-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(typing);
    body.scrollTop = body.scrollHeight;
    setTimeout(() => {
      typing.remove();
      addMsg('bot', getBotReply(userText));
    }, 700 + Math.random() * 500);
  }

  function openChat() {
    hideTeaser(false);
    const chat = document.getElementById('ttChat');
    chat.classList.add('open');
    chat.classList.remove('min');
    document.getElementById('ttChatFab').classList.add('hidden');
    if (history.length === 0) {
      addMsg('bot', 'Hi! 👋 Welcome to Tropical Taste. Ask me anything about our cakes, hours, delivery or payments!');
    } else {
      renderHistory();
    }
    document.getElementById('ttChatInp').focus();
  }

  function closeChat() {
    document.getElementById('ttChat').classList.remove('open', 'min');
    document.getElementById('ttChatFab').classList.remove('hidden');
  }

  function toggleMin() {
    document.getElementById('ttChat').classList.toggle('min');
  }

  function hideTeaser(remember) {
    document.getElementById('ttTeaser').classList.remove('on');
    if (remember) {
      try { sessionStorage.setItem(TEASER_KEY, '1'); } catch (e) {}
    }
  }

  function send() {
    const inp = document.getElementById('ttChatInp');
    const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    addMsg('user', text);
    botRespond(text);
  }

  function init() {
    build();
    document.getElementById('ttChatFab').addEventListener('click', openChat);
    document.getElementById('ttChatClose').addEventListener('click', e => { e.stopPropagation(); closeChat(); });
    document.getElementById('ttChatMin').addEventListener('click', e => { e.stopPropagation(); toggleMin(); });
    document.getElementById('ttChatHead').addEventListener('click', () => {
      const chat = document.getElementById('ttChat');
      if (chat.classList.contains('min')) chat.classList.remove('min');
    });
    document.getElementById('ttChatSend').addEventListener('click', send);
    document.getElementById('ttChatInp').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    document.getElementById('ttTeaserX').addEventListener('click', e => { e.stopPropagation(); hideTeaser(true); });
    document.getElementById('ttTeaser').addEventListener('click', openChat);

    let dismissed = false;
    try { dismissed = sessionStorage.getItem(TEASER_KEY) === '1'; } catch (e) {}
    if (!dismissed) {
      setTimeout(() => {
        if (!document.getElementById('ttChat').classList.contains('open')) {
          document.getElementById('ttTeaser').classList.add('on');
        }
      }, 1500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

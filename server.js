require('dotenv').config();
const express      = require('express');
const path         = require('path');
const crypto       = require('crypto');
const bcrypt       = require('bcryptjs');
const cookieParser = require('cookie-parser');
const db           = require('./db');
const { DELIVERY_FEE, PRODUCTS, CUSTOM_DESIGNS, lookupPrice } = require('./prices');

const app  = express();
const PORT     = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ── STRIPE SETUP ────────────────────────────────────────────
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe    = stripeKey ? require('stripe')(stripeKey) : null;

if (!stripe) {
  console.warn('⚠️  STRIPE_SECRET_KEY is missing — paste your keys in the .env file.');
  console.warn('    Online payments will be disabled until you do.');
}
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn('⚠️  STRIPE_WEBHOOK_SECRET is missing — webhook events will be rejected.');
  console.warn('    Run: stripe listen --forward-to localhost:3000/api/stripe-webhook');
}

// ── FAL.AI SETUP ────────────────────────────────────────────
const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) {
  console.warn('⚠️  FAL_KEY is missing — AI cake previews are disabled (canvas sketch fallback).');
  console.warn('    Get a key at https://fal.ai/dashboard/keys and paste it in .env');
}

// ── HELPERS ────────────────────────────────────────────────
function separator(char = '─', len = 48) {
  return char.repeat(len);
}

function logCartItem(item) {
  const total = (item.price * item.qty).toFixed(2);
  const ts    = new Date().toLocaleString('en-CA', { timeZone: 'America/Edmonton' });

  console.log('\n' + separator('═'));
  console.log('🛒  NEW ITEM ADDED TO CART');
  console.log(separator('─'));
  console.log(`  Timestamp : ${ts} (Calgary)`);
  console.log(`  Product   : ${item.name}`);
  console.log(`  Design    : ${item.design}`);
  console.log(`  Font      : ${item.font}`);
  console.log(`  Message   : ${item.message || '(none)'}`);
  console.log(`  Size      : ${item.sizeLabel}`);
  console.log(`  Unit price: $${item.price} CAD`);
  console.log(`  Quantity  : ${item.qty}`);
  console.log(`  Line total: $${total} CAD`);
  console.log(separator('═') + '\n');
}

function logPayment(title, lines) {
  const ts = new Date().toLocaleString('en-CA', { timeZone: 'America/Edmonton' });
  console.log('\n' + separator('═'));
  console.log(title);
  console.log(separator('─'));
  console.log(`  Timestamp : ${ts} (Calgary)`);
  lines.forEach(l => console.log(`  ${l}`));
  console.log(separator('═') + '\n');
}

// Prices are client-supplied for now (no product DB) — bounds keep abuse out.
function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) {
    return 'Cart must contain between 1 and 30 items';
  }
  for (const it of items) {
    if (typeof it.name !== 'string' || !it.name.trim() || it.name.length > 200) {
      return 'Each item needs a valid name';
    }
    if (typeof it.price !== 'number' || !isFinite(it.price) || it.price < 0.5 || it.price > 1000) {
      return 'Each item needs a price between $0.50 and $1000';
    }
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 20) {
      return 'Each item needs a quantity between 1 and 20';
    }
  }
  return null;
}

// Replace client-sent prices with the canonical ones from prices.js.
// Returns an error string if any item isn't a known product.
function repriceItems(items) {
  for (const it of items) {
    const canonical = lookupPrice(it.name);
    if (canonical === null) return `Unknown product: ${it.name}`;
    it.price = canonical;
  }
  return null;
}

// ── STRIPE WEBHOOK ─────────────────────────────────────────
// Registered BEFORE express.json() — signature verification needs the
// raw request body, not the parsed one.
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn('⚠️  Webhook signature verification FAILED:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      recordOrder({
        orderNumber: s.metadata.order_number,
        email:       s.customer_details?.email || s.customer_email,
        name:        s.metadata.customer_name,
        phone:       s.metadata.customer_phone,
        itemsJson:   JSON.stringify([{ summary: s.metadata.items_summary || '' }]),
        totalCents:  s.amount_total,
        method:      'stripe',
        status:      'paid',
      });
      logPayment('✅  PAYMENT SUCCESSFUL', [
        `Order #   : ${s.metadata.order_number || '(unknown)'}`,
        `Customer  : ${s.metadata.customer_name || '(unknown)'} <${s.customer_details?.email || s.customer_email}>`,
        `Phone     : ${s.metadata.customer_phone || '(unknown)'}`,
        `Fulfilment: ${s.metadata.delivery_mode || 'pickup'} · ${s.metadata.preferred_date || ''} ${s.metadata.preferred_time || ''}`,
        `Items     : ${s.metadata.items_summary || ''}`,
        `Total     : $${(s.amount_total / 100).toFixed(2)} ${s.currency.toUpperCase()}`,
        `Status    : ${s.payment_status}`,
      ]);
      break;
    }
    case 'checkout.session.expired': {
      const s = event.data.object;
      logPayment('⏰  CHECKOUT SESSION EXPIRED (abandoned)', [
        `Order #  : ${s.metadata.order_number || '(unknown)'}`,
        `Customer : ${s.customer_email || '(unknown)'}`,
      ]);
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi  = event.data.object;
      const err = pi.last_payment_error;
      logPayment('❌  PAYMENT FAILED', [
        `Amount  : $${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}`,
        `Reason  : ${err?.decline_code || err?.code || 'unknown'}`,
        `Message : ${err?.message || '(none)'}`,
      ]);
      break;
    }
    default:
      console.log(`ℹ️  Stripe event received: ${event.type}`);
  }

  res.json({ received: true });
});

// ── MIDDLEWARE ──────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// Block server-side files from being served publicly by express.static
app.use((req, res, next) => {
  const blocked = /^\/(data|node_modules)(\/|$)|^\/(server\.js|db\.js|prices\.js|package(-lock)?\.json|CLAUDE\.md)$/i;
  if (blocked.test(req.path)) return res.status(404).end();
  next();
});
app.use(express.static(path.join(__dirname)));   // serves index.html, menu.html, etc.

// ── ENDPOINTS ──────────────────────────────────────────────

// GET /api/prices — canonical price list for all pages
app.get('/api/prices', (req, res) => {
  res.json({
    success:       true,
    deliveryFee:   DELIVERY_FEE,
    products:      PRODUCTS,
    customDesigns: CUSTOM_DESIGNS,
  });
});

// GET /api/stripe-config — frontend fetches the publishable key from here
// so it never has to be hardcoded in the HTML.
app.get('/api/stripe-config', (req, res) => {
  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    return res.status(503).json({ success: false, error: 'Stripe is not configured on the server' });
  }
  res.json({ success: true, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// POST /api/create-checkout-session — creates an Embedded Checkout session
app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ success: false, error: 'Stripe is not configured on the server' });
  }
  try {
    const { items, customer, delivery } = req.body || {};

    const itemError = validateItems(items);
    if (itemError) return res.status(400).json({ success: false, error: itemError });
    const priceError = repriceItems(items);   // charge canonical prices, never client-sent ones
    if (priceError) return res.status(400).json({ success: false, error: priceError });
    if (!customer || typeof customer.email !== 'string' || !customer.email.includes('@')) {
      return res.status(400).json({ success: false, error: 'A valid customer email is required' });
    }

    const orderNumber = 'TT-' + Date.now().toString().slice(-6);

    const line_items = items.map(it => ({
      price_data: {
        currency: 'cad',
        product_data: { name: it.name.trim().slice(0, 200) },
        unit_amount: Math.round(it.price * 100),
      },
      quantity: it.qty,
    }));

    if (delivery?.mode === 'delivery') {
      line_items.push({
        price_data: {
          currency: 'cad',
          product_data: { name: 'Delivery — Calgary area' },
          unit_amount: DELIVERY_FEE * 100,
        },
        quantity: 1,
      });
    }

    const itemsSummary = items
      .map(it => `${it.qty}× ${it.name}`)
      .join(' · ')
      .slice(0, 490);   // Stripe metadata values max out at 500 chars

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: 'payment',
      line_items,
      customer_email: customer.email,
      metadata: {
        order_number:   orderNumber,
        customer_name:  (customer.name  || '').slice(0, 100),
        customer_phone: (customer.phone || '').slice(0, 30),
        delivery_mode:  delivery?.mode === 'delivery' ? 'delivery' : 'pickup',
        delivery_addr:  (delivery?.address || '').slice(0, 200),
        preferred_date: (delivery?.date  || '').slice(0, 20),
        preferred_time: (delivery?.time  || '').slice(0, 40),
        notes:          (delivery?.notes || '').slice(0, 490),
        items_summary:  itemsSummary,
      },
      return_url: `${BASE_URL}/cart.html?session_id={CHECKOUT_SESSION_ID}`,
    });

    console.log(`🧾  Checkout session created → order ${orderNumber} (${session.id})`);
    res.json({ success: true, clientSecret: session.client_secret });
  } catch (err) {
    console.error('❌  /api/create-checkout-session:', err.message);
    res.status(500).json({ success: false, error: 'Could not start checkout. Please try again.' });
  }
});

// GET /api/session-status — the return page calls this to confirm the payment
app.get('/api/session-status', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ success: false, error: 'Stripe is not configured on the server' });
  }
  try {
    const { session_id } = req.query;
    if (!session_id || typeof session_id !== 'string') {
      return res.status(400).json({ success: false, error: 'session_id is required' });
    }
    const session = await stripe.checkout.sessions.retrieve(session_id);
    // Also record here (idempotent) so history works even without the webhook CLI running
    if (session.status === 'complete' && session.payment_status === 'paid') {
      recordOrder({
        orderNumber: session.metadata.order_number,
        email:       session.customer_details?.email || session.customer_email,
        name:        session.metadata.customer_name,
        phone:       session.metadata.customer_phone,
        itemsJson:   JSON.stringify([{ summary: session.metadata.items_summary || '' }]),
        totalCents:  session.amount_total,
        method:      'stripe',
        status:      'paid',
      });
    }
    res.json({
      success:       true,
      status:        session.status,            // open | complete | expired
      paymentStatus: session.payment_status,    // paid | unpaid | no_payment_required
      orderNumber:   session.metadata.order_number || null,
      customerEmail: session.customer_details?.email || session.customer_email || null,
      amountTotal:   session.amount_total,
    });
  } catch (err) {
    console.error('❌  /api/session-status:', err.message);
    res.status(500).json({ success: false, error: 'Could not verify the session' });
  }
});

// ── AI CAKE PREVIEW (fal.ai · FLUX.1 schnell) ──────────────
// Attribute → prompt-fragment maps. To support a new option (e.g. a new
// flavour or a "color" attribute), add an entry here and include it in
// buildCakePrompt() — the endpoint validates against these keys automatically.
const PREVIEW_ATTRS = {
  design: {
    choco:  'strawberry and chocolate cake with dark chocolate sponge layers, pink strawberry buttercream, fresh glazed strawberries on top and a chocolate drip',
    velvet: 'red velvet cake with deep red sponge layers, smooth white cream cheese frosting, white piped rosettes and red velvet crumb sprinkles',
    carrot: 'carrot cake with spiced golden sponge layers, cream-colored frosting, small marzipan carrot decorations and toasted walnut pieces',
  },
  font: {
    elegant: 'refined italic serif lettering',
    playful: 'flowing cursive script lettering',
    modern:  'bold clean sans-serif lettering',
  },
  size: {
    '6"':  'small single-tier 6-inch',
    '8"':  'two-tier 8-inch',
    '10"': 'tall three-tier 10-inch',
  },
};

function buildCakePrompt({ design, font, sizeLabel, message }) {
  let prompt =
    `Professional studio photograph of an elegant artisan ${PREVIEW_ATTRS.size[sizeLabel]} ${PREVIEW_ATTRS.design[design]}. ` +
    `Smooth fondant finish, handcrafted details, soft diffused bakery lighting, medium shot, ` +
    `clean pastel studio background, high resolution, photorealistic, appetizing.`;
  if (message) {
    prompt += ` The message "${message}" is piped on the front of the cake in ${PREVIEW_ATTRS.font[font]}.`;
  }
  return prompt;
}

// Cheap in-memory cooldown so a stuck button or a bot can't burn credits
const previewCooldown = new Map();
const PREVIEW_COOLDOWN_MS = 8000;

// POST /api/generate-preview — builds the prompt server-side and calls fal.ai
app.post('/api/generate-preview', async (req, res) => {
  if (!FAL_KEY) {
    return res.status(503).json({ success: false, error: 'AI preview is not configured on the server' });
  }

  const last = previewCooldown.get(req.ip) || 0;
  if (Date.now() - last < PREVIEW_COOLDOWN_MS) {
    return res.status(429).json({ success: false, error: 'Please wait a few seconds between previews' });
  }

  const { design, font, sizeLabel, message } = req.body || {};
  if (!PREVIEW_ATTRS.design[design]) {
    return res.status(400).json({ success: false, error: 'Invalid cake design' });
  }
  if (!PREVIEW_ATTRS.font[font]) {
    return res.status(400).json({ success: false, error: 'Invalid font style' });
  }
  if (!PREVIEW_ATTRS.size[sizeLabel]) {
    return res.status(400).json({ success: false, error: 'Invalid cake size' });
  }
  // Strip quotes/newlines so user text can't break out of the prompt template
  const cleanMessage = typeof message === 'string'
    ? message.replace(/["“”«»'\r\n\t]/g, '').trim().slice(0, 30)
    : '';

  const prompt = buildCakePrompt({ design, font, sizeLabel, message: cleanMessage });
  previewCooldown.set(req.ip, Date.now());

  try {
    const falRes = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size: 'portrait_4_3',      // closest preset to the 400×480 preview panel
        num_inference_steps: 4,          // schnell is tuned for 1–4 steps
        num_images: 1,
        enable_safety_checker: true,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!falRes.ok) {
      const detail = await falRes.text();
      console.error(`❌  fal.ai responded ${falRes.status}:`, detail.slice(0, 300));
      return res.status(502).json({ success: false, error: 'The image service is unavailable right now' });
    }

    const data = await falRes.json();
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) {
      console.error('❌  fal.ai returned no image:', JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ success: false, error: 'No image was generated. Please try again.' });
    }

    console.log(`🎨  AI preview generated (${design} · ${sizeLabel})`);
    console.log(`    Prompt: ${prompt}`);
    console.log(`    Image : ${imageUrl}`);
    res.json({ success: true, imageUrl, prompt });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    console.error('❌  /api/generate-preview:', err.message);
    res.status(502).json({
      success: false,
      error: timedOut ? 'Image generation took too long. Please try again.' : 'Could not generate the preview.',
    });
  }
});

// ── AUTH & USERS ───────────────────────────────────────────
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;   // 30 days
const BCRYPT_ROUNDS  = 12;
const ADMIN_EMAIL    = (process.env.ADMIN_EMAIL || 'admin@tropicaltaste.ca').toLowerCase();

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email,
    phone: u.phone || '', address: u.address || '',
    isAdmin: u.email === ADMIN_EMAIL,
  };
}

function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)')
    .run(token, userId, Date.now() + SESSION_TTL_MS);
  res.cookie('tt_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   SESSION_TTL_MS,
  });
}

function getSessionUser(req) {
  const token = req.cookies?.tt_session;
  if (!token) return null;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  return db.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
  ).get(token, Date.now()) || null;
}

function requireAuth(req, res) {
  const user = getSessionUser(req);
  if (!user) res.status(401).json({ success: false, error: 'Not signed in' });
  return user;
}

// Find-or-create a profile by email. Guests (purchases without an account)
// get is_guest=1 and no password; registering later upgrades the same row,
// so their order history is kept.
function findOrCreateUserByEmail(email, name = '', phone = '') {
  const em = email.trim().toLowerCase();
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(em);
  if (!user) {
    const info = db.prepare('INSERT INTO users (email, name, phone, is_guest) VALUES (?,?,?,1)')
      .run(em, name, phone);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  return user;
}

function recordOrder({ orderNumber, email, name, phone, itemsJson, totalCents, method, status }) {
  if (!orderNumber || !email) return;
  const user = findOrCreateUserByEmail(email, name, phone);
  db.prepare(
    'INSERT OR IGNORE INTO orders (order_number, user_id, items, total_cents, payment_method, status) VALUES (?,?,?,?,?,?)'
  ).run(orderNumber, user.id, itemsJson || '[]', totalCents || 0, method, status);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple login throttle: 10 attempts per IP per 10 minutes
const loginAttempts = new Map();
function loginThrottled(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { count: 0, resetAt: now + 600000 };
  if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + 600000; }
  rec.count++;
  loginAttempts.set(ip, rec);
  return rec.count > 10;
}

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) {
      return res.status(400).json({ success: false, error: 'Please enter your name (2–100 characters)' });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.length > 200) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 100) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const em = email.trim().toLowerCase();
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(em);
    if (existing && existing.password_hash) {
      return res.status(409).json({ success: false, error: 'This email already has an account. Try signing in.' });
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let userId;
    if (existing) {
      // Guest profile exists from a past purchase — upgrade it, keep history
      db.prepare('UPDATE users SET name = ?, password_hash = ?, is_guest = 0 WHERE id = ?')
        .run(name.trim(), hash, existing.id);
      userId = existing.id;
    } else {
      userId = db.prepare('INSERT INTO users (email, name, password_hash, is_guest) VALUES (?,?,?,0)')
        .run(em, name.trim(), hash).lastInsertRowid;
    }

    createSession(userId, res);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    console.log(`👤  New account: ${user.name} <${user.email}>${existing ? ' (upgraded from guest)' : ''}`);
    res.status(201).json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error('❌  /api/auth/register:', err.message);
    res.status(500).json({ success: false, error: 'Could not create the account' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    if (loginThrottled(req.ip)) {
      return res.status(429).json({ success: false, error: 'Too many attempts. Try again in a few minutes.' });
    }
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    const ok = user?.password_hash && await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, error: 'Incorrect email or password' });
    }
    createSession(user.id, res);
    res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error('❌  /api/auth/login:', err.message);
    res.status(500).json({ success: false, error: 'Could not sign in' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.tt_session;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie('tt_session');
  res.json({ success: true });
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Not signed in' });
  res.json({ success: true, user: publicUser(user) });
});

// GET /api/me/cart — the signed-in user's saved cart
app.get('/api/me/cart', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const row = db.prepare('SELECT items FROM carts WHERE user_id = ?').get(user.id);
  res.json({ success: true, items: row ? JSON.parse(row.items) : [] });
});

// PUT/POST /api/me/cart — save the cart (POST also accepts sendBeacon on page exit)
function saveUserCart(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  const items = Array.isArray(req.body?.items) ? req.body.items : (Array.isArray(req.body) ? req.body : null);
  if (!items || items.length > 50) {
    return res.status(400).json({ success: false, error: 'Invalid cart payload' });
  }
  db.prepare(`
    INSERT INTO carts (user_id, items, updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET items = excluded.items, updated_at = CURRENT_TIMESTAMP
  `).run(user.id, JSON.stringify(items).slice(0, 100000));
  res.json({ success: true });
}
app.put('/api/me/cart', saveUserCart);
app.post('/api/me/cart', saveUserCart);

// GET /api/me/orders — the signed-in user's purchase history
app.get('/api/me/orders', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const rows = db.prepare(
    'SELECT order_number, items, total_cents, payment_method, status, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20'
  ).all(user.id);
  res.json({
    success: true,
    orders: rows.map(r => ({
      orderNumber: r.order_number,
      items:       JSON.parse(r.items),
      totalCents:  r.total_cents,
      method:      r.payment_method,
      status:      r.status,
      date:        r.created_at,
    })),
  });
});

// ── ADMIN ──────────────────────────────────────────────────
function requireAdmin(req, res) {
  const user = getSessionUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return null;
  }
  return user;
}

// GET /api/admin/orders — every order with customer info, newest first
app.get('/api/admin/orders', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const rows = db.prepare(`
    SELECT o.order_number, o.items, o.total_cents, o.payment_method, o.status,
           o.fulfillment, o.created_at,
           u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone, u.is_guest
    FROM orders o JOIN users u ON u.id = o.user_id
    ORDER BY o.id DESC
  `).all();
  res.json({
    success: true,
    orders: rows.map(r => ({
      orderNumber:   r.order_number,
      items:         JSON.parse(r.items),
      totalCents:    r.total_cents,
      method:        r.payment_method,
      paymentStatus: r.status,
      fulfillment:   r.fulfillment,
      date:          r.created_at,
      customer: {
        name:    r.customer_name,
        email:   r.customer_email,
        phone:   r.customer_phone || '',
        isGuest: !!r.is_guest,
      },
    })),
  });
});

// PATCH /api/admin/orders/:orderNumber — move an order through the workflow
const FULFILLMENT_STATES = ['new', 'in_progress', 'delivered', 'cancelled'];
app.patch('/api/admin/orders/:orderNumber', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { fulfillment } = req.body || {};
  if (!FULFILLMENT_STATES.includes(fulfillment)) {
    return res.status(400).json({ success: false, error: `fulfillment must be one of: ${FULFILLMENT_STATES.join(', ')}` });
  }
  const info = db.prepare('UPDATE orders SET fulfillment = ? WHERE order_number = ?')
    .run(fulfillment, req.params.orderNumber);
  if (info.changes === 0) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }
  console.log(`🛠️   Admin: order ${req.params.orderNumber} → ${fulfillment}`);
  res.json({ success: true });
});

// POST /api/orders — records e-Transfer orders (guest or signed in);
// creates a guest profile for unknown emails so history is kept either way
app.post('/api/orders', (req, res) => {
  try {
    const { customer, items, delivery } = req.body || {};
    const itemError = validateItems(items);
    if (itemError) return res.status(400).json({ success: false, error: itemError });
    const priceError = repriceItems(items);   // charge canonical prices, never client-sent ones
    if (priceError) return res.status(400).json({ success: false, error: priceError });
    if (!customer || typeof customer.email !== 'string' || !EMAIL_RE.test(customer.email.trim())) {
      return res.status(400).json({ success: false, error: 'A valid email is required' });
    }

    const subtotalCents = items.reduce((s, it) => s + Math.round(it.price * 100) * it.qty, 0);
    const totalCents    = subtotalCents + (delivery?.mode === 'delivery' ? DELIVERY_FEE * 100 : 0);
    const orderNumber   = 'TT-' + Date.now().toString().slice(-6);

    recordOrder({
      orderNumber,
      email:      customer.email,
      name:       (customer.name  || '').slice(0, 100),
      phone:      (customer.phone || '').slice(0, 30),
      itemsJson:  JSON.stringify(items).slice(0, 100000),
      totalCents,
      method:     'etransfer',
      status:     'pending',
    });

    logPayment('📲  E-TRANSFER ORDER PLACED (awaiting payment)', [
      `Order #  : ${orderNumber}`,
      `Customer : ${customer.name || ''} <${customer.email}>`,
      `Total    : $${(totalCents / 100).toFixed(2)} CAD`,
    ]);
    res.status(201).json({ success: true, orderNumber, totalCents });
  } catch (err) {
    console.error('❌  /api/orders:', err.message);
    res.status(500).json({ success: false, error: 'Could not record the order' });
  }
});

// POST /api/cart
// Receives a cake customiser item when the user clicks "Add to Cart"
app.post('/api/cart', (req, res) => {
  const item = req.body;

  if (!item || !item.name || !item.price) {
    console.warn('⚠️  /api/cart received an incomplete payload:', item);
    return res.status(400).json({ success: false, error: 'Incomplete item data' });
  }

  logCartItem(item);

  res.status(200).json({
    success : true,
    message : 'Item received by server',
    received: item,
  });
});

// ── ERROR MIDDLEWARE (must be last) ────────────────────────
app.use((err, req, res, next) => {
  console.error('❌  Unhandled error:', err);
  res.status(err.status || 500).json({ success: false, error: 'Internal server error' });
});

// ── START ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(separator('═'));
  console.log('🌺  Tropical Taste backend is running');
  console.log(separator('─'));
  console.log(`  Local site : ${BASE_URL}`);
  console.log(`  Cart API   : POST ${BASE_URL}/api/cart`);
  console.log(`  Checkout   : POST ${BASE_URL}/api/create-checkout-session`);
  console.log(`  Webhook    : POST ${BASE_URL}/api/stripe-webhook`);
  console.log(`  AI preview : POST ${BASE_URL}/api/generate-preview`);
  console.log(`  Stripe     : ${stripe ? '✅ configured (' + (stripeKey.startsWith('sk_test') ? 'TEST mode' : 'LIVE mode') + ')' : '❌ keys missing in .env'}`);
  console.log(`  fal.ai     : ${FAL_KEY ? '✅ configured (FLUX.1 schnell)' : '❌ FAL_KEY missing in .env'}`);
  console.log(`  Database   : ✅ SQLite (data/tropical.db) — users: ${db.prepare('SELECT COUNT(*) n FROM users').get().n}, orders: ${db.prepare('SELECT COUNT(*) n FROM orders').get().n}`);
  console.log(separator('─'));
  console.log('  Waiting for requests...');
  console.log(separator('═') + '\n');
});

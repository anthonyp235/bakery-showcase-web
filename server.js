require('dotenv').config();
const express = require('express');
const path    = require('path');

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
app.use(express.static(path.join(__dirname)));   // serves index.html, menu.html, etc.

// ── ENDPOINTS ──────────────────────────────────────────────

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
          unit_amount: 1000,
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
  console.log(separator('─'));
  console.log('  Waiting for requests...');
  console.log(separator('═') + '\n');
});

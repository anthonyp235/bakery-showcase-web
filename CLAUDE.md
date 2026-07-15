# Tropical Taste — Project Guide for Claude

## Project Overview
**Tropical Taste** is a Latin pastry e-commerce website targeting the Calgary, Alberta market.
- Language: **English only** (target audience is Calgary, AB)
- Business type: Home/small bakery — custom cakes, Latin pastries, party packages
- Owner contact: orders@tropicaltaste.ca | (403) 123-4567
- Hours: Tuesday–Sunday, 9am–6pm (Monday closed)
- Advance order policy: 48–72 hrs for custom cakes; 5–7 days for events

---

## Tech Stack
- **Pure HTML5 + CSS3 + Vanilla JS** — no frameworks, no build tools on the frontend
- **Google Fonts** (Playfair Display, Dancing Script, Montserrat, Pacifico) — loaded via CDN
- **HTML5 Canvas API** — for the live cake preview in customize.html
- **localStorage** — cart persistence across pages (key: `tt_cart`)
- **Node.js + Express** (`server.js`) — serves static files + handles API endpoints
  - Start: `npm start` (production) or `npm run dev` (nodemon, auto-restart)
  - Access site at `http://localhost:3000` — do NOT open HTML files directly
- **Stripe Embedded Checkout** — real card / Google Pay payments (test mode)
  - Keys live in `.env` (gitignored); `.env.example` is the committed template
  - Webhook signature verified with `STRIPE_WEBHOOK_SECRET`
- **dotenv** — loads `.env` into `process.env` at server start
- **fal.ai (FLUX.1 schnell)** — AI cake preview images via `POST /api/generate-preview`
  - Key in `.env` (`FAL_KEY`); prompt template + attribute maps live in `server.js` (`PREVIEW_ATTRS`)
  - Called with plain `fetch` to `https://fal.run/fal-ai/flux/schnell` — no SDK dependency
- **SQLite via better-sqlite3@11** (v11 pinned: v12 has no Node 20 prebuilds) — `db.js` creates `data/tropical.db` (gitignored)
  - Tables: `users`, `sessions`, `carts`, `orders` — `interests` / `important_dates` are JSON columns reserved for future use
- **Auth**: bcryptjs (cost 12) + random-token sessions in DB + `tt_session` httpOnly cookie (30 days, SameSite=Lax)
  - Shared widget `account.js` (included on every page) injects the 👤 icon + dropdown into `.nav-right`, handles sign in/out, shows order history, syncs cart, prefills checkout

---

## File Structure
```
mi-proyecto-ia/
├── server.js        # Express backend — static files + cart API + Stripe checkout/webhook
├── package.json     # Node.js project config (express, stripe, dotenv, nodemon)
├── .env             # Stripe keys + config — NEVER commit (gitignored)
├── .env.example     # Committed template for .env
├── .gitignore       # node_modules, .env
├── node_modules/    # Dependencies (gitignored)
├── index.html       # Landing page: hero, featured items, customizer promo, gallery, reviews, accordion
├── menu.html        # Full menu with tabs (Custom Cakes / Latin Classics / Pastries / Party Packs)
├── customize.html   # Cake designer: canvas preview + add to cart → POST /api/cart
├── contact.html     # Contact cards, hours, inquiry form, FAQ accordion
├── cart.html        # Cart management + 4-step guest checkout
├── register.html    # Create-account page
├── admin.html       # Admin order dashboard (needs ADMIN_EMAIL account)
├── account.js       # Shared auth widget: 👤 icon/dropdown, login, orders, cart sync
├── db.js            # SQLite setup + schema (users, sessions, carts, orders)
├── data/            # tropical.db lives here — gitignored
└── CLAUDE.md        # This file
```

---

## Design System

### CSS Variables (defined in each file's `:root`)
```css
--coral:    #FF6B6B   /* Primary CTA, hover states */
--pink:     #FF2D8B   /* Gradient endpoints, active states */
--purple:   #7C3AED   /* Mid-gradient, accents */
--teal:     #0D9488   /* Gallery section, success states */
--golden:   #F59E0B   /* Prices, highlights, stars */
--f-elegant: 'Playfair Display', serif
--f-play:    'Dancing Script', cursive
--f-mod:     'Montserrat', sans-serif
--f-logo:    'Pacifico', cursive
```

### Color Gradient Strategy (page sections, top to bottom)
- Hero: `#FF6B6B → #FF2D8B → #7C3AED → #2D0B6E`
- Features strip: `#5B21B6 → #3730A3`
- Customizer / Featured: deep purple dark
- Gallery: teal-to-green dark
- Reviews / Accordion: near-black with color tint
- Footer: `#0c0020 → #040408`

### Typography
- Headings: Playfair Display (elegant/editorial feel)
- Body: Montserrat (clean, modern)
- Logo + display: Pacifico
- Cake text (canvas only): Dancing Script / Playfair / Montserrat

### Component Patterns
- **Buttons**: `.btn-white`, `.btn-outline`, `.btn-pink`, `.btn-ghost` — all 50px border-radius
- **Cards**: `rgba(255,255,255,.04)` background + `rgba(255,255,255,.1)` border + `border-radius:20px`
- **Inputs**: `rgba(255,255,255,.06)` bg + `1.5px` border + focus color `var(--pink)`
- **Toast notifications**: fixed bottom-center, slide up/down, 3s auto-dismiss
- **Reveal on scroll**: `.reveal` class → `.reveal.on` via IntersectionObserver pattern
- **Accordion**: `addEventListener('click')` — never inline `onclick` (breaks on mobile touch)

---

## Cart System
- **Storage key**: `tt_cart` in `localStorage`
- **Item schema**:
  ```js
  {
    id:      Number,   // Date.now()
    type:    String,   // 'custom' | 'premade'
    name:    String,   // e.g. "Strawberry & Chocolate Cake (8\")"
    emoji:   String,   // display emoji
    details: String,   // e.g. "Font: Elegant · \"Happy Birthday!\""
    price:   Number,   // unit price in CAD
    qty:     Number    // quantity
  }
  ```
- **Badge update**: every page reads localStorage on load and calls `updateBadge()`
- **Cart badge** in navbar links to `cart.html` (no drawer on sub-pages)
- **Checkout flow** (cart.html): 4 steps — Cart → Details → Payment → Review → Success
- **Signed-in sync**: `account.js` merges localStorage ⇄ `carts` table on page load (dedup by item `id`), pushes on `pagehide` via sendBeacon; after checkout success `window.ttPushCartOnly` forces push-only so purchased items don't resurrect from the server copy

---

## Users & Auth
- **Endpoints**: `POST /api/auth/register|login|logout`, `GET /api/auth/me`, `GET|PUT /api/me/cart`, `GET /api/me/orders`, `POST /api/orders` (e-transfer/guest orders)
- **Duplicate prevention**: `users.email` UNIQUE (lowercased); registering an email that already has a password → 409
- **Guest history**: any purchase (Stripe webhook/verify or e-transfer) does find-or-create by email with `is_guest=1`; if that person registers later the SAME row is upgraded (password set, `is_guest=0`) so past orders survive
- **Orders recorded**: Stripe → in webhook AND in `/api/session-status` (idempotent via UNIQUE order_number); e-transfer → `POST /api/orders` (status `pending`)
- **Login throttle**: 10 attempts / 10 min per IP (in-memory)
- **Static blocklist**: middleware 404s `/data/*`, `/node_modules/*`, `server.js`, `db.js`, `package*.json`, `CLAUDE.md` — keep it updated when adding server-side files

---

## Admin Panel (admin.html)
- **Access**: the account whose email equals `ADMIN_EMAIL` in `.env` (default `admin@tropicaltaste.ca`) — register that email normally, then the 👤 dropdown shows a "🛠️ Admin Panel" link; `publicUser()` exposes `isAdmin`
- **Endpoints**: `GET /api/admin/orders` (all orders + customer join), `PATCH /api/admin/orders/:orderNumber` `{fulfillment}` — both 403 for non-admins
- **Workflow column**: `orders.fulfillment` = `new → in_progress → delivered | cancelled` (separate from payment `status`); added via PRAGMA migration in db.js
- **Sections**: New/Unreviewed · In Progress · Completed (delivered + cancelled greyed out)
- **Per-order actions** (⚙️ Actions toggle): email/call customer (mailto/tel), start (→ in_progress), confirm delivered, cancel (two-click confirm), reopen/restore
- **Auto-refresh**: every 30s + manual ↻ button; shows totals + paid revenue in toolbar

---

## Cake Customizer (customize.html + index.html teaser)
- **3 designs**: Strawberry & Chocolate (`choco`), Red Velvet (`velvet`), Carrot Cake (`carrot`)
- **3 fonts**: Elegant (Playfair Display italic), Playful (Dancing Script), Modern (Montserrat 900)
- **3 sizes**: 6" ($45), 8" ($65), 10" ($85) — prices vary slightly by design
- **Canvas**: 400×480px — drawn with 2D Canvas API (tiers, frosting, decorations, candles, text)
- **AI preview (real)**: "Generate Preview" button → `POST /api/generate-preview` with `{design, font, sizeLabel, message}` → server validates against `PREVIEW_ATTRS` whitelist, builds the English prompt template, calls fal.ai FLUX.1 schnell (4 steps, `portrait_4_3`) → returns `imageUrl` → `<img id="aiPreview">` replaces the canvas
- **Fallback**: any error (no FAL_KEY, timeout, rate limit) falls back to the canvas sketch + toast
- **Cost guard**: 8s per-IP cooldown on the endpoint; user message is sanitized (quotes/newlines stripped, 30 chars max) before entering the prompt
- **Extending attributes**: add an entry to `PREVIEW_ATTRS` in server.js and reference it in `buildCakePrompt()` — validation is automatic

---

## Payment Methods
1. **Interac e-Transfer** (manual) → user sends to `orders@tropicaltaste.ca`, uploads screenshot optionally; order confirmed locally without server payment
2. **Card / Google Pay via Stripe Embedded Checkout** (real, test mode):
   - Flow: Review step → "Place My Order" → `POST /api/create-checkout-session` → embedded form mounts in `#stripeCheckout` → Stripe redirects to `cart.html?session_id={CHECKOUT_SESSION_ID}` → `GET /api/session-status` verifies `status: complete` + `paymentStatus: paid` → success panel with order number (`TT-xxxxxx`, stored in session metadata) → cart cleared
   - Declines (insufficient funds, invalid card, etc.) are shown inline by Stripe's form; the backend also logs `payment_intent.payment_failed` with the decline code via webhook
   - Webhook `POST /api/stripe-webhook` uses `express.raw()` and MUST stay registered before `express.json()`
   - Server endpoints: `GET /api/stripe-config`, `POST /api/create-checkout-session`, `GET /api/session-status`, `POST /api/stripe-webhook`
   - ⚠️ Prices are still client-supplied (validated with bounds only) — move to a server-side price table before going live

---

## Responsive Breakpoints
- `≤900px`: Two-column layouts collapse to single column
- `≤768px`: Navbar collapses to hamburger; accordion nav renders; section padding reduces
- `≤480px`: Cake options / font options / size options stack vertically; CTA buttons stack

---

## What's Working (Front-end Complete)
- [x] Full responsive design with gradient scroll effect
- [x] Animated hero with floating emoji particles
- [x] Live canvas cake preview (design + font + text + candles + decorations)
- [x] Cart system with localStorage persistence across all 5 pages
- [x] Menu with tabs, size modal, add-to-cart
- [x] 4-step guest checkout with 3 payment method UIs
- [x] Contact form + FAQ accordion + business hours with today highlight
- [x] Scroll-reveal animations
- [x] Mobile hamburger menu (all pages)
- [x] Toast notifications

---

## What's NOT Yet Implemented (Pending)
- [x] ~~Real payment processing~~ — **DONE**: Stripe Embedded Checkout (test mode); switch to live keys when ready
- [ ] **Server-side price table** — checkout session prices come from the client; validate against a canonical product list before going live
- [x] ~~Order persistence~~ — **DONE**: SQLite (`orders` table), recorded from Stripe webhook + session verification + e-transfer endpoint
- [x] ~~User accounts~~ — **DONE**: register/login/logout, per-user cart + order history, guest profiles by email
- [ ] **E-transfer file upload** — needs a backend endpoint to receive files
- [x] ~~Real AI image generation~~ — **DONE**: fal.ai FLUX.1 schnell; canvas remains as fallback
- [ ] **Order confirmation emails** — needs SMTP (e.g. SendGrid, Resend); trigger from `checkout.session.completed` webhook
- [x] ~~Admin panel~~ — **DONE**: admin.html with sections, workflow states, contact actions
- [ ] **Real gallery** — currently using emoji placeholders instead of actual photos
- [ ] **Google Maps embed** — placeholder box, not a real map
- [ ] **Product photos** — all product cards use emoji, need real food photography
- [ ] **Promo codes** — input exists in cart but has no logic
- [ ] **Input sanitization / form validation** — basic required-field checks only

---

## Proposed Improvements (Bring Up When Relevant)

### UX / Features
- **Search bar** on menu.html for quick item lookup
- **Allergen filter** on menu (GF, nut-free, dairy-free toggle)
- **Cake gallery modal** — clicking a gallery card opens a lightbox
- **WhatsApp order button** — floating button that pre-fills a WhatsApp message with the cart summary
- **Instagram feed embed** — show real @TropicalTasteYYC posts in the gallery section
- **Estimated delivery time** — show "Ready by [date]" based on current date + 48hrs
- **Order tracking page** — simple status page (Received → Preparing → Ready → Delivered)
- **Multilingual toggle** (EN / ES) — Latin community in Calgary is Spanish-speaking; consider adding Spanish

### Technical
- **Shared navbar/footer as include** — currently copy-pasted across 5 files; a lightweight JS include or a build step (e.g. Vite) would reduce maintenance cost
- **CSS custom property consolidation** — `:root` variables are repeated in every file; extract to a single `styles.css`
- **Form validation library** — consider a small validation library or native `constraint validation API` for better UX
- **Service Worker / PWA** — make the site installable and work offline (cache assets)
- **Image optimization** — when real photos are added, use WebP + lazy loading
- **Meta tags / OG tags** — add Open Graph, Twitter card, and local SEO meta tags
- **Structured data (JSON-LD)** — add `LocalBusiness` schema for Google search visibility
- **Accessibility** — add `aria-label`, `aria-expanded` on accordions, `role="dialog"` on modals, skip-to-content link

### Security (When Adding a Backend)
- Never store card data — use Stripe Elements / tokenization only
- File uploads (e-transfer proof) must validate MIME type server-side, not just file extension
- Rate-limit the contact form and order endpoint to prevent spam
- Sanitize all user inputs server-side before storing or emailing
- Use HTTPS everywhere (mandatory for payment flows)
- Set `Content-Security-Policy` headers when deploying

---

## Coding Conventions
- **No inline `onclick`** — always use `addEventListener` (mobile touch compatibility)
- **No comments** unless the WHY is non-obvious
- **CSS**: keep class names short and semantic (`.acc-hdr`, `.ci-ico`, `.pay-m`)
- **JS**: keep functions small and named after what they do (`renderCart`, `goToStep`, `selectPay`)
- **No frameworks** unless the complexity clearly warrants one — keep it vanilla
- **Toast for feedback** — use `showToast(emoji, message)` for all user-facing confirmations
- **localStorage** — always `JSON.parse(localStorage.getItem('tt_cart') || '[]')` defensively

---

## Priority Order for Next Steps (Suggested)
1. Real product photos (biggest visual impact)
2. Backend + email notifications (makes it actually functional for orders)
3. Stripe payment integration (revenue-critical)
4. Real AI cake preview (differentiator feature)
5. Admin order dashboard
6. SEO / meta tags / Google Business Profile

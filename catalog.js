// ── Inventory service ──────────────────────────────────────
// The products table in SQLite is the source of truth for the catalog.
// prices.js is used ONLY to seed the table the first time (or after the
// DB file is deleted); after that, edit everything in the admin panel.

const db = require('./db');
const { DELIVERY_FEE, PRODUCTS, CUSTOM_DESIGNS } = require('./prices');

const CATEGORIES = ['cakes', 'classics', 'pastries', 'packs'];

// Menu metadata for the initial seed (mirrors what menu.html shipped with)
const SEED_META = {
  'Strawberry & Chocolate Cake': { category: 'cakes', emoji: '🍓🍫', badge: '', description: 'Rich chocolate layers with fresh strawberry filling, chocolate drip and cream cheese frosting.', tags: ['Bestseller', 'Custom text'], serves: { '6"': 'Serves 8–10', '8"': 'Serves 15–20', '10"': 'Serves 25–30' } },
  'Red Velvet Cake':             { category: 'cakes', emoji: '🍰', badge: 'Popular', description: 'Velvety red layers with signature cream cheese frosting and a dusting of red velvet crumbles.', tags: ['Most loved', 'Custom text'], serves: { '6"': 'Serves 8–10', '8"': 'Serves 15–20', '10"': 'Serves 25–30' } },
  'Carrot Cake':                 { category: 'cakes', emoji: '🥕', badge: '', description: 'Warmly spiced carrot cake with walnuts, finished with cream cheese rosettes and carrot decorations.', tags: ['Seasonal fav.', 'Custom text'], serves: { '6"': 'Serves 8–10', '8"': 'Serves 15–20', '10"': 'Serves 25–30' } },
  'Tres Leches Cake':            { category: 'cakes', emoji: '🍮', badge: 'New', description: 'Classic sponge soaked in three milks, topped with lightly sweetened whipped cream. Irresistible.', tags: ['Latin classic', 'Gluten option'], serves: { '8"': 'Serves 10–14', '10"': 'Serves 18–24' } },
  'Quinceañera Cake':            { category: 'cakes', emoji: '🎀', badge: '', description: 'Elegant multi-tier showstopper for your quinceañera. Custom colours, flowers and personalised topper.', tags: ['Special order', 'Contact us'], serves: { '2-tier': 'Serves 30–40', '3-tier': 'Serves 60+' } },
  'Custom Theme Cake':           { category: 'cakes', emoji: '✨', badge: '', description: 'Tell us your vision — superhero, floral, sports, Disney and more. Fully custom design.', tags: ['Fully custom', 'Contact for quote'], serves: { '8"': 'Serves 15–20', '10"': 'Serves 25–30' } },
  'Tres Leches':      { category: 'classics', emoji: '🍮', badge: '', description: 'Three-milk soaked sponge with whipped cream. The Latin dessert staple.', tags: ['Traditional'], serves: { 'Small tray': 'Serves 6–8', 'Large tray': 'Serves 12–16' } },
  'Flan de Caramelo': { category: 'classics', emoji: '🍯', badge: '', description: 'Silky smooth caramel custard baked in a water bath. Classic and comforting.', tags: ['Traditional', 'GF'], serves: { 'Individual': '1 serving', 'Family (8 pc)': '8 servings' } },
  'Pionono Roll':     { category: 'classics', emoji: '🌀', badge: '', description: 'Swiss-roll style sponge with dulce de leche filling, rolled and dusted with powdered sugar.', tags: ['Argentine', 'Sweet'], serves: { 'Full roll': 'Serves 8–10' } },
  'Brazo Gitano':     { category: 'classics', emoji: '🎂', badge: '', description: 'Light sponge roll filled with cream and topped with meringue. A Venezuelan classic.', tags: ['Venezuelan'], serves: { 'Full roll': 'Serves 8–10' } },
  'Budín de Pan':     { category: 'classics', emoji: '🍞', badge: '', description: 'Latin bread pudding with raisins and vanilla sauce. Warm, comforting and delicious.', tags: ['Comfort food', 'Warm'], serves: { 'Family tray': 'Serves 8–10' } },
  'Arroz con Leche':  { category: 'classics', emoji: '🍚', badge: '', description: 'Creamy rice pudding with cinnamon and condensed milk — served chilled.', tags: ['Dairy', 'GF'], serves: { 'Individual cup': '1 serving', 'Family jar (6)': '6 servings' } },
  'Cupcakes':          { category: 'pastries', emoji: '🧁', badge: 'Bestseller', description: 'Assorted flavours with signature Tropical Taste frosting. Perfect for parties or gifting.', tags: ['Customisable'], serves: { '6 pack': '6 cupcakes', '12 pack': '12 cupcakes', '24 pack': '24 cupcakes' } },
  'Churros':           { category: 'pastries', emoji: '🍩', badge: '', description: 'Crispy golden churros dusted with cinnamon sugar. Served with chocolate dipping sauce.', tags: ['Fried', 'Shareable'], serves: { '4 pack': '4 churros', '8 pack': '8 churros' } },
  'Alfajores':         { category: 'pastries', emoji: '🍪', badge: '', description: 'Melt-in-your-mouth shortbread cookies sandwiched with dulce de leche and rolled in coconut.', tags: ['Argentine', 'Cookies'], serves: { '4 pack': '4 pieces', '8 pack': '8 pieces' } },
  'Empanadas (Sweet)': { category: 'pastries', emoji: '🥐', badge: '', description: 'Flaky pastry filled with cream cheese & guava, apple cinnamon, or Nutella.', tags: ['Sweet', 'Baked'], serves: { '3 pack': '3 pieces', '6 pack': '6 pieces' } },
  'Tequeños':          { category: 'pastries', emoji: '🧀', badge: '', description: 'Venezuelan cheese-filled dough sticks — crispy outside, gooey inside. Party favourite.', tags: ['Venezuelan', 'Shareable'], serves: { '8 pack': '8 pieces', '16 pack': '16 pieces' } },
  'Mantecadas':        { category: 'pastries', emoji: '🍰', badge: '', description: 'Traditional Latin butter muffins — moist, rich and fragrant with vanilla.', tags: ['Traditional', 'Muffins'], serves: { '6 pack': '6 muffins', '12 pack': '12 muffins' } },
  'Birthday Party Pack':     { category: 'packs', emoji: '🎉', badge: 'Best Value', description: '1 × 8" custom cake + 12 cupcakes + 8 churros. Everything for a perfect birthday.', tags: ['Savings bundle', 'Customisable'], serves: { 'Standard': 'Serves 20–25' } },
  'Office Celebration Pack': { category: 'packs', emoji: '🏢', badge: '', description: '2 trays of tres leches + 24 cupcakes + 16 alfajores. Great for workplace celebrations.', tags: ['Office', 'Shareable'], serves: { 'Standard': 'Serves 25–30' } },
  'Quinceañera Package':     { category: 'packs', emoji: '🎀', badge: 'Premium', description: '3-tier quinceañera cake + 50 cupcakes + 2 trays of tequeños. The complete fiesta package.', tags: ['Special event', 'Contact required'], serves: { 'Full package': 'Serves 60+' } },
  'Sweet Table Package':     { category: 'packs', emoji: '🍭', badge: '', description: 'Assorted dessert table: tres leches, alfajores, empanadas, flan, mantecadas and cupcakes.', tags: ['Assorted', 'Event'], serves: { 'Small (30 pax)': '30 servings', 'Large (60 pax)': '60 servings' } },
};

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) n FROM products').get().n;
  if (count > 0) return;
  const insert = db.prepare(`
    INSERT INTO products (name, category, emoji, description, tags, badge, sizes, sort_order)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  let order = 0;
  for (const [name, sizes] of Object.entries(PRODUCTS)) {
    const meta = SEED_META[name] || {};
    const sizeArr = Object.entries(sizes).map(([label, price]) => ({
      label, price, serves: meta.serves?.[label] || '',
    }));
    insert.run(
      name,
      meta.category || 'pastries',
      meta.emoji || '🍰',
      meta.description || '',
      JSON.stringify(meta.tags || []),
      meta.badge || '',
      JSON.stringify(sizeArr),
      order++
    );
  }
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)')
    .run('delivery_fee', String(DELIVERY_FEE));
  console.log(`🌱  Seeded ${order} products into the inventory (from prices.js)`);
}
seedIfEmpty();

function getDeliveryFee() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'delivery_fee'").get();
  const fee = row ? Number(row.value) : DELIVERY_FEE;
  return Number.isFinite(fee) ? fee : DELIVERY_FEE;
}

function setDeliveryFee(fee) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('delivery_fee', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(fee));
}

function rowToProduct(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    emoji: r.emoji,
    description: r.description,
    tags: JSON.parse(r.tags),
    imageUrl: r.image_url,
    badge: r.badge,
    sizes: JSON.parse(r.sizes),
    active: !!r.active,
    sortOrder: r.sort_order,
  };
}

function listProducts(includeInactive = false) {
  const rows = db.prepare(
    `SELECT * FROM products ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY category, sort_order, id`
  ).all();
  return rows.map(rowToProduct);
}

// { deliveryFee, products: {name: {label: price}}, customDesigns, catalog: {cat: [...]} }
function publicPriceList() {
  const active = listProducts(false);
  const products = {};
  const catalog = {};
  CATEGORIES.forEach(c => { catalog[c] = []; });
  for (const p of active) {
    products[p.name] = {};
    p.sizes.forEach(s => { products[p.name][s.label] = s.price; });
    (catalog[p.category] || (catalog[p.category] = [])).push(p);
  }
  return { deliveryFee: getDeliveryFee(), products, customDesigns: CUSTOM_DESIGNS, catalog };
}

// Exact-match lookup for checkout: "Red Velvet Cake (8\")" → 68 (active only)
function lookupPrice(fullName) {
  const active = listProducts(false);
  for (const p of active) {
    for (const s of p.sizes) {
      if (`${p.name} (${s.label})` === fullName) return s.price;
    }
  }
  return null;
}

module.exports = {
  CATEGORIES, seedIfEmpty, getDeliveryFee, setDeliveryFee,
  listProducts, publicPriceList, lookupPrice, rowToProduct,
};

// ── Tropical Taste · canonical price list (CAD) ────────────
// Single source of truth for every sellable product.
// Edit prices HERE — the frontend fetches them via GET /api/prices,
// and checkout always charges these values regardless of what the
// browser sends. Keys must match the product names used in the pages.

const DELIVERY_FEE = 10;

const PRODUCTS = {
  // Custom cakes (menu + cake customizer)
  'Strawberry & Chocolate Cake': { '6"': 40, '8"': 65, '10"': 85 },
  'Red Velvet Cake':             { '6"': 48, '8"': 68, '10"': 88 },
  'Carrot Cake':                 { '6"': 45, '8"': 65, '10"': 85 },
  'Tres Leches Cake':            { '8"': 55, '10"': 75 },
  'Quinceañera Cake':            { '2-tier': 180, '3-tier': 280 },
  'Custom Theme Cake':           { '8"': 85, '10"': 110 },

  // Latin classics
  'Tres Leches':      { 'Small tray': 38, 'Large tray': 65 },
  'Flan de Caramelo': { 'Individual': 7, 'Family (8 pc)': 48 },
  'Pionono Roll':     { 'Full roll': 32 },
  'Brazo Gitano':     { 'Full roll': 35 },
  'Budín de Pan':     { 'Family tray': 28 },
  'Arroz con Leche':  { 'Individual cup': 6, 'Family jar (6)': 30 },

  // Pastries & treats
  'Cupcakes':          { '6 pack': 22, '12 pack': 36, '24 pack': 65 },
  'Churros':           { '4 pack': 9, '8 pack': 14 },
  'Alfajores':         { '4 pack': 12, '8 pack': 20 },
  'Empanadas (Sweet)': { '3 pack': 10, '6 pack': 18 },
  'Tequeños':          { '8 pack': 16, '16 pack': 28 },
  'Mantecadas':        { '6 pack': 14, '12 pack': 24 },

  // Party packs
  'Birthday Party Pack':     { 'Standard': 105 },
  'Office Celebration Pack': { 'Standard': 115 },
  'Quinceañera Package':     { 'Full package': 380 },
  'Sweet Table Package':     { 'Small (30 pax)': 150, 'Large (60 pax)': 280 },
};

// Cake customizer design → product name above
const CUSTOM_DESIGNS = {
  choco:  'Strawberry & Chocolate Cake',
  velvet: 'Red Velvet Cake',
  carrot: 'Carrot Cake',
};

// Flat lookup: "Red Velvet Cake (8\")" → 68. Exact-match, no parsing,
// so product names may safely contain parentheses.
const PRICE_MAP = new Map();
for (const [name, sizes] of Object.entries(PRODUCTS)) {
  for (const [label, price] of Object.entries(sizes)) {
    PRICE_MAP.set(`${name} (${label})`, price);
  }
}

function lookupPrice(fullName) {
  const price = PRICE_MAP.get(fullName);
  return price === undefined ? null : price;
}

module.exports = { DELIVERY_FEE, PRODUCTS, CUSTOM_DESIGNS, lookupPrice };

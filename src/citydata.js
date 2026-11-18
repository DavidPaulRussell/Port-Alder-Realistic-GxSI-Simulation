// The world tables of Port Alder: spending categories, occupations, sectors, buildings, materials.
// SPDX-License-Identifier: GPL-3.0-only
// Prices and wages are 2026 cents and are the city's own calibration (illustrative), anchored to the
// Washington average weekly wage; statutes live in rules.js.
import { BO } from "./rules.js";

export const CITY_NAME = "Port Alder";
export const CELL_M = 20;                        // one map cell is 20 m; the city is 128 x 128 cells (2.56 km)
export const N = 128, CELLS = N * N;

/* ------------------------------------------------------------------ household spending */
// unit: what one unit buys, base: 2026 price of a unit in cents, tax: share of sales taxable (ppm)
export const CATS = [
  { key: "groceries", name: "Groceries", unit: "a day of food for one", base: 1300, tax: 0 },
  { key: "dining", name: "Dining", unit: "a meal out", base: 1900, tax: 1000000 },
  { key: "goods", name: "Goods", unit: "an item", base: 3500, tax: 1000000 },
  { key: "services", name: "Services", unit: "an appointment", base: 5500, tax: 0 },
  { key: "health", name: "Health", unit: "a visit or prescription", base: 9500, tax: 0 },
  { key: "transport", name: "Transport", unit: "a tank of fuel or a repair", base: 5800, tax: 400000 },
  { key: "recreation", name: "Recreation", unit: "a visit or a night out", base: 2200, tax: 1000000 },
  { key: "utilities", name: "Light and water", unit: "a month's bill", base: 18000, tax: 0 },
];
export const C = Object.fromEntries(CATS.map((c, i) => [c.key, i]));
export const NCAT = CATS.length;

/* ------------------------------------------------------------------ occupations */
// wage: 2026 hourly cents (salaried occupations are paid wage x 2,080 a year)
export const OCCS = [
  { key: "none", name: "No occupation", wage: 0, edu: 0 },
  { key: "service", name: "Retail and service worker", wage: 2050, edu: 0 },
  { key: "food", name: "Food service worker", wage: 1900, edu: 0 },
  { key: "admin", name: "Office and administrative", wage: 2700, edu: 1 },
  { key: "trades", name: "Construction and trades", wage: 3900, edu: 1 },
  { key: "production", name: "Production and warehouse", wage: 2900, edu: 0 },
  { key: "driver", name: "Driver", wage: 2800, edu: 0 },
  { key: "care", name: "Health and care support", wage: 2400, edu: 1 },
  { key: "clinician", name: "Nurse or clinician", wage: 5200, edu: 3 },
  { key: "teacher", name: "Teacher", wage: 4300, edu: 3, salaried: true },
  { key: "professional", name: "Professional", wage: 5600, edu: 3, salaried: true },
  { key: "manager", name: "Manager", wage: 6800, edu: 3, salaried: true },
  { key: "engineer", name: "Software engineer", wage: 8200, edu: 3, salaried: true },
  { key: "safety", name: "Police or fire", wage: 4800, edu: 2 },
];
export const O = Object.fromEntries(OCCS.map((o, i) => [o.key, i]));
export const EDUCATION = ["no diploma", "high school", "some college", "bachelor's degree", "graduate degree"];

/* ------------------------------------------------------------------ sectors */
// bo: B&O classification; cat: household category served (-1 exports, -2 contracts, -3 visitors);
// price: base unit price; cost: imported input cost (ppm of price); rate: units per staff hour x 100;
// staff: typical [min, max]; occ: [occupation, share ppm]; open/close: minutes; days: Sunday bit 0;
// lni: workers' compensation cents per hour (illustrative); tips: customer tip (ppm of price);
// licence: number of licences the city issues (E1 admission); space: building kind; sign: colour
export const SECTORS = [
  { key: "grocery", name: "Grocery", bo: BO.RETAIL, cat: C.groceries, price: 1300, cost: 720000, rate: 2400, staff: [12, 40], occ: [[O.service, 820000], [O.manager, 60000], [O.driver, 120000]], open: 420, close: 1320, days: 127, lni: 62, space: "shop", n: 6, sign: [0.30, 0.62, 0.32] },
  { key: "restaurant", name: "Restaurant", bo: BO.RETAIL, cat: C.dining, price: 2600, cost: 300000, rate: 400, staff: [3, 12], occ: [[O.food, 900000], [O.manager, 100000]], open: 660, close: 1320, days: 127, lni: 70, tips: 180000, space: "shop", n: 22, sign: [0.78, 0.22, 0.18] },
  { key: "cafe", name: "Cafe and bakery", bo: BO.RETAIL, cat: C.dining, price: 1100, cost: 300000, rate: 900, staff: [3, 7], occ: [[O.food, 920000], [O.manager, 80000]], open: 390, close: 1080, days: 127, lni: 70, tips: 150000, space: "shop", n: 14, sign: [0.62, 0.44, 0.26] },
  { key: "bar", name: "Bar and pub", bo: BO.RETAIL, cat: C.recreation, price: 2400, cost: 280000, rate: 320, staff: [2, 6], occ: [[O.food, 900000], [O.manager, 100000]], open: 960, close: 1500, days: 127, lni: 70, tips: 180000, licence: 14, space: "shop", n: 8, sign: [0.52, 0.20, 0.62] },
  { key: "retail", name: "Retail store", bo: BO.RETAIL, cat: C.goods, price: 3500, cost: 560000, rate: 450, staff: [2, 7], occ: [[O.service, 880000], [O.manager, 120000]], open: 600, close: 1200, days: 127, lni: 55, space: "shop", n: 30, sign: [0.20, 0.42, 0.74] },
  { key: "hardware", name: "Hardware and home", bo: BO.RETAIL, cat: C.goods, price: 4200, cost: 600000, rate: 380, staff: [5, 12], occ: [[O.service, 860000], [O.manager, 80000], [O.driver, 60000]], open: 480, close: 1200, days: 127, lni: 75, space: "shop", n: 6, sign: [0.86, 0.48, 0.12] },
  { key: "pharmacy", name: "Pharmacy", bo: BO.RETAIL, cat: C.health, price: 5200, cost: 620000, rate: 420, staff: [3, 9], occ: [[O.service, 600000], [O.clinician, 300000], [O.manager, 100000]], open: 480, close: 1260, days: 127, lni: 40, space: "shop", n: 3, taxShare: 300000, sign: [0.18, 0.56, 0.48] },
  { key: "clinic", name: "Clinic", bo: BO.SERVICE, cat: C.health, price: 18000, cost: 120000, rate: 110, staff: [4, 12], occ: [[O.clinician, 450000], [O.care, 400000], [O.admin, 150000]], open: 480, close: 1080, days: 62, lni: 38, space: "clinic", n: 10, sign: [0.86, 0.86, 0.90] },
  { key: "hospital", name: "Hospital", bo: BO.SERVICE, cat: C.health, price: 62500, cost: 220000, rate: 18, export: 910000, staff: [260, 420], occ: [[O.clinician, 420000], [O.care, 400000], [O.admin, 120000], [O.manager, 60000]], open: 0, close: 1440, days: 127, lni: 52, space: "hospital", n: 1, sign: [0.92, 0.92, 0.94] },
  { key: "salon", name: "Salon and barber", bo: BO.SERVICE, cat: C.services, price: 6500, cost: 80000, rate: 120, staff: [2, 5], occ: [[O.service, 1000000]], open: 540, close: 1140, days: 126, lni: 45, tips: 180000, space: "shop", n: 14, sign: [0.84, 0.40, 0.60] },
  { key: "gym", name: "Gym", bo: BO.RETAIL, cat: C.recreation, price: 1800, cost: 60000, rate: 900, staff: [3, 7], occ: [[O.service, 900000], [O.manager, 100000]], open: 330, close: 1320, days: 127, lni: 45, space: "shop", n: 5, sign: [0.95, 0.30, 0.20] },
  { key: "auto", name: "Auto repair", bo: BO.RETAIL, cat: C.transport, price: 32000, cost: 450000, rate: 22, staff: [4, 12], occ: [[O.trades, 800000], [O.service, 200000]], open: 480, close: 1080, days: 62, lni: 140, space: "industrial", n: 6, sign: [0.36, 0.36, 0.40] },
  { key: "fuel", name: "Fuel station", bo: BO.RETAIL, cat: C.transport, price: 5800, cost: 860000, rate: 1500, staff: [3, 7], occ: [[O.service, 1000000]], open: 360, close: 1380, days: 127, lni: 60, space: "shop", n: 5, taxShare: 0, sign: [0.90, 0.80, 0.10] },
  { key: "childcare", name: "Childcare", bo: BO.SERVICE, cat: C.services, price: 9500, cost: 90000, rate: 160, staff: [4, 10], occ: [[O.care, 900000], [O.manager, 100000]], open: 420, close: 1110, days: 62, lni: 55, space: "shop", n: 7, sign: [0.98, 0.76, 0.24] },
  { key: "hotel", name: "Hotel", bo: BO.RETAIL, cat: -3, price: 21900, cost: 160000, rate: 60, staff: [10, 30], occ: [[O.service, 700000], [O.food, 200000], [O.manager, 100000]], open: 0, close: 1440, days: 127, lni: 66, space: "hotel", n: 5, sign: [0.62, 0.52, 0.30] },
  { key: "professional", name: "Professional services", bo: BO.SERVICE, cat: C.services, price: 22000, cost: 40000, rate: 65, staff: [3, 18], occ: [[O.professional, 650000], [O.admin, 300000], [O.manager, 50000]], open: 510, close: 1050, days: 62, lni: 12, space: "office", n: 30, export: 600000, sign: [0.30, 0.34, 0.52] },
  { key: "software", name: "Software studio", bo: BO.SERVICE, cat: -1, price: 19000, cost: 30000, rate: 90, staff: [12, 70], occ: [[O.engineer, 700000], [O.professional, 150000], [O.manager, 100000], [O.admin, 50000]], open: 540, close: 1080, days: 62, lni: 10, space: "office", n: 12, sign: [0.10, 0.70, 0.86] },
  { key: "manufacturing", name: "Manufacturer", bo: BO.MANUF, cat: -1, price: 16000, cost: 480000, rate: 60, staff: [40, 160], occ: [[O.production, 760000], [O.trades, 100000], [O.manager, 70000], [O.admin, 70000]], open: 360, close: 1260, days: 62, lni: 160, space: "industrial", n: 10, sign: [0.50, 0.50, 0.46] },
  { key: "logistics", name: "Port and logistics", bo: BO.SERVICE, cat: -1, price: 9000, cost: 260000, rate: 70, staff: [30, 110], occ: [[O.driver, 450000], [O.production, 400000], [O.manager, 70000], [O.admin, 80000]], open: 300, close: 1380, days: 126, lni: 180, space: "industrial", n: 8, sign: [0.20, 0.30, 0.50] },
  { key: "construction", name: "Builder", bo: BO.RETAIL, cat: -2, price: 9500, cost: 420000, rate: 100, staff: [5, 24], occ: [[O.trades, 820000], [O.manager, 80000], [O.driver, 100000]], open: 420, close: 930, days: 62, lni: 300, space: "industrial", n: 14, sign: [0.92, 0.62, 0.10] },
  { key: "realty", name: "Property company", bo: BO.EXEMPT, cat: -4, price: 0, cost: 0, rate: 0, staff: [2, 9], occ: [[O.admin, 500000], [O.manager, 300000], [O.trades, 200000]], open: 540, close: 1020, days: 62, lni: 30, space: "office", n: 14, sign: [0.40, 0.52, 0.40] },
];
export const S = Object.fromEntries(SECTORS.map((s, i) => [s.key, i]));
export const NSECT = SECTORS.length;
// public and financial employers (wages and occupations for the city, the school district and the banks)
export const PUBLIC_JOBS = {
  city: [[O.safety, 260000], [O.trades, 220000], [O.driver, 180000], [O.admin, 220000], [O.manager, 60000], [O.professional, 60000]],
  school: [[O.teacher, 620000], [O.care, 180000], [O.admin, 120000], [O.manager, 40000], [O.driver, 40000]],
  bank: [[O.admin, 450000], [O.professional, 350000], [O.manager, 200000]],
};

/* ------------------------------------------------------------------ land use and buildings */
export const LAND = ["water", "road", "park", "residential", "mixed", "commercial", "office", "industrial", "civic", "beach", "rail", "plaza", "yard", "site"];
export const L = Object.fromEntries(LAND.map((k, i) => [k, i]));
export const BKIND = [
  { key: "house", name: "House", floors: [1, 2], units: 1, roof: "gable", mats: ["siding", "shingle"] },
  { key: "townhouse", name: "Townhouses", floors: [2, 3], units: 4, roof: "gable", mats: ["brick_red", "shingle"] },
  { key: "apartments", name: "Apartments", floors: [3, 6], units: 0, roof: "flat", mats: ["stucco", "membrane"] },
  { key: "mixed", name: "Shops with flats above", floors: [2, 5], units: 0, roof: "flat", mats: ["brick_red", "membrane"] },
  { key: "shop", name: "Shopfront", floors: [1, 2], units: 0, roof: "flat", mats: ["brick_yellow", "membrane"] },
  { key: "office", name: "Office building", floors: [3, 14], units: 0, roof: "flat", mats: ["curtain_glass", "gravel"] },
  { key: "industrial", name: "Works and warehouse", floors: [1, 2], units: 0, roof: "sawtooth", mats: ["metal_panel", "metal_roof"] },
  { key: "hotel", name: "Hotel", floors: [5, 11], units: 0, roof: "flat", mats: ["concrete", "gravel"] },
  { key: "civic", name: "Civic building", floors: [2, 4], units: 0, roof: "flat", mats: ["sandstone", "slate"] },
  { key: "school", name: "School", floors: [1, 3], units: 0, roof: "flat", mats: ["brick_red", "membrane"] },
  { key: "hospital", name: "Hospital", floors: [4, 8], units: 0, roof: "flat", mats: ["concrete", "gravel"] },
  { key: "clinic", name: "Clinic", floors: [1, 3], units: 0, roof: "flat", mats: ["stucco", "membrane"] },
  { key: "bank", name: "Bank", floors: [2, 6], units: 0, roof: "flat", mats: ["sandstone", "slate"] },
];
export const B = Object.fromEntries(BKIND.map((k, i) => [k.key, i]));

/* ------------------------------------------------------------------ the urban material library */
// 24 baked sets (shards/materials): albedo+height and normal+roughness PNGs at 2048 x 2048.
export const MATERIALS = [
  ["asphalt", "Asphalt", 3.0], ["concrete_walk", "Concrete sidewalk", 2.0], ["pavers", "Brick pavers", 1.6], ["cobble", "Granite setts", 1.6],
  ["lawn", "Mown lawn", 2.0], ["soil", "Garden soil", 2.0], ["sand", "Beach sand", 3.0], ["bark", "Tree bark", 1.0],
  ["brick_red", "Red brick", 2.4], ["brick_yellow", "Buff brick", 2.4], ["concrete", "Cast concrete", 3.0], ["curtain_glass", "Curtain wall", 6.0],
  ["stucco", "Stucco", 2.4], ["siding", "Painted siding", 2.4], ["metal_panel", "Ribbed metal panel", 3.0], ["sandstone", "Sandstone ashlar", 3.0],
  ["shingle", "Asphalt shingles", 2.0], ["membrane", "Roof membrane", 4.0], ["gravel", "Roof gravel", 2.0], ["metal_roof", "Standing-seam roof", 3.0],
  ["slate", "Slate roof", 2.0], ["timber_deck", "Timber decking", 2.4], ["rust_steel", "Weathered steel", 2.0], ["marble", "Lobby marble", 2.0],
];
export const MAT = Object.fromEntries(MATERIALS.map(([k], i) => [k, i]));

/* ------------------------------------------------------------------ names */
const FIRST = ["Alder", "Harbor", "Cedar", "Tideline", "Bayside", "Northgate", "Creekside", "Ridge", "Lantern", "Ferry", "Kelp", "Heron", "Driftwood", "Salt", "Pier", "Summit", "Willow", "Granite", "Copper", "Juniper", "Orca", "Rainier", "Madrona", "Larch", "Foghorn", "Anchor", "Beacon", "Clover", "Marigold", "Thistle", "Otter", "Gull"];
const SUFFIX = {
  grocery: ["Market", "Grocers", "Food Co-op", "Fresh Market"], restaurant: ["Kitchen", "Bistro", "Table", "Grill", "Noodle House", "Taqueria"],
  cafe: ["Coffee", "Bakery", "Cafe", "Roasters"], bar: ["Tavern", "Taproom", "Pub", "Lounge"], retail: ["Outfitters", "Books", "Goods", "Supply", "Mercantile"],
  hardware: ["Hardware", "Home Center"], pharmacy: ["Pharmacy", "Drug"], clinic: ["Family Clinic", "Health", "Dental", "Medical Group"], hospital: ["Regional Hospital"],
  salon: ["Salon", "Barbers", "Studio"], gym: ["Fitness", "Athletic Club", "Climbing Gym"], auto: ["Auto Repair", "Garage", "Motors"], fuel: ["Fuel", "Gas & Go"],
  childcare: ["Early Learning", "Kids' Place", "Daycare"], hotel: ["Hotel", "Inn", "Lodge"], professional: ["Law Group", "Accounting", "Architects", "Partners", "Consulting"],
  software: ["Labs", "Software", "Systems", "Digital"], manufacturing: ["Works", "Fabrication", "Boatworks", "Instruments", "Foods"], logistics: ["Freight", "Terminal", "Logistics"],
  construction: ["Builders", "Construction", "Contractors"], realty: ["Properties", "Realty", "Housing Co."],
};
export const firmName = (sector, h) => `${FIRST[h % FIRST.length]} ${SUFFIX[SECTORS[sector].key][(h >>> 8) % SUFFIX[SECTORS[sector].key].length]}`;
const GIVEN = ["Ava", "Liam", "Maya", "Noah", "Iris", "Eli", "Zoe", "Owen", "Nora", "Leo", "Ruby", "Ezra", "Mila", "Theo", "Hana", "Kai", "Lena", "Omar", "Priya", "Sam", "Tess", "Ivan", "June", "Ravi", "Ada", "Felix", "Rosa", "Jonah", "Lucia", "Milo", "Wren", "Diego",
  "Amara", "Caleb", "Freya", "Hugo", "Ines", "Jasper", "Keiko", "Luca", "Mei", "Nico", "Olive", "Pablo", "Quinn", "Rhea", "Silas", "Tala", "Uma", "Vera", "Wade", "Ximena", "Yusuf", "Zara", "Arlo", "Bea", "Cyrus", "Dara", "Elan", "Fern", "Gus", "Hazel", "Idris", "Joy"];
const FAMILY = ["Abernathy", "Begay", "Castillo", "Dahl", "Eriksen", "Fong", "Garcia", "Haugen", "Ito", "Johansson", "Kim", "Lindqvist", "Morales", "Nguyen", "Okafor", "Petrov", "Quintero", "Rasmussen", "Singh", "Tanaka", "Ulloa", "Vance",
  "Whitehorse", "Xu", "Yamada", "Zamora", "Alvarez", "Brennan", "Chen", "Delgado", "Ellis", "Fischer", "Gupta", "Hale", "Iverson", "Jensen", "Kowalski", "Larsen", "Mendez", "Nakamura", "Olsen", "Park", "Reyes", "Sato", "Thorsen", "Underwood", "Vu", "Walsh"];
export const personName = (h, fam) => `${GIVEN[h % GIVEN.length]} ${FAMILY[fam % FAMILY.length]}`;
export const BANKS = [
  { name: "Alder Bay Savings Bank", short: "Alder Bay Savings", cu: false, capital: 105000, fear: 6 },
  { name: "Cascade Commonwealth Bank", short: "Cascade Commonwealth", cu: false, capital: 95000, fear: 9 },
  { name: "Harborline Credit Union", short: "Harborline CU", cu: true, capital: 110000, fear: 4 },
];
export const NEIGHBOURHOODS = ["Downtown", "Old Town", "Northgate", "Creekside", "Eastside Hills", "Southridge", "Port District", "Bayview"];

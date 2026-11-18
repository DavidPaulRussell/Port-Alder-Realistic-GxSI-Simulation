// Banks, loans, reserves and the opening balance sheets of Port Alder.
// SPDX-License-Identifier: GPL-3.0-only
import { mulDiv, divRound, ppm } from "./rules.js";
import { SECTORS, S as SK, B as BK, BANKS, OCCS } from "./citydata.js";
import { AC, K, E_H0, E_F0, E_B0, E_CITY, E_SCHOOL, E_STATE, E_FEDGOV, E_FED, E_ROW, holdKind } from "./books.js";
import { sat, tickTrust, priorTrust, trustScore, F_RUNNING, F_FAULT } from "./core.js";
import { members, ageYears, addMemory, M, trait, T_THRIFT, T_RISK, T_C, T_N } from "./people.js";
import { census, lif, lawUse, cournot, idw, creditScore, ln } from "./laws.js";
// a credit application's log-odds (law 14.58): trust in the household, its cushion against the payment, lateness
export const creditOk = (c, h, payment) => { const H = c.hh, he = E_H0 + h, cash = Math.max(1, c.books.get(he, AC.DEPOSITS) + c.books.get(he, AC.SAVINGS)); return creditScore([-2.2, 1.4, 0.9, -1.3], [H.kbLv[h], ln(cash / Math.max(1, payment * 6)), H.late[h]]) >= 0; };
const urge = (arr, x, drive) => { const v = lif(arr[x], drive, 0); if (v >= 1) { arr[x] = v - 1; return true; } arr[x] = v; return false; };
// where someone takes their money: the other bank with the fewest loans gone bad this year
const bestBank = (c, k) => { let nb = -1; for (let x = 0; x < c.banks.length; x++) if (x !== k && (nb < 0 || (c.banks[x].chargeoffs || 0) < (c.banks[nb].chargeoffs || 0))) nb = x; return nb < 0 ? k : nb; };

export const LOAN_SPEC = [["alive", Uint8Array], ["status", Uint8Array], ["bank", Uint8Array], ["type", Uint8Array], ["who", Int32Array], ["prin", Float64Array], ["rate", Int32Array],
  ["pay", Int32Array], ["due", Int32Array], ["missed", Uint8Array], ["term", Int16Array], ["col", Int32Array], ["orig", Int32Array], ["lim", Int32Array]];
export const LOAN_TYPES = ["mortgage", "business", "auto", "card"];
export const L_ASSET = [AC.LOAN_MORT, AC.LOAN_BIZ, AC.LOAN_AUTO, AC.LOAN_CARD], L_LIAB = [AC.L_MORT, AC.L_BIZ, AC.L_AUTO, AC.L_CARD];
export const BANK_SLOTS = [4, 3, 3];
export const ROW_LENDER = 255;                       // a loan sold to the national market (held in the rest of the world)
export const lenderOf = (c, l) => (c.loans.bank[l] === ROW_LENDER ? E_ROW : E_B0 + c.loans.bank[l]);

// the level monthly payment of an amortising loan, rounded up to the cent (exact rational arithmetic)
export function annuity(prin, rateBp, n) {
  lawUse("71.3");   // the annuity formula, in exact integer arithmetic
  if (n <= 0) return prin; if (rateBp <= 0) return Math.ceil(prin / n);
  const S = 10n ** 18n, r = (BigInt(rateBp) * S) / 120000n; let p = S;
  for (let k = 0; k < n; k++) p = (p * (S + r)) / S;
  const num = BigInt(Math.round(prin)) * r * p, den = (p - S) * S;
  return Number((num + den - 1n) / den);
}

/* ------------------------------------------------------------------ the banks */
export function genesisBanks(c) {
  const W = c.world, sites = W.sites.filter((b) => W.buildings.kind[b] === BK.bank);
  c.banks = BANKS.slice(0, c.cfg.banks).map((b, k) => ({ name: b.name, short: b.short, cu: b.cu, capital: b.capital, fear: b.fear * 10, staff: 34 + k * 6,
    hq: sites[k] ?? -1, branch: sites[k + 3] ?? -1, cell: sites[k] !== undefined ? W.frontCell(sites[k]) : -1, rates: {}, shock: 0, rumour: 0, munisCity: 0, munisSchool: 0,
    chargeoffs: 0, approvals: 0, denials: 0, overnight: 0, overnightRate: 0, dw: 0 }));
  for (let k = 0; k < c.banks.length; k++) { const b = c.banks[k]; if (b.hq >= 0) W.buildings.owner[b.hq] = E_B0 + k; if (b.branch >= 0) W.buildings.owner[b.branch] = E_B0 + k; }
  setRates(c, 1);
  attach(c);
}
// a household's monthly income after tax: its members' pay at their hours, Social Security, SSI and ABD, WorkFirst,
// unemployment benefits while they last (weekly x 4.33); the 0.82 stands for federal income tax and FICA (no state
// income tax in Washington). It is an aggregate of the agents' states, refreshed at every month's end.
export function householdIncome(c, h) {
  const P = c.people, H = c.hh; let gross = H.tanf ? H.tanf[h] || 0 : 0;
  for (const i of members(c, h)) { if (P.emp[i] >= 0) gross += P.wage[i] * P.hours[i] * 21.7; gross += P.ss[i] + (P.ssi ? P.ssi[i] : 0) + (P.abd ? P.abd[i] : 0); if (P.status[i] === 3 && P.uiLeft[i] > 0) gross += P.ui[i] * 4.33; }
  return Math.round(gross * 0.82);
}
export function setRates(c, e) {
  const nat = c.nation, r = nat.rate(e), prime = nat.prime(e), cf = cournot(c.banks.length, 3) / cournot(3, 3);   // fewer competitors, wider spreads (law 20.20)
  for (const k of c.banks) {
    const f = k.fear, sh = k.shock || 0;
    k.rates = { mortgage: Math.round(r.mid + 240 * cf + f * 0.25 + sh), business: prime + Math.round(150 * cf) + Math.round(f * 0.35) + sh, auto: Math.round(r.mid + 330 * cf + f * 0.25 + sh),
      card: prime + Math.round(1450 * cf) + (k.cu ? -300 : 0), savings: Math.max(5, Math.round(r.mid - 240 - (k.cu ? -40 : 0))), checking: 5, prime };
  }
}

/* ------------------------------------------------------------------ city helpers */
function attach(c) {
  const B = c.books, L = c.loans;
  // make sure entity e has amt in checking: savings first, then (with credit) the card or the credit line
  c.fund = (e, amt, credit = false) => {
    if (amt <= 0) return true;
    const hk = holdKind(e); if (hk === "K" || hk === "F") return true;     // banks pay in reserves (settled overnight); the Fed issues them
    let have = B.get(e, AC.DEPOSITS); if (have >= amt) return true;
    const sv = B.get(e, AC.SAVINGS); if (sv > 0 && holdKind(e) === "N") { B.fromSavings(e, Math.min(sv, amt - have)); have = B.get(e, AC.DEPOSITS); if (have >= amt) return true; }
    if (holdKind(e) === "G") return have >= amt;
    const short = amt - have;
    if (e < E_F0) { const h = e - E_H0; if (credit || true) return cardDraw(c, h, short); }
    if (e >= E_F0 && e < E_B0 && credit) return lineDraw(c, e - E_F0, short);
    if ((e === E_CITY || e === E_SCHOOL)) return govLine(c, e, short);
    return false;
  };
  c.borrow = (e, amt, type) => {
    if (e >= E_F0 && e < E_B0) {
      const f = e - E_F0, k = B.bankOf[e], bank = c.banks[k], F = c.firms;
      if (F.kbLv[f] < 2 || bank.fear > 260) { bank.denials++; return false; }
      originate(c, 1, k, e, amt, bank.rates.business, 60, -1); bank.approvals++; return true;
    }
    return false;
  };
  c.originate = (type, k, who, amt, rate, n, col) => originate(c, type, k, who, amt, rate, n, col);
  c.settleClosedFirm = (fe) => settleClosed(c, fe);
}
export function originate(c, type, k, who, amt, rate, n, col) {
  const L = c.loans, l = L.alloc(); if (l < 0) return -1;
  L.status[l] = 1; L.bank[l] = k; L.type[l] = type; L.who[l] = who; L.prin[l] = 0; L.rate[l] = rate; L.term[l] = n; L.col[l] = col; L.orig[l] = c.epoch;
  L.due[l] = c.epoch + 30; L.pay[l] = type === 3 ? 0 : annuity(amt, rate, n);
  if (amt > 0) { c.books.pay(E_B0 + k, who, amt, L_ASSET[type], L_LIAB[type], K.loan); L.prin[l] = amt; }
  return l;
}
function openLoan(c, type, k, who, amt, rate, n, col, dueOffset) {
  const L = c.loans, l = L.alloc(); if (l < 0) return -1;
  L.status[l] = 1; L.bank[l] = k; L.type[l] = type; L.who[l] = who; L.prin[l] = amt; L.rate[l] = rate; L.term[l] = n; L.col[l] = col; L.orig[l] = 1 - dueOffset * 7;
  L.due[l] = 1 + (dueOffset % 28); L.pay[l] = type === 3 ? 0 : annuity(amt, rate, n);
  if (amt > 0) c.books.openClaim(lenderOf(c, l), L_ASSET[type], who, L_LIAB[type], amt);
  return l;
}
// the bank sells a loan to the national market and keeps servicing it
export function sellLoan(c, l) {
  const L = c.loans; if (L.bank[l] === ROW_LENDER || L.prin[l] <= 0) return;
  c.books.pay(E_ROW, E_B0 + L.bank[l], L.prin[l], L_ASSET[L.type[l]], L_ASSET[L.type[l]], K.loan);
  L.bank[l] = ROW_LENDER;
}
export function cardDraw(c, h, amt) {
  const H = c.hh, L = c.loans, l = H.card[h]; if (l < 0 || L.status[l] !== 1 || L.who[l] !== E_H0 + h) return false;
  if (L.prin[l] + amt > L.lim[l]) return false;
  c.books.pay(E_B0 + L.bank[l], E_H0 + h, amt, AC.LOAN_CARD, AC.L_CARD, K.loan); L.prin[l] += amt; return true;
}
function lineDraw(c, f, amt) {
  const F = c.firms, L = c.loans; let l = F.line[f];
  if (l < 0 || L.status[l] !== 1 || L.who[l] !== E_F0 + f) { if (F.kbLv[f] < 2 || F.lineLim[f] <= 0) return false; l = originate(c, 1, c.books.bankOf[E_F0 + f], E_F0 + f, 0, c.banks[c.books.bankOf[E_F0 + f]].rates.business, 36, -1); if (l < 0) return false; F.line[f] = l; L.lim[l] = F.lineLim[f]; }
  if (L.prin[l] + amt > L.lim[l]) return false;
  c.books.pay(E_B0 + L.bank[l], E_F0 + f, amt, AC.LOAN_BIZ, AC.L_BIZ, K.loan); L.prin[l] += amt; L.pay[l] = annuity(L.prin[l], L.rate[l], Math.max(1, L.term[l])); return true;
}
function govLine(c, e, amt) {
  const k = c.books.bankOf[e], key = e === E_CITY ? "cityLine" : "schoolLine"; let l = c.gov[key] ?? -1;
  if (l < 0 || c.loans.status[l] !== 1 || c.loans.who[l] !== e) { l = originate(c, 1, k, e, 0, c.banks[k].rates.prime, 12, -1); c.gov[key] = l; c.loans.lim[l] = 1500000000; }
  if (c.loans.prin[l] + amt > c.loans.lim[l]) return false;
  c.books.pay(E_B0 + k, e, amt, AC.LOAN_BIZ, AC.L_BIZ, K.loan); c.loans.prin[l] += amt; c.loans.pay[l] = annuity(c.loans.prin[l], c.loans.rate[l], 12); return true;
}
// a closed firm settles: its cash repays its loans; what is left over goes to the owner; the rest is charged off
// a closing firm's buildings go to the property company with the most cash, or to investors outside the city, at book value
export function sellBuildings(c, fe) {
  const B = c.books, W = c.world, T = W.buildings, D = W.dwellings, F = c.firms;
  const owned = [...T.each()].filter((b) => T.owner[b] === fe); if (!owned.length) return 0;
  const book = B.get(fe, AC.BUILDINGS) + B.get(fe, AC.LAND); if (book <= 0) { for (const b of owned) T.owner[b] = E_ROW; return 0; }
  let buyer = E_ROW, cash = 0;
  for (const f of F.each()) { if (F.status[f] !== 0 || F.sector[f] !== SK.realty || E_F0 + f === fe) continue; const cf = B.get(E_F0 + f, AC.DEPOSITS) + B.get(E_F0 + f, AC.SAVINGS); if (cf > cash) { cash = cf; buyer = E_F0 + f; } }
  if (buyer !== E_ROW && cash < book) buyer = E_ROW;
  if (buyer !== E_ROW && !c.fund(buyer, book)) buyer = E_ROW;
  B.pay(buyer, fe, book, AC.BUILDINGS, AC.R_OTHER, K.property);
  for (const a of [AC.BUILDINGS, AC.LAND]) { const v = B.get(fe, a); if (v > 0) B.post(fe, AC.R_OTHER, a, v, K.property); }
  for (const b of owned) T.owner[b] = buyer;
  for (const d of D.each()) if (D.owner[d] === fe) D.owner[d] = buyer;
  for (const h of c.hh.each()) if (c.hh.landlord[h] === fe) c.hh.landlord[h] = buyer;
  for (const f of F.each()) if (F.landlord[f] === fe) F.landlord[f] = buyer;
  return book;
}
function settleClosed(c, fe) {
  const B = c.books, L = c.loans, F = c.firms, f = fe - E_F0;
  sellBuildings(c, fe);
  for (const l of L.each()) {
    if (L.status[l] !== 1 || L.who[l] !== fe) continue;
    const cash = B.get(fe, AC.DEPOSITS) + B.get(fe, AC.SAVINGS); if (B.get(fe, AC.SAVINGS)) B.fromSavings(fe, B.get(fe, AC.SAVINGS));
    const pay = Math.min(cash, L.prin[l]); if (pay > 0) { B.pay(fe, lenderOf(c, l), pay, L_LIAB[L.type[l]], L_ASSET[L.type[l]], K.repayment); L.prin[l] -= pay; }
    if (L.prin[l] > 0) chargeOff(c, l);
    L.status[l] = 3; L.release(l);
  }
  // stock and equipment are written off; buildings and land are sold first (see sellBuildings), so none remain
  for (const a of [AC.INVENTORY, AC.EQUIP, AC.BUILDINGS, AC.LAND]) { const v = B.get(fe, a); if (v > 0) B.post(fe, AC.X_LOSS, a, v, K.charge_off); }
  const dep = B.get(fe, AC.ACC_DEPR); if (dep < 0) B.post(fe, AC.ACC_DEPR, AC.X_LOSS, -dep, K.charge_off);
  const own = c.slotOf(F.owner[f]), cash = B.get(fe, AC.DEPOSITS);
  if (cash > 0) { const oh = own >= 0 ? c.people.hh[own] : -1; B.pay(fe, oh >= 0 ? E_H0 + oh : E_ROW, cash, AC.EQUITY, oh >= 0 ? AC.R_OTHER : AC.R_OTHER, K.transfer); }
}
export function chargeOff(c, l) {
  const L = c.loans, B = c.books, k = L.bank[l], who = L.who[l], amt = L.prin[l], t = L.type[l], le = lenderOf(c, l);
  if (amt <= 0) return;
  B.post(le, AC.X_LOSS, L_ASSET[t], amt, K.charge_off, who);
  B.post(who, L_LIAB[t], AC.R_OTHER, amt, K.charge_off, le);
  L.prin[l] = 0; if (c.banks[k]) { const be = E_B0 + k, book = Math.max(1, B.get(be, AC.LOAN_MORT) + B.get(be, AC.LOAN_BIZ) + B.get(be, AC.LOAN_AUTO) + B.get(be, AC.LOAN_CARD)); c.banks[k].chargeoffs += amt; c.banks[k].fear = Math.min(1000, c.banks[k].fear + Math.min(150, Math.round((amt * 20000) / book))); }
}

/* ------------------------------------------------------------------ opening balance sheets */
export function marketRent(c, d) {
  const W = c.world, D = W.dwellings, T = W.buildings, b = D.bld[d];
  const unit = unitValue(c, d), rooms = D.rooms[d];
  const base = (unit * 62 / 1000 / 12) * (0.8 + rooms * 0.08) * ((c.gov.rentScale || 1e6) / 1e6), comps = c.rentComps;
  // landlords price against nearby comparable rents (law 76.39), half and half with the unit's value
  const near = comps && comps.length ? idw(comps, T.x[b], T.y[b]) * rooms : base;
  return Math.max(95000, Math.round(((base + near) / 2) / 500) * 500);
}
export function unitValue(c, d) { const W = c.world, T = W.buildings, b = W.dwellings.bld[d]; return Math.round(T.value[b] * (T.units[b] / (T.units[b] + T.spaces[b] * 1.5)) / Math.max(1, T.units[b])); }
export function openingBooks(c) {
  const B = c.books, P = c.people, H = c.hh, F = c.firms, W = c.world, T = W.buildings, D = W.dwellings, SP = W.spaces, s = c.cfg.seed, nb = c.banks.length;
  B.bankOf[E_CITY] = 0; B.bankOf[E_SCHOOL] = 1 % nb;
  for (let f = 0; f < F.top; f++) if (!F.alive[f]) B.bankOf[E_F0 + f] = 0;
  for (let h = 0; h < H.top; h++) if (!H.alive[h]) B.bankOf[E_H0 + h] = 0;
  // who owns what: homes to their owner-occupiers, rentals and shops to the property companies, civic buildings to the city
  const realty = [...F.each()].filter((f) => F.sector[f] === SK.realty), occupantOwns = new Set([BK.industrial, BK.hotel, BK.hospital]);
  for (const b of T.each()) {
    if (T.owner[b]) continue;
    const kind = T.kind[b];
    if (kind === BK.civic) T.owner[b] = E_CITY; else if (kind === BK.school) T.owner[b] = E_SCHOOL;
    else if (occupantOwns.has(kind)) { const p = [...SP.each()].find((q) => SP.bld[q] === b && SP.tenant[q] >= 0); T.owner[b] = p !== undefined && census(c, 0x0cc, b) % 3 ? SP.tenant[p] : E_F0 + realty[census(c, 0x4ea, b) % realty.length]; }
    else T.owner[b] = E_F0 + realty[census(c, 0x4ea, b, 2) % realty.length];
  }
  for (const d of D.each()) { D.value[d] = unitValue(c, d); D.owner[d] = T.owner[D.bld[d]]; }
  // the founding rent level: the census reads the city's median rent (about $1,850 a month for Everett's renters, ACS
  // 2023) as history, and the asking rents are the units' yields scaled to it
  { const yields = []; for (const d of D.each()) { const h = D.hh[d]; if (h >= 0 && H.tenure[h] === 0) yields.push(D.value[d] * 62 / 1000 / 12 * (0.8 + D.rooms[d] * 0.08)); } yields.sort((a, b) => a - b); c.gov.rentScale = yields.length ? Math.round((185000 * 1e6) / yields[yields.length >> 1]) : 1e6; }   // ppm
  for (const d of D.each()) D.rent[d] = marketRent(c, d);
  // households: homes, rents, savings, investments, vehicles, mortgages, auto loans and cards
  const rates0 = c.banks[0].rates;
  for (const h of H.each()) {
    const he = E_H0 + h, d = H.home[h], mem = members(c, h), head = H.head[h], t = P.traits[head], k = B.bankOf[he];
    const net = householdIncome(c, h), gross = Math.round(net / 0.82); H.inc[h] = net; H.exp[h] = Math.round(net * 0.85);
    const thrift = trait(t, T_THRIFT), age = ageYears(c, head, 1), r = (j) => census(c, 0x0b5, h, j);
    if (H.tenure[h] === 1) { D.owner[d] = he; B.openAsset(he, AC.HOME, D.value[d]); }
    else { H.rent[h] = Math.max(65000, Math.min(D.rent[d], Math.round(gross * 0.36 / 500) * 500)); H.landlord[h] = D.owner[d]; H.lease[h] = 1 - (r(1) % 365); D.rentSince[d] = H.lease[h]; }
    const dep = Math.round(net * (0.4 + thrift / 10 + (r(2) % 100) / 100)), sav = Math.round(net * Math.max(0, thrift * 0.7 + (age - 30) / 12 + (r(3) % 300) / 100 - 3));
    const inv = Math.round(gross * 12 * Math.max(0, age - 25) * 0.012 * (0.4 + thrift / 12));
    B.openDeposit(he, Math.max(20000, dep)); if (sav > 0) B.openDeposit(he, sav, AC.SAVINGS); if (inv > 0) B.openClaim(he, AC.INVEST, E_ROW, AC.FUND_SHARES, inv);
    if (H.cars[h]) { B.openAsset(he, AC.VEHICLE, H.cars[h] * (1400000 + (r(4) % 1600000))); }
    if (H.tenure[h] === 1 && age < 66 && r(5) % 1000 < 760) {
      const ltv = sat(850 - (age - 30) * 16 - (r(6) % 150), 120, 800);
      const vintage = 300 + (r(7) % 380), left = Math.max(36, 360 - (r(8) % 300));
      let prin = Math.round((D.value[d] * ltv) / 1000 / 100) * 100;
      while (prin > 1000000 && annuity(prin, vintage, left) > gross * 0.33) prin = Math.round(prin * 0.85 / 100) * 100;   // what the household could have borrowed
      H.mort[h] = openLoan(c, 0, r(19) % 1000 < 720 ? ROW_LENDER : k, he, prin, vintage, left, d, r(9) % 2000);
    }
    if (H.cars[h] && r(10) % 1000 < 420) H.auto[h] = openLoan(c, 2, k, he, 800000 + (r(11) % 2200000), 600 + (r(12) % 300), 12 + (r(13) % 48), -1, r(14) % 2000);
    const lim = Math.min(3000000, Math.max(200000, Math.round(gross * 0.35 / 1000) * 1000));
    H.card[h] = openLoan(c, 3, k, he, r(15) % 1000 < 350 ? Math.round(lim * (100 + (r(16) % 500)) / 1000) : 0, rates0.card + (r(17) % 400), 0, -1, r(18) % 2000);
    if (H.card[h] >= 0) c.loans.lim[H.card[h]] = lim;
  }
  // firms: equipment, stock, cash, credit; property companies hold their buildings with mortgages
  const value = new Map(); for (const b of T.each()) { const o = T.owner[b]; if (o >= E_F0 && o < E_B0) value.set(o, (value.get(o) || 0) + T.value[b]); }
  const ownLand = new Map(); for (const b of T.each()) { const o = T.owner[b]; if (o >= E_F0 && o < E_B0) ownLand.set(o, (ownLand.get(o) || 0) + T.land[b]); }
  // owner-occupied units are not the landlord's
  const ooValue = new Map(); for (const d of D.each()) { const o = D.owner[d]; if (o < E_F0) { const bo = T.owner[D.bld[d]]; ooValue.set(bo, (ooValue.get(bo) || 0) + D.value[d]); } }
  for (const f of F.each()) {
    const fe = E_F0 + f, S = SECTORS[F.sector[f]], k = B.bankOf[fe], r = (j) => census(c, 0xf0b, f, j);
    const perHead = S.space === "industrial" ? 6000000 : S.space === "office" ? 2200000 : S.space === "hospital" ? 9000000 : 1500000;
    const capex = Math.round(F.want[f] * perHead * (700 + (r(1) % 600)) / 1000); F.capex[f] = capex;
    B.openAsset(fe, AC.EQUIP, capex);
    if (F.inv[f]) B.openAsset(fe, AC.INVENTORY, F.inv[f] * F.cost[f]);
    const bv = Math.max(0, (value.get(fe) || 0) - (ooValue.get(fe) || 0)), land = Math.round((ownLand.get(fe) || 0) * (bv / Math.max(1, value.get(fe) || 1)));
    if (bv) { B.openAsset(fe, AC.BUILDINGS, bv - land); B.openAsset(fe, AC.LAND, land); }
    const monthCost = F.want[f] * 3000 * 173, stock = F.inv[f] * F.cost[f];
    B.openDeposit(fe, Math.round(monthCost * (2 + (r(2) % 150) / 100)) + stock + 500000);
    const debt = Math.round((capex * 0.35 + bv * 0.35) / 100) * 100;
    if (debt > 0) { if (bv) { const local = Math.round(debt * 0.25 / 100) * 100; openLoan(c, 1, k, fe, local, c.banks[k].rates.business - 150 + (r(3) % 200), 360, -1, r(4) % 2000); openLoan(c, 1, ROW_LENDER, fe, debt - local, c.banks[k].rates.business - 250 + (r(3) % 200), 360, -1, r(5) % 2000); } else openLoan(c, 1, k, fe, debt, c.banks[k].rates.business - 100 + (r(3) % 200), 84, -1, r(4) % 2000); }
    F.lineLim[f] = Math.round(monthCost * 3 + stock * 1.5);
  }
  // commercial rents: each tenant pays its building's owner, unless it owns the building
  for (const p of SP.each()) { const ten = SP.tenant[p], b = SP.bld[p]; SP.rent[p] = Math.round((T.value[b] / Math.max(1, T.spaces[b] + T.units[b] / 2)) * 70 / 1000 / 12 / 100) * 100; if (ten >= E_F0 && ten < E_B0 && T.owner[b] !== ten) { c.firms.rentDue[ten - E_F0] += SP.rent[p]; c.firms.landlord[ten - E_F0] = T.owner[b]; } }
  // the city and the school district: streets and buildings, cash, bonds held by the banks
  let civic = 0, school = 0; for (const b of T.each()) { if (T.owner[b] === E_CITY) civic += T.value[b]; if (T.owner[b] === E_SCHOOL) school += T.value[b]; }
  const pop = P.count;
  B.openAsset(E_CITY, AC.INFRA, pop * 2400000); B.openAsset(E_CITY, AC.BUILDINGS, civic); B.openDeposit(E_CITY, pop * 110000);
  B.openAsset(E_SCHOOL, AC.BUILDINGS, school); B.openDeposit(E_SCHOOL, pop * 25000);
  c.gov.cityBonds = pop * 380000; c.gov.schoolBonds = pop * 240000;
  B.openDeposit(E_STATE, 50000000000); B.openDeposit(E_FEDGOV, 100000000000); B.openDeposit(E_ROW, 500000000000);
  // the banks: reserves, municipal bonds and Treasuries fill out each balance sheet to its capital target
  let totalDep = 0; const deps = c.banks.map((_, k) => { const d = -B.get(E_B0 + k, AC.DEP_PAY) - B.get(E_B0 + k, AC.SAV_PAY); totalDep += d; return d; });
  c.banks.forEach((bank, k) => {
    const be = E_B0 + k, dep = deps[k], loans = B.get(be, AC.LOAN_MORT) + B.get(be, AC.LOAN_BIZ) + B.get(be, AC.LOAN_AUTO) + B.get(be, AC.LOAN_CARD);
    const assets = Math.round(dep / (1 - bank.capital / 1e6)), reserves = Math.round(dep * 0.06);
    const mc = Math.round((c.gov.cityBonds * dep) / totalDep / 100) * 100, ms = Math.round((c.gov.schoolBonds * dep) / totalDep / 100) * 100;
    bank.munisCity = mc; bank.munisSchool = ms;
    const gap = loans + reserves + mc + ms - assets, treas = Math.max(0, -gap);
    if (gap > 0) { const adv = Math.round((gap + assets * 0.04) / 100) * 100; B.openClaim(E_ROW, AC.LOAN_IB, be, AC.L_IB, adv); bank.advances = adv; B.openClaim(be, AC.TREAS, E_FEDGOV, AC.BONDS, Math.round(assets * 0.04 / 100) * 100); }
    B.openClaim(be, AC.RESERVES, E_FED, AC.RES_PAY, reserves);
    B.openClaim(be, AC.MUNIS, E_CITY, AC.BONDS, mc); B.openClaim(be, AC.MUNIS, E_SCHOOL, AC.BONDS, ms);
    if (treas) B.openClaim(be, AC.TREAS, E_FEDGOV, AC.BONDS, treas);
    bank.treas = treas;
    const hq = bank.hq >= 0 ? T.value[bank.hq] : 0, br = bank.branch >= 0 ? T.value[bank.branch] : 0; B.openAsset(be, AC.BUILDINGS, hq + br);
  });
  c.gov.cityBonds = c.banks.reduce((a, b) => a + b.munisCity, 0); c.gov.schoolBonds = c.banks.reduce((a, b) => a + b.munisSchool, 0);
  // the Federal Reserve holds Treasuries against the reserves and accounts it owes
  const owed = -B.get(E_FED, AC.RES_PAY) - B.get(E_FED, AC.GOV_ACCT_PAY);
  B.openClaim(E_FED, AC.TREAS, E_FEDGOV, AC.BONDS, owed);
}

/* ------------------------------------------------------------------ the day in money */
export function financeDay(c, d, g) {
  const B = c.books, L = c.loans, H = c.hh, F = c.firms, P = c.people, e = c.epoch, s = c.cfg.seed;
  // overnight loans and discount window borrowing from yesterday are repaid with interest
  for (const bank of c.banks) bank.paidOvernight = 0;
  repayOvernight(c);
  if (d.monthStart) setRates(c, e);
  // instalments due today
  for (const l of L.each()) {
    if (L.status[l] !== 1 || L.due[l] !== e) continue;
    const who = L.who[l], k = L.bank[l], be = lenderOf(c, l), t = L.type[l], interest = mulDiv(L.prin[l], L.rate[l], 120000);
    if (t === 3) { cardStatement(c, l, interest); continue; }
    if (L.prin[l] <= 0 && t === 1 && L.lim[l] > 0) { L.due[l] = e + 30; continue; }       // an unused credit line
    const principal = Math.min(L.prin[l], Math.max(0, L.pay[l] - interest)), total = interest + principal;
    const ok = c.fund(who, total, t === 1);
    if (ok) {
      if (interest) B.pay(who, be, interest, AC.X_INTEREST, AC.R_INTEREST, K.interest);
      if (principal) B.pay(who, be, principal, L_LIAB[t], L_ASSET[t], K.repayment);
      L.prin[l] -= principal; L.missed[l] = 0; L.term[l] = Math.max(0, L.term[l] - 1); L.due[l] = e + 30;
      evidence(c, who, 1, 0);
      if (L.prin[l] <= 0 && !(t === 1 && L.lim[l] > 0)) { L.status[l] = 3; closeLoanRef(c, l); L.release(l); }
    } else {
      if (interest) { B.accrue(who, be, interest, AC.X_INTEREST, L_LIAB[t], L_ASSET[t], AC.R_INTEREST, K.interest); L.prin[l] += interest; }
      L.missed[l]++; L.due[l] = e + 30; evidence(c, who, 0, 1);
      if (t === 0 && who < E_F0) mortgageArrears(c, l);
      else if (L.missed[l] >= 3) defaultLoan(c, l);
    }
  }
  // a rumour drains a bank: worried customers move their money
  for (let k = 0; k < c.banks.length; k++) {
    const bank = c.banks[k]; if (!bank.rumour) continue; bank.rumour--;
    for (const h of H.each()) { const he = E_H0 + h, head = H.head[h]; if (B.bankOf[he] !== k || head < 0) continue; if (P.tbLv[head] <= 1 && urge(H.hurge, h * 6 + 2, 1 / 6)) { const nb = bestBank(c, k); B.switchBank(he, nb); for (const i of members(c, h)) priorTrust(c.P, P, "tb", i); } else if (urge(H.hurge, h * 6 + 3, 1 / 40)) P.bDe[head] += 2; }
  }
  // customers who no longer trust their bank leave it
  if (d.wd === 2) for (const h of H.each()) { const he = E_H0 + h, head = H.head[h]; if (head < 0 || P.tbLv[head] !== 0) continue; const k = B.bankOf[he], nb = bestBank(c, k); B.switchBank(he, nb); for (const i of members(c, h)) priorTrust(c.P, P, "tb", i); }
  // end of day: banks short of reserves borrow overnight from banks with a surplus, or at the discount window
  overnight(c, e);
}
function evidence(c, who, co, de) {
  if (who >= E_H0 && who < E_F0) { const h = who - E_H0, H = c.hh; tickTrust(c.P, H, "kb", h, co + de, co, de, F_RUNNING, c.C); const head = H.head[h]; if (head >= 0) { if (de) { H.late[h] = Math.min(9, H.late[h] + 1); c.people.bDe[head] += 0; } else H.late[h] = Math.max(0, H.late[h] - 1); } }
  else if (who >= E_F0 && who < E_B0) tickTrust(c.P, c.firms, "kb", who - E_F0, co + de, co, de, F_RUNNING, c.C);
}
function closeLoanRef(c, l) { const L = c.loans, who = L.who[l]; if (c.gov.cityLine === l) c.gov.cityLine = -1; if (c.gov.schoolLine === l) c.gov.schoolLine = -1; if (who < E_F0) { const H = c.hh, h = who - E_H0; if (H.mort[h] === l) H.mort[h] = -1; if (H.auto[h] === l) H.auto[h] = -1; } else if (who < E_B0) { if (c.firms.line[who - E_F0] === l) c.firms.line[who - E_F0] = -1; } }
function cardStatement(c, l, interest) {
  const L = c.loans, B = c.books, who = L.who[l], be = lenderOf(c, l), e = c.epoch;
  L.due[l] = e + 30;
  if (L.prin[l] <= 0) return;
  if (interest) { B.accrue(who, be, interest, AC.X_INTEREST, AC.L_CARD, AC.LOAN_CARD, AC.R_INTEREST, K.interest); L.prin[l] += interest; }
  const h = who - E_H0, head = c.hh.head[h], t = head >= 0 ? c.people.traits[head] : 0, dep = B.get(who, AC.DEPOSITS) + B.get(who, AC.SAVINGS);
  const min = Math.min(L.prin[l], Math.max(2500, ppm(L.prin[l], 20000) + interest));
  let amt = dep > L.prin[l] * (3 - trait(t, T_THRIFT) / 8) ? L.prin[l] : dep > min * 3 ? Math.min(L.prin[l], Math.round(dep / 4)) : min;
  if (B.get(who, AC.DEPOSITS) < amt && B.get(who, AC.SAVINGS) > 0) B.fromSavings(who, Math.min(B.get(who, AC.SAVINGS), amt - B.get(who, AC.DEPOSITS)));
  amt = Math.min(amt, B.get(who, AC.DEPOSITS));
  if (amt >= min) { B.pay(who, be, amt, AC.L_CARD, AC.LOAN_CARD, K.repayment); L.prin[l] -= amt; L.missed[l] = 0; evidence(c, who, 1, 0); }
  else { L.missed[l]++; evidence(c, who, 0, 1); if (L.missed[l] >= 4) defaultLoan(c, l); }
}
// a homeowner behind on the mortgage: with equity to keep, the household decides to sell before the lender can; the
// servicer may not start a foreclosure before 120 days (12 CFR 1024.41(f)); in Washington the trustee records a notice
// of default and sells no sooner than 90 days after the notice of sale (RCW 61.24.030, .040), so about eight months
function mortgageArrears(c, l) {
  const L = c.loans, H = c.hh, D = c.world.dwellings, h = L.who[l] - E_H0, d = L.col[l], m = L.missed[l], head = H.head[h];
  const name = () => c.names.person(head >= 0 ? head : members(c, h)[0]).split(" ")[1];
  if (m >= 2 && d >= 0 && !D.forSale[d] && D.value[d] - L.prin[l] > D.value[d] * 0.12 && (head < 0 || trait(c.people.traits[head], T_C) + trait(c.people.traits[head], T_RISK) >= 6)) {
    D.forSale[d] = 1; D.price[d] = Math.round((D.value[d] * 0.97) / 100000) * 100000; H.sell[h] = 1;
    c.event("home", `The ${name()} household puts its home up for sale`);
  }
  if (m === 4) c.event("notice", `The ${name()} household is sent a notice of default on its mortgage`);
  if (m >= 8) defaultLoan(c, l);
}
export function defaultLoan(c, l) {
  const L = c.loans, B = c.books, t = L.type[l], who = L.who[l], k = L.bank[l], be = lenderOf(c, l);
  if (t === 0 && who < E_F0) { c.foreclose(l); return; }
  if (t === 2 && who < E_F0) {                     // repossession: the car is sold for half its book value
    const h = who - E_H0, H = c.hh, veh = B.get(who, AC.VEHICLE), per = H.cars[h] ? Math.floor(veh / H.cars[h]) : 0;
    if (per > 0) { B.post(who, AC.X_LOSS, AC.VEHICLE, per, K.charge_off); H.cars[h]--; const back = Math.min(L.prin[l], Math.floor(per / 2)); if (back > 0) { B.pay(E_ROW, be, back, AC.X_PURCHASES, AC.LOAN_AUTO, K.repayment); B.post(who, AC.L_AUTO, AC.R_OTHER, back, K.charge_off, be); L.prin[l] -= back; } }
  }
  if (who >= E_F0 && who < E_B0 && c.firms.status[who - E_F0] === 0) { const f = who - E_F0; tickTrust(c.P, c.firms, "kb", f, 1, 0, 1, F_RUNNING | F_FAULT, c.C); c.closeFirm(f, "defaulted on its loan and closed"); return; }
  chargeOff(c, l); L.status[l] = 3; closeLoanRef(c, l);
  if (who < E_F0) { const h = who - E_H0; tickTrust(c.P, c.hh, "kb", h, 1, 0, 1, F_RUNNING | F_FAULT, c.C); if (t === 3) { c.hh.cardLim[h] = 0; } }
  L.release(l);
}
function overnight(c, e) {
  const B = c.books, nat = c.nation, r = nat.rate(e), n = c.banks.length;
  for (let k = 0; k < n; k++) {
    const be = E_B0 + k, res = B.get(be, AC.RESERVES), dep = -B.get(be, AC.DEP_PAY) - B.get(be, AC.SAV_PAY), target = Math.round(dep * 0.03);
    if (res >= target) continue;
    let need = target - res;
    for (let j = 0; j < n && need > 0; j++) {
      if (j === k) continue; const je = E_B0 + j, rj = B.get(je, AC.RESERVES), dj = -B.get(je, AC.DEP_PAY) - B.get(je, AC.SAV_PAY), spare = rj - Math.round(dj * 0.05);
      if (spare <= 0) continue; const amt = Math.min(spare, need);
      B.pay(je, be, amt, AC.LOAN_IB, AC.L_IB, K.loan); c.banks[k].ib = (c.banks[k].ib || []).concat([[j, amt, Math.round(r.mid)]]); need -= amt;
    }
    // then Treasuries are sold to investors outside the city; only what is still short comes from the discount window
    const tr = B.get(be, AC.TREAS), sell = Math.min(tr, need); if (sell > 0) { B.pay(E_ROW, be, sell, AC.TREAS, AC.TREAS, K.bond); need -= sell; }
    if (need > 0) { B.pay(E_FED, be, need, AC.LOAN_DW, AC.L_DW, K.loan); c.banks[k].dw += need; c.banks[k].fear = Math.min(1000, c.banks[k].fear + 1); }
  }
}
function repayOvernight(c) {
  const B = c.books, e = c.epoch, r = c.nation.rate(e);
  c.banks.forEach((bank, k) => {
    const be = E_B0 + k;
    for (const [j, amt, rate] of bank.ib || []) { const int = mulDiv(amt, rate, 3600000); B.pay(be, E_B0 + j, amt, AC.L_IB, AC.LOAN_IB, K.repayment); if (int) B.pay(be, E_B0 + j, int, AC.X_INTEREST, AC.R_INTEREST, K.interest); }
    bank.ib = [];
    if (bank.dw) { const int = mulDiv(bank.dw, r.hi, 3600000); B.pay(be, E_FED, bank.dw, AC.L_DW, AC.LOAN_DW, K.repayment); if (int) B.pay(be, E_FED, int, AC.X_INTEREST, AC.R_INTEREST, K.interest); bank.dw = 0; }
  });
}

/* ------------------------------------------------------------------ the month in money */
export function financeMonth(c, d, g) {
  const B = c.books, H = c.hh, e = c.epoch, nat = c.nation, k0 = nat.monthIndex(e), iorb = nat.iorb(e), r = nat.rate(e);
  for (const h of H.each()) if (H.size[h]) { H.inc[h] = householdIncome(c, h); H.exp[h] = Math.round(H.inc[h] * 0.85); }
  // interest on deposits: every account holder at every bank
  for (let ent = 0; ent < E_CITY + 2; ent++) {
    if (holdKind(ent) !== "N") continue;
    const dep = B.get(ent, AC.DEPOSITS), sav = B.get(ent, AC.SAVINGS); if (dep <= 0 && sav <= 0) continue;
    const bank = c.banks[B.bankOf[ent]], int = mulDiv(Math.max(0, dep), bank.rates.checking, 120000) + mulDiv(Math.max(0, sav), bank.rates.savings, 120000);
    if (int > 0) B.pay(E_B0 + B.bankOf[ent], ent, int, AC.X_INTEREST, AC.R_INTEREST, K.interest);
  }
  // interest on reserves, coupons on Treasuries and municipal bonds; the Fed remits its profit
  c.banks.forEach((bank, k) => {
    const be = E_B0 + k, res = B.get(be, AC.RESERVES);
    if (res > 0) B.pay(E_FED, be, mulDiv(res, iorb, 120000), AC.X_INTEREST, AC.R_INTEREST, K.interest);
    const tr = B.get(be, AC.TREAS); if (tr > 0) B.pay(E_FEDGOV, be, mulDiv(tr, r.mid + 40, 120000), AC.X_INTEREST, AC.R_INTEREST, K.bond);
    if (bank.munisCity) { const cpn = mulDiv(bank.munisCity, 380, 120000); if (c.fund(E_CITY, cpn)) B.pay(E_CITY, be, cpn, AC.X_INTEREST, AC.R_INTEREST, K.bond); }
    if (bank.munisSchool) { const cpn = mulDiv(bank.munisSchool, 360, 120000); if (c.fund(E_SCHOOL, cpn)) B.pay(E_SCHOOL, be, cpn, AC.X_INTEREST, AC.R_INTEREST, K.bond); }
    bank.fear = Math.max(0, Math.round(bank.fear * 0.85));
    // surplus reserves buy Treasuries back from investors outside the city
    const dep = -B.get(be, AC.DEP_PAY) - B.get(be, AC.SAV_PAY), extra = B.get(be, AC.RESERVES) - Math.round(dep * 0.08), rowT = B.get(E_ROW, AC.TREAS);
    if (extra > 0 && rowT > 0) B.pay(be, E_ROW, Math.min(extra, rowT), AC.TREAS, AC.TREAS, K.bond);
    if (bank.advances) B.pay(be, E_ROW, mulDiv(bank.advances, r.mid + 30, 120000), AC.X_INTEREST, AC.R_INTEREST, K.interest);   // wholesale advances
  });
  const ftr = B.get(E_FED, AC.TREAS); if (ftr > 0) B.pay(E_FEDGOV, E_FED, mulDiv(ftr, r.mid + 40, 120000), AC.X_INTEREST, AC.R_INTEREST, K.bond);
  const fedIncome = B.incomeOf(E_FED) - (c.gov.fedRemitted || 0); if (fedIncome > 0) { B.pay(E_FED, E_FEDGOV, fedIncome, AC.X_TRANSFER, AC.R_OTHER, K.transfer); c.gov.fedRemitted = (c.gov.fedRemitted || 0) + fedIncome; }
  // investment funds: the month's return, contributions from savers, withdrawals by retirees
  const ret = nat.fundReturn(k0);
  for (const h of H.each()) {
    const he = E_H0 + h, inv = B.get(he, AC.INVEST);
    if (inv > 0) { const gain = mulDiv(inv, Math.abs(ret), 10000); if (ret > 0) { B.post(he, AC.INVEST, AC.R_INVEST, gain, K.investment, E_ROW); B.post(E_ROW, AC.X_OTHER, AC.FUND_SHARES, gain, K.investment, he); } else if (gain) { const lose = Math.min(gain, inv); B.post(he, AC.X_OTHER, AC.INVEST, lose, K.investment, E_ROW); B.post(E_ROW, AC.FUND_SHARES, AC.R_OTHER, lose, K.investment, he); } }
    const monthly = Math.max(50000, H.exp[h]), dep = B.get(he, AC.DEPOSITS), sav = B.get(he, AC.SAVINGS), head = H.head[h];
    // cash management: surplus checking to savings, a low balance topped up
    if (dep > monthly * 2) B.toSavings(he, dep - Math.round(monthly * 1.5)); else if (dep < monthly / 2 && sav > 0) B.fromSavings(he, Math.min(sav, Math.round(monthly - dep)));
    const sav2 = B.get(he, AC.SAVINGS);
    if (sav2 > monthly * 8 && head >= 0 && c.people.status[head] !== 5) { const amt = Math.round((sav2 - monthly * 8) / 5); B.fromSavings(he, amt); B.pay(he, E_ROW, amt, AC.INVEST, AC.FUND_SHARES, K.investment); }
    const inv2 = B.get(he, AC.INVEST);
    if (head >= 0 && c.people.status[head] === 5 && inv2 > 0) { const amt = Math.min(inv2, Math.round(inv2 * 40 / 12 / 1000)); if (amt > 0) B.pay(E_ROW, he, amt, AC.FUND_SHARES, AC.INVEST, K.investment); }
    // outside the city: insurance and subscriptions, online shopping (remote sellers collect Washington sales tax), travel
    if (H.home[h] >= 0 && H.size[h]) {
      const net = Math.max(0, H.inc[h]), fixed = 18000 + H.cars[h] * 14000 + (H.cover[h] ? 0 : H.adults[h] * 26000);
      if (c.fund(he, fixed, true)) B.pay(he, E_ROW, fixed, AC.X_OTHER, AC.R_SALES, K.purchase);
      const online = Math.round(net * 0.045), tax = ppm(online, 65000 + (c.gov.localSales ?? 30000)), travel = Math.round(net * 0.035);
      if (online && c.fund(he, online + tax)) { B.pay(he, E_ROW, online + tax, AC.X_GOODS, AC.R_SALES, K.purchase); B.post(he, AC.X_TAX_SALES, AC.X_GOODS, tax, K.tax_accrual); B.pay(E_ROW, E_STATE, tax, AC.R_SALES, AC.R_SALES_TAX, K.tax_payment); const lp = Math.round(tax * (c.gov.localSales ?? 30000) / (65000 + (c.gov.localSales ?? 30000))); if (lp) { B.post(E_STATE, AC.R_SALES_TAX, AC.DIST_PAY, lp, K.tax_accrual); B.post(E_CITY, AC.DIST_RECV, AC.R_SALES_TAX, lp, K.tax_accrual, E_STATE); } }
      if (travel && c.fund(he, travel)) B.pay(he, E_ROW, travel, AC.X_RECREATION, AC.R_SALES, K.purchase);
    }
    // the household's view of its own finances
    let spent = 0; for (let k = 0; k < 8; k++) { spent += H.spend[h * 8 + k]; H.spend[h * 8 + k] = 0; }
    H.exp[h] = Math.round(H.exp[h] * 0.75 + (spent + H.rent[h]) * 0.25);
  }
}
export { openLoan };

// Homes in Port Alder: rent, notices under the Washington rent cap, moves, purchases with mortgages
// (E1 admission at each bank), foreclosure, couples moving in together, households forming and ending,
// arrivals and departures, and new floors on apartment buildings.
// SPDX-License-Identifier: GPL-3.0-only
import { ppm, mulDiv, divRound, rentCap, RENT_NOTICE_DAYS } from "./rules.js";
import { B as BK, SECTORS, S as SK } from "./citydata.js";
import { NSHIFT, NMASK } from "./scale.js";
import { AC, K, E_H0, E_F0, E_B0, E_CITY, E_ROW, E_STATE, E_FEDGOV } from "./books.js";
import { sat, admitE1, trustScore, priorTrust, tickTrust, F_RUNNING, F_FAULT } from "./core.js";
import { lif } from "./laws.js";
import { relocate } from "./registry.js";
const urge = (arr, x, drive) => { const v = lif(arr[x], drive, 0); if (v >= 1) { arr[x] = v - 1; return true; } arr[x] = v; return false; };
import { members, ageYears, addMemory, M, trait, T_A, T_C, T_RISK, T_THRIFT, T_O, homeCell, newHousehold, newPerson, joinHousehold, removeFromHousehold, scrubPerson, pickW, OCC_BY_EDU } from "./people.js";
import { annuity, marketRent, unitValue, chargeOff, BANK_SLOTS, sellLoan, lenderOf, ROW_LENDER, creditOk } from "./finance.js";

export function attachHousing(c) {
  c.foreclose = (l) => foreclose(c, l);
  c.pairUp = (i, j) => pairUp(c, i, j);
  c.moveOut = (i, share) => moveOut(c, i, share);
  c.dissolveHousehold = (h, why) => dissolve(c, h, why);
  c.assessedValue = () => { let v = 0; for (const b of c.world.buildings.each()) v += c.world.buildings.value[b]; return v; };
}
const F_each = (c) => [...c.firms.each()];
const vacancies = (c) => { const D = c.world.dwellings, out = []; for (const d of D.each()) if (D.hh[d] < 0) out.push(d); return out; };
function moveInto(c, h, d, own = false) {
  const H = c.hh, D = c.world.dwellings, T = c.world.buildings, old = H.home[h];
  if (old >= 0) { D.hh[old] = -1; T.occupied[D.bld[old]] = Math.max(0, T.occupied[D.bld[old]] - 1); }
  H.home[h] = d; D.hh[d] = h; T.occupied[D.bld[d]]++; H.moved[h] = c.epoch; H.evictAt[h] = 0; H.notice[h] = 0; H.noticeAt[h] = 0; H.rArr[h] = 0; H.rMo[h] = 0; H.lPat[h] = 0; H.ntc[h] = 0;
  if (!own) { H.tenure[h] = 0; H.rent[h] = D.rent[d]; H.landlord[h] = D.owner[d]; H.lease[h] = c.epoch; D.rentSince[d] = c.epoch; }
  for (const i of members(c, h)) { priorTrust(c.P, c.people, "tl", i); addMemory(c, i, M.moved_home); }
}
// who lets homes: the property companies and other firms, a bank holding a home it took back, the city, and the
// out-of-town owners who bought the buildings of companies that closed (they let them through managers)
const LETS = (o) => (o >= E_F0 && o < E_CITY) || o === E_CITY || o === E_ROW;
// the best vacant home a household can afford: rent under 35% of income, enough rooms, near work
function findHome(c, h, maxRent) {
  const H = c.hh, P = c.people, mem = members(c, h), wc = mem.map((i) => (P.today[i] & 1 ? c.workCell(i) : -1)).find((x) => x >= 0) ?? -1;
  return bestHome(c, H.inc[h], H.size[h], wc, maxRent);
}
// (the same search for a household of `size` people with income `inc`, someone working at cell `wc`)
function bestHome(c, inc, size, wc, maxRent) {
  const D = c.world.dwellings, W = c.world;
  let best = -1, bs = -1e18;
  for (const d of D.each()) {
    if (D.hh[d] >= 0 || D.forSale[d] || !LETS(D.owner[d]) || W.buildings.stage[D.bld[d]]) continue;
    if (D.afford[d] && inc > (c.gov.affordLimit || 0)) continue;                              // income-restricted homes go to those who qualify
    const r = D.rent[d]; if (r > maxRent) continue;
    const fc = W.frontCell(D.bld[d]), dd = wc >= 0 ? Math.abs((fc & NMASK) - (wc & NMASK)) + Math.abs((fc >> NSHIFT) - (wc >> NSHIFT)) : 20;
    const sc = -(r / 1000) - dd * 8 + Math.min(D.rooms[d], size) * 60 + c.vital[fc * 8] * 4 - c.vital[fc * 8 + 7] * 10;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}
// someone leaves a household to keep a home of their own (a grown child, a partner after a parting): a home their own
// pay can afford (rent within two fifths of it), a share of the household's ready money, a bank card of their own
function moveOut(c, i, share) {
  const P = c.people, H = c.hh, B = c.books, h0 = P.hh[i]; if (h0 < 0 || H.adults[h0] < 2 || ageYears(c, i) < 18) return -1;
  const pay = Math.round((P.emp[i] >= 0 ? P.wage[i] * P.hours[i] * 21.7 : P.ss[i] + P.pen[i]) * 0.82); if (pay < 100000) return -1;
  const d = bestHome(c, pay, 1, P.today[i] & 1 ? c.workCell(i) : -1, Math.round(pay * 0.4)); if (d < 0) return -1;
  const bank = B.bankOf[E_H0 + h0], h = newHousehold(c, bank); if (h < 0) return -1;
  removeFromHousehold(c, i); joinHousehold(c, i, h); H.head[h] = i;
  if (H.head[h0] >= 0 && ageYears(c, H.head[h0]) < 18) { const a = members(c, h0).find((j) => ageYears(c, j) >= 18); if (a !== undefined) H.head[h0] = a; }
  const dep = Math.floor(Math.max(0, B.get(E_H0 + h0, AC.DEPOSITS)) * share); if (dep > 0) B.pay(E_H0 + h0, E_H0 + h, dep, AC.EQUITY, AC.EQUITY, K.transfer);
  H.inc[h] = pay; H.exp[h] = Math.round(pay * 0.85); H.pantry[h] = 3000;
  const card = c.originate(3, bank, E_H0 + h, 0, c.banks[bank].rates.card, 0, -1); H.card[h] = card; if (card >= 0) { c.loans.lim[card] = 300000; H.cardLim[h] = 300000; }
  moveInto(c, h, d);
  return h;
}

export function housingDay(c, d, g) {
  const H = c.hh, B = c.books, D = c.world.dwellings, P = c.people, F = c.firms, e = c.epoch, s = c.cfg.seed;
  // rent is due on the first: households to their landlords, firms for their premises. A voucher holder pays their
  // share and HUD pays the landlord the rest (24 CFR 982.451). What a tenant cannot pay is owed; a landlord with a
  // tenant behind decides whether to serve the 14-day pay-or-vacate notice (RCW 59.12.030(3)) by a patience charge that
  // fills with each month owed and leaks as they are paid (law 57.9)
  if (d.monthStart) {
    for (const h of H.each()) {
      if (H.tenure[h] !== 0 || H.home[h] < 0 || !H.rent[h] || H.landlord[h] < 0) continue;
      const he = E_H0 + h, hap = H.voucher[h] ? Math.min(H.rent[h], H.hap[h]) : 0, share = H.rent[h] - hap;
      if (hap > 0) B.pay(E_FEDGOV, H.landlord[h], hap, AC.X_TRANSFER, AC.R_RENT, K.rent);
      // rent comes first: a household short of its share pays what it has (keeping a few days' food), and owes the rest
      let paid = 0; if (share > 0) paid = c.fund(he, share, true) ? share : Math.max(0, Math.min(share, B.get(he, AC.DEPOSITS) - H.size[h] * 5000));
      if (paid > 0) B.pay(he, H.landlord[h], paid, AC.X_RENT, AC.R_RENT, K.rent);
      if (paid < share) { H.rArr[h] += share - paid; H.rMo[h] = Math.min(255, H.rMo[h] + 1); for (const i of members(c, h)) P.lDe[i]++; }
      if (H.udStay[h]) planMonth(c, h);
      // what the state paid for the household under the Landlord Mitigation Program is repaid a twentieth of the month's
      // income at a time, in months when the rent is paid and the money is there
      if (H.lmp[h] > 0 && paid >= share && !H.rArr[h]) { const back = Math.min(H.lmp[h], Math.round(H.inc[h] / 20)); if (back > 0 && B.get(he, AC.DEPOSITS) >= back + 20000) { B.pay(he, E_STATE, back, AC.X_OTHER, AC.R_FEES, K.fee); H.lmp[h] -= back; } }
      // the landlord's patience fills with the months of rent owed (a part-month owed fills it partly)
      H.lPat[h] = lif(H.lPat[h], H.rArr[h] / Math.max(1, H.rent[h]) / landlordPatience(c, H.landlord[h]), 0.3);
      if (H.lPat[h] >= 1 && H.rArr[h] > 0 && !H.ntc[h] && !H.udStay[h]) serveNotice(c, h);
    }
    for (const f of F.each()) { if (F.status[f] === 1 || !F.rentDue[f] || F.landlord[f] < 0) continue; if (c.fund(E_F0 + f, F.rentDue[f], true)) B.pay(E_F0 + f, F.landlord[f], F.rentDue[f], AC.X_RENT, AC.R_RENT, K.rent); else F.distress[f] += 5; }
  }
  // notices take effect; tenants decide whether to stay
  for (const h of H.each()) {
    if (!H.size[h] || H.home[h] < 0) continue;                             // (an estate still being settled keeps its slot, not a tenancy)
    if (H.noticeAt[h] && H.noticeAt[h] === e) { H.rent[h] = H.notice[h]; D.rent[H.home[h]] = H.notice[h]; D.rentSince[H.home[h]] = e; H.noticeAt[h] = 0; }
    if (H.rArr[h] > 0) cure(c, h);
    if (H.evictAt[h] && H.evictAt[h] <= e) { if (H.rArr[h] > 0) hearing(c, h); else { H.evictAt[h] = 0; H.ntc[h] = 0; } }
  }
  if (g.housing && d.wd === 6) market(c, d, g);
  if (d.wd === 4 && c.outer) c.cityMigration(d);
  if (g.construction && d.d === 10) build(c, d);
}
// how many months behind a landlord bears before serving notice: agreeable, patient owners longer; the housing
// authority (the city) offers repayment agreements first, as HUD's lease rules ask of public landlords
function ownerTraitsOf(c, ent) {
  let who = -1; if (ent >= E_F0 && ent < E_B0) who = c.slotOf(c.firms.owner[ent - E_F0]); else if (ent >= E_H0 && ent < E_F0) who = c.hh.head[ent - E_H0];
  return who >= 0 ? c.people.traits[who] : 0x88888888;
}
function landlordPatience(c, ent) {
  if (ent === E_CITY) return 4;
  let who = -1; if (ent >= E_F0 && ent < E_B0) who = c.slotOf(c.firms.owner[ent - E_F0]); else if (ent >= E_H0 && ent < E_F0) who = c.hh.head[ent - E_H0];
  const t = who >= 0 ? c.people.traits[who] : 0x88888888;                       // a firm with no resident owner: a manager of middling temperament
  return 1 + (trait(t, T_A) + trait(t, T_C) - 8) / 12;
}
// the notice runs 14 days; a landlord then files an unlawful detainer, heard about three weeks later, and the sheriff
// serves the writ about ten days after the judgment. Paying everything owed before then ends it (RCW 59.18.410)
function serveNotice(c, h) {
  const H = c.hh, e = c.epoch; H.ntc[h] = e; H.evictAt[h] = e + 14 + 21 + 10;
  let old = 0; for (let k = 1; k < 3; k++) if (H.ntcs[h * 3 + k] < H.ntcs[h * 3 + old]) old = k; H.ntcs[h * 3 + old] = e;   // the year's notices, for the court
  for (const i of members(c, h)) addMemory(c, i, M.got_an_eviction_notice, H.landlord[h]);
  c.event("notice", `The ${c.names.person(H.head[h] >= 0 ? H.head[h] : members(c, h)[0]).split(" ")[1]} household is served a 14-day notice`);
}
// a tenant behind pays it off when the money is there; with a notice served, the head asks a friend who can spare it
// (their own agreeableness, trust and means decide), before the writ comes
// (a tenant under a court-ordered plan pays by its installments instead)
function cure(c, h) {
  const H = c.hh, B = c.books, P = c.people, he = E_H0 + h, owed = H.rArr[h]; if (H.udStay[h]) return;
  const cash = B.get(he, AC.DEPOSITS) + B.get(he, AC.SAVINGS);
  if (cash >= owed + 20000 && c.fund(he, owed)) { B.pay(he, H.landlord[h], owed, AC.X_RENT, AC.R_RENT, K.rent); H.rArr[h] = 0; H.rMo[h] = 0; return; }
  // each payday week what can be spared goes toward what is owed: all but a week's food and the coming rent's part
  // that the household's own care sets aside
  if ((c.epoch + h) % 7 === 0) { const head = H.head[h], keep = 20000 + H.size[h] * 6300 + Math.round(H.rent[h] * (head >= 0 ? Math.min(1, 0.4 + trait(P.traits[head], T_C) / 20) : 0.8) * Math.min(1, c.today.d / 30)), part = Math.min(owed - 1, cash - keep);
    if (part >= 5000 && c.fund(he, part)) { B.pay(he, H.landlord[h], part, AC.X_RENT, AC.R_RENT, K.rent); H.rArr[h] -= part; } }
  const head = H.head[h]; if (!H.ntc[h] || head < 0 || (c.epoch - H.ntc[h]) % 7 !== 3) return;
  if (friendHelps(c, h, H.rArr[h])) { B.pay(he, H.landlord[h], H.rArr[h], AC.X_RENT, AC.R_RENT, K.rent); H.rArr[h] = 0; H.rMo[h] = 0; }
}
// a friend who can spare it lends the household `amt` (their own agreeableness, the friendship and their means decide)
function friendHelps(c, h, amt) {
  const H = c.hh, B = c.books, P = c.people, he = E_H0 + h, head = H.head[h]; if (head < 0 || amt <= 0) return false;
  for (let k = 0; k < 4; k++) {
    const j = c.friendOf(head, k); if (j < 0 || P.hh[j] < 0 || P.hh[j] === h) continue;
    const fh = P.hh[j], fe = E_H0 + fh, spare = B.get(fe, AC.DEPOSITS) + B.get(fe, AC.SAVINGS) - c.hh.inc[fh] * 2;
    if (spare < amt || trait(P.traits[j], T_A) + Math.min(4, P.fw[head * 4 + k] / 64) < 10 || !c.fund(fe, amt)) continue;
    B.pay(fe, he, amt, AC.X_OTHER, AC.R_OTHER, K.transfer);
    for (const i of members(c, h)) addMemory(c, i, M.a_friend_helped_with_the_rent, E_H0 + fh); return true;
  }
  return false;
}
// the writ's day for a tenant still behind. At the show-cause hearing (or any time before the sheriff comes) a tenant
// may ask the court for a payment plan: the judge may stay the writ for up to ninety days if the tenant pays a month's
// rent within five court days and the rest of the judgment within the stay, weighing whether the tenant has had three
// or more pay-or-vacate notices in the past twelve months (RCW 59.18.410(3)). Tenants who are indigent (on public
// assistance, or under twice the poverty line) have appointed counsel, who makes the motion (RCW 59.18.640); others
// ask if they answer the summons. The court finds whether the tenant is low-income, for the Landlord Mitigation Program
function hearing(c, h) {
  const H = c.hh, B = c.books, P = c.people, e = c.epoch, he = E_H0 + h, head = H.head[h];
  if (H.udStay[h]) { evict(c, h); return; }                                             // a default on the plan: the writ is served
  let notices = 0; for (let k = 0; k < 3; k++) if (H.ntcs[h * 3 + k] && e - H.ntcs[h * 3 + k] < 365) notices++;
  const indigent = (H.progs[h] & 3) !== 0 || H.inc[h] / 0.82 <= (c.fpl(c.today.y, H.size[h]) * 2) / 12;
  const answers = indigent || (head >= 0 && trait(P.traits[head], T_C) >= 6);
  const first = Math.min(H.rArr[h], H.rent[h]);
  if (notices < 3 && answers && (c.fund(he, first, true) || (friendHelps(c, h, first) && c.fund(he, first)))) {
    B.pay(he, H.landlord[h], first, AC.X_RENT, AC.R_RENT, K.rent); H.rArr[h] -= first; H.evictAt[h] = 0; H.lPat[h] = 0;
    if (H.rArr[h] <= 0) { H.rArr[h] = 0; H.rMo[h] = 0; H.ntc[h] = 0; return; }                // a month's rent was all it owed
    H.udStay[h] = e + 90; H.udLow[h] = indigent ? 1 : 0; H.rMo[h] = 1;
    for (const i of members(c, h)) addMemory(c, i, M.the_court_gave_us_time_to_pay, H.landlord[h]);
    c.event("notice", `The court stays the writ against the ${c.names.person(head >= 0 ? head : members(c, h)[0]).split(" ")[1]} household on a ninety-day payment plan`);
    return;
  }
  // a tenant the court finds low-income who cannot make the first payment: the landlord is paid the judgment (up to
  // $5,000) from the state's Landlord Mitigation Program and the tenancy goes on; the tenant repays the state as they
  // can (RCW 59.18.410(3)(e), 43.31.605(1)(c)). Once in twelve months
  if (notices < 3 && answers && indigent && H.rArr[h] <= 500000 && H.landlord[h] >= 0 && (!H.lmpAt[h] || e - H.lmpAt[h] > 365) && c.fund(E_STATE, H.rArr[h])) {
    B.pay(E_STATE, H.landlord[h], H.rArr[h], AC.X_TRANSFER, AC.R_RENT, K.benefit); c.gov.wel.lmpPaid += H.rArr[h];
    H.lmp[h] += H.rArr[h]; H.lmpAt[h] = e; H.rArr[h] = 0; H.rMo[h] = 0; H.evictAt[h] = 0; H.ntc[h] = 0; H.lPat[h] = 0;
    for (const i of members(c, h)) addMemory(c, i, M.the_state_paid_what_we_owed_in_rent, E_STATE);
    c.event("notice", `The court finds the ${c.names.person(head >= 0 ? head : members(c, h)[0]).split(" ")[1]} household low-income; the Landlord Mitigation Program pays the judgment and the tenancy goes on`);
    return;
  }
  evict(c, h);
}
// the first of each month under a plan: the installment is the judgment left over the months left of the stay. A tenant
// who cannot pay it is in default; the landlord serves a notice of default and the sheriff serves the writ
function planMonth(c, h) {
  const H = c.hh, B = c.books, e = c.epoch, he = E_H0 + h;
  if (H.rArr[h] <= 0) { H.rArr[h] = 0; H.rMo[h] = 0; H.udStay[h] = 0; H.udLow[h] = 0; H.ntc[h] = 0; H.lPat[h] = 0; return; }
  const months = Math.max(1, Math.ceil((H.udStay[h] - e) / 30)), inst = Math.min(H.rArr[h], Math.ceil(H.rArr[h] / months));
  if (e < H.udStay[h] && c.fund(he, inst, true)) {
    B.pay(he, H.landlord[h], inst, AC.X_RENT, AC.R_RENT, K.rent); H.rArr[h] -= inst;
    if (H.rArr[h] <= 0) { H.rArr[h] = 0; H.rMo[h] = 0; H.udStay[h] = 0; H.udLow[h] = 0; H.ntc[h] = 0; H.lPat[h] = 0; }
    return;
  }
  H.evictAt[h] = e + 3;
}
function evict(c, h) {
  const H = c.hh, mem = members(c, h);
  if (!mem.length) { H.evictAt[h] = 0; H.rArr[h] = 0; H.rMo[h] = 0; H.ntc[h] = 0; H.udStay[h] = 0; return; }
  // after a default on a court-ordered plan, the state reimburses the landlord the judgment left for a tenant the court
  // found low-income (the Landlord Mitigation Program, RCW 43.31.605(1)(c))
  if (H.udStay[h] && H.udLow[h] && H.rArr[h] > 0 && H.landlord[h] >= 0 && c.fund(E_STATE, H.rArr[h])) c.books.pay(E_STATE, H.landlord[h], H.rArr[h], AC.X_TRANSFER, AC.R_RENT, K.benefit);
  H.udStay[h] = 0; H.udLow[h] = 0;
  for (const i of mem) addMemory(c, i, M.was_evicted, H.landlord[h]);
  c.event("eviction", `The ${c.names.person(H.head[h] >= 0 ? H.head[h] : mem[0]).split(" ")[1]} household is evicted`);
  const cheaper = findHome(c, h, Math.max(80000, Math.round(H.inc[h] * 0.3)));
  if (cheaper >= 0) moveInto(c, h, cheaper); else leaveCity(c, h, "after an eviction");
}
// Saturdays: rent notices are answered, renters move, savers buy
function market(c, d, g) {
  const H = c.hh, B = c.books, D = c.world.dwellings, P = c.people, e = c.epoch, s = c.cfg.seed;
  // renters who are overburdened or who no longer trust the landlord look for somewhere else
  for (const h of H.each()) {
    if (H.tenure[h] !== 0 || H.home[h] < 0) continue;
    const head = H.head[h]; if (head < 0) continue;
    const rent = H.noticeAt[h] ? H.notice[h] : H.rent[h], burden = (rent * 1000) / Math.max(1, H.inc[h]);
    const unhappy = P.tlLv[head] === 0 || burden > 450 || (H.size[h] > D.rooms[H.home[h]] + 1);
    if (!unhappy || !urge(H.hurge, h * 6 + 4, 0.25)) continue;   // the wish to move builds until the household looks (law 57.9)
    const alt = findHome(c, h, Math.round(H.inc[h] * 0.35)); if (alt >= 0 && D.rent[alt] < rent * 0.95 || (alt >= 0 && H.size[h] > D.rooms[H.home[h]] + 1)) { const cost = 150000; if (c.fund(E_H0 + h, cost)) B.pay(E_H0 + h, E_ROW, cost, AC.X_OTHER, AC.R_SALES, K.purchase); moveInto(c, h, alt); }
  }
  // buyers: savings for a deposit, payments within 43% of income, and a reason to own
  const apps = c.banks.map(() => []);
  const forSale = []; for (const dd of D.each()) if (D.forSale[dd] && (D.hh[dd] < 0 || H.sell[D.hh[dd]]) && !c.world.buildings.proj[D.bld[dd]]) forSale.push(dd);
  // property companies holding more than two empty houses sell one a month
  const vh = new Map(); for (const dd of D.each()) if (D.hh[dd] < 0 && !D.forSale[dd] && c.world.buildings.kind[D.bld[dd]] === BK.house && D.owner[dd] >= E_F0) vh.set(D.owner[dd], (vh.get(D.owner[dd]) || 0) + 1);
  for (const dd of D.each()) if (D.hh[dd] < 0 && !D.forSale[dd] && c.world.buildings.kind[D.bld[dd]] === BK.house && !c.world.buildings.proj[D.bld[dd]] && D.owner[dd] >= E_F0 && d.d <= 7 && (vh.get(D.owner[dd]) || 0) > 2) { vh.set(D.owner[dd], 0); D.forSale[dd] = 1; D.price[dd] = Math.round(D.value[dd] * (1 + (c.gov.heat || 0) / 1000) / 100000) * 100000; forSale.push(dd); }
  if (!forSale.length) return;
  for (const h of H.each()) {
    if (H.tenure[h] !== 0 || H.home[h] < 0) continue;
    const head = H.head[h]; if (head < 0 || ageYears(c, head) < 25 || P.status[head] !== 2) continue;
    const t = P.traits[head], he = E_H0 + h, cash = B.get(he, AC.DEPOSITS) + B.get(he, AC.SAVINGS);
    if (!urge(H.hurge, h * 6 + 5, Math.max(0, trait(t, T_C) + trait(t, T_RISK) - 8) / 16)) continue;   // the resolve to buy builds with prudence and appetite
    let pick = -1;
    for (const dd of forSale) { const price = D.price[dd], down = Math.round(price / 10); if (cash < down + 600000) continue; const k = B.bankOf[he], pmt = annuity(price - down, c.banks[k].rates.mortgage, 360) + Math.round(price * 0.009 / 12); if (pmt * 1000 > H.inc[h] * 1.0 * 430) continue; if (D.rooms[dd] + 1 < H.size[h]) continue; pick = dd; break; }
    if (pick < 0 || !creditOk(c, h, annuity(D.price[pick] - Math.round(D.price[pick] / 10), c.banks[B.bankOf[he]].rates.mortgage, 360))) continue;
    const k = B.bankOf[he]; apps[k].push([c.hh.kbLv[h], trustScore(c.P, c.hh, "kb", h) >> 4, Math.min(1023, Math.floor(cash / 100000)), h, pick]);
  }
  const taken = new Set();
  apps.forEach((list, k) => {
    if (!list.length) return;
    const bank = c.banks[k], slots = Math.max(0, Math.round(BANK_SLOTS[k] * (1000 - bank.fear) / 1000));
    const byH = new Map(list.map((a) => [a[3], a[4]]));
    const { admitted, refused } = admitE1(list.map((a) => [a[0], a[1], a[2], a[3]]), slots);
    for (const h of admitted) { const dd = byH.get(h); if (taken.has(dd) || (D.hh[dd] >= 0 && !H.sell[D.hh[dd]]) || D.hh[dd] === h) continue; taken.add(dd); buyHome(c, h, dd, k); bank.approvals++; }
    for (const h of refused) { bank.denials++; const head = c.hh.head[h]; if (head >= 0) { addMemory(c, head, M.was_refused_a_loan, E_B0 + k); P.bDe[head]++; } }
  });
}
function buyHome(c, h, d, k) {
  const H = c.hh, B = c.books, D = c.world.dwellings, P = c.people, he = E_H0 + h, price = D.price[d], down = Math.round(price / 10), seller = D.owner[d];
  // a seller still living there needs somewhere to go first (a rental they can afford); without one, no sale yet
  const occ = D.hh[d], alt = occ >= 0 && occ !== h ? findHome(c, occ, Math.round(H.inc[occ] * 0.4)) : -1; if (occ >= 0 && occ !== h && alt < 0) return;
  const l = c.originate(0, k, he, price - down, c.banks[k].rates.mortgage, 360, d); if (l < 0) return;
  if (!c.fund(he, price)) { return; }
  if (price - down <= 83275000) sellLoan(c, l);   // conforming loans (the 2026 limit, $832,750) go to the secondary market
  B.pay(he, seller, price, AC.HOME, AC.R_OTHER, K.property);
  // at closing the seller's mortgage on the home is paid off from the price
  if (seller >= E_H0 && seller < E_F0) { const sh = seller - E_H0, L = c.loans, ml = H.mort[sh]; H.sell[sh] = 0; if (ml >= 0 && L.status[ml] === 1 && L.col[ml] === d && L.prin[ml] > 0) { const owed = L.prin[ml]; if (c.fund(seller, owed)) { B.pay(seller, lenderOf(c, ml), owed, AC.L_MORT, AC.LOAN_MORT, K.repayment); L.prin[ml] = 0; L.status[ml] = 3; H.mort[sh] = -1; L.release(ml); } } }
  removeAsset(c, seller, D.value[d]);
  if (occ >= 0 && occ !== h) moveInto(c, occ, alt);
  D.owner[d] = he; D.forSale[d] = 0; H.mort[h] = l;
  if (seller >= E_H0 && seller < E_F0 && H.size[seller - E_H0] === 0) dissolve(c, seller - E_H0, "estate sold");
  const old = H.home[h]; moveInto(c, h, d, true); H.tenure[h] = 1; H.rent[h] = 0; H.landlord[h] = -1;
  if (old >= 0) { /* the rental they left is vacant again */ }
  for (const i of members(c, h)) addMemory(c, i, M.bought_a_home, d);
  c.event("home", `The ${c.names.person(H.head[h]).split(" ")[1]} household buys a home for $${(price / 100).toLocaleString("en-US")}`);
}
// the seller's book value leaves its books; the difference to the price is its gain or loss
function removeAsset(c, owner, value) {
  const B = c.books;
  if (owner >= E_H0 && owner < E_F0) { const v = Math.min(value, B.get(owner, AC.HOME)); if (v > 0) B.post(owner, AC.R_OTHER, AC.HOME, v, K.property); return; }
  let left = value;
  for (const a of [AC.BUILDINGS, AC.LAND]) { const v = Math.min(left, B.get(owner, a)); if (v > 0) { B.post(owner, AC.R_OTHER, a, v, K.property); left -= v; } }
}
function foreclose(c, l) {
  const L = c.loans, B = c.books, H = c.hh, D = c.world.dwellings, who = L.who[l], h = who - E_H0, k = L.bank[l], be = lenderOf(c, l), d = L.col[l];
  const prin = L.prin[l], value = d >= 0 ? D.value[d] : 0, acq = Math.min(value, prin);
  if (acq > 0) { B.post(be, AC.BUILDINGS, AC.LOAN_MORT, acq, K.property, who); }
  if (prin - acq > 0) B.post(be, AC.X_LOSS, AC.LOAN_MORT, prin - acq, K.charge_off, who);
  B.post(who, AC.L_MORT, AC.R_OTHER, prin, K.property, be);
  const home = B.get(who, AC.HOME); if (home > 0 && d >= 0) B.post(who, AC.X_LOSS, AC.HOME, Math.min(home, value), K.property, be);
  if (c.banks[k]) { c.banks[k].chargeoffs += prin - acq; c.banks[k].fear = Math.min(1000, c.banks[k].fear + 30); }
  L.prin[l] = 0; L.status[l] = 3; H.mort[h] = -1; H.sell[h] = 0; L.release(l);
  tickTrust(c.P, H, "kb", h, 1, 0, 1, F_RUNNING | F_FAULT, c.C);
  if (d >= 0) { D.owner[d] = be; D.forSale[d] = 1; D.price[d] = Math.round(value * 0.92 / 100000) * 100000; }
  for (const i of members(c, h)) { addMemory(c, i, M.was_evicted, be); c.people.bDe[i] += 3; }
  c.event("foreclosure", `${c.banks[k] ? c.banks[k].short : "The loan's investors"} forecloses on the ${c.names.person(H.head[h] >= 0 ? H.head[h] : members(c, h)[0]).split(" ")[1]} household's home`);
  H.tenure[h] = 0;
  const alt = findHome(c, h, Math.round(H.inc[h] * 0.35));
  if (alt >= 0) moveInto(c, h, alt); else leaveCity(c, h, "after a foreclosure");
}
// two people pair up: the one with fewer members (or the smaller home) moves in with the other
function pairUp(c, i, j) {
  const P = c.people, H = c.hh, hi = P.hh[i], hj = P.hh[j];
  P.partner[i] = P.sin[j]; P.partner[j] = P.sin[i]; addMemory(c, i, M.found_a_partner, c.personRef(j)); addMemory(c, j, M.found_a_partner, c.personRef(i));
  c.event("partners", `${c.who(i)} and ${c.who(j)} become partners`, [P.sin[i], P.sin[j]]);
  if (hi === hj) return;
  const [mover, stay] = H.size[hi] > H.size[hj] || (H.tenure[hi] === 1 && H.tenure[hj] !== 1) ? [j, hi] : [i, hj];
  const from = P.hh[mover];
  if (H.size[from] === 1) { removeFromHousehold(c, mover); joinHousehold(c, mover, stay); mergeMoney(c, from, stay); dissolve(c, from, "moved in"); }
  else { removeFromHousehold(c, mover); joinHousehold(c, mover, stay); }
  H.joint[stay] = 1;
  c.event("couple", `${c.names.person(i)} and ${c.names.person(j)} move in together`);
}
function mergeMoney(c, from, to) {
  const B = c.books, fe = E_H0 + from, te = E_H0 + to;
  const sav = B.get(fe, AC.SAVINGS); if (sav > 0) B.fromSavings(fe, sav);
  const dep = B.get(fe, AC.DEPOSITS); if (dep > 0) B.pay(fe, te, dep, AC.EQUITY, AC.EQUITY, K.transfer);
}
// a household ends: its home is vacated (or sold), its loans settled from what it has, what is left goes to heirs
function dissolve(c, h, why) {
  const H = c.hh, B = c.books, D = c.world.dwellings, L = c.loans, he = E_H0 + h;
  const d = H.home[h];
  if (d >= 0) { D.hh[d] = -1; c.world.buildings.occupied[D.bld[d]] = Math.max(0, c.world.buildings.occupied[D.bld[d]] - 1); if (D.owner[d] === he) { D.forSale[d] = 1; D.price[d] = Math.round(D.value[d] / 100000) * 100000; } }
  H.home[h] = -1;
  // the tenancy is over: what was owed in rent is the landlord's loss, and no notice, plan or voucher outlives it
  H.rArr[h] = 0; H.rMo[h] = 0; H.lPat[h] = 0; H.ntc[h] = 0; H.evictAt[h] = 0; H.udStay[h] = 0; H.udLow[h] = 0; H.notice[h] = 0; H.noticeAt[h] = 0; H.voucher[h] = 0; H.hap[h] = 0; H.vWait[h] = 0; H.lmp[h] = 0; H.landlord[h] = -1; H.rent[h] = 0;
  const sav = B.get(he, AC.SAVINGS); if (sav > 0) B.fromSavings(he, sav);
  const inv = B.get(he, AC.INVEST); if (inv > 0) B.pay(E_ROW, he, inv, AC.FUND_SHARES, AC.INVEST, K.investment);
  for (const l of L.each()) {
    if (L.who[l] !== he || L.status[l] !== 1) continue;
    const pay = Math.min(L.prin[l], B.get(he, AC.DEPOSITS)); if (pay > 0) { B.pay(he, lenderOf(c, l), pay, [AC.L_MORT, AC.L_BIZ, AC.L_AUTO, AC.L_CARD][L.type[l]], [AC.LOAN_MORT, AC.LOAN_BIZ, AC.LOAN_AUTO, AC.LOAN_CARD][L.type[l]], K.repayment); L.prin[l] -= pay; }
    if (L.prin[l] > 0) chargeOff(c, l); L.status[l] = 3; L.release(l);
  }
  const veh = B.get(he, AC.VEHICLE); if (veh > 0) B.pay(E_ROW, he, Math.round(veh / 2), AC.X_PURCHASES, AC.R_OTHER, K.other), B.post(he, AC.X_OTHER, AC.VEHICLE, veh, K.other);
  H.cars[h] = 0;
  // an owned home passes with the estate: it stays on these books until it sells (to keep both sides of every claim)
  const left = B.get(he, AC.DEPOSITS); if (left > 0 && H.home[h] < 0 && !(d >= 0 && D.owner[d] === he)) B.pay(he, E_ROW, left, AC.EQUITY, AC.R_OTHER, K.transfer);
  const tax = -B.get(he, AC.PROP_TAX_PAY); if (tax > 0) { /* the estate still owes its property tax: it remains payable */ }
  // the household's slot is freed only when nothing is left on its books: no home still to sell, no tax still owed
  if (!(d >= 0 && D.owner[d] === he) && B.get(he, AC.HOME) === 0 && B.get(he, AC.DEPOSITS) === 0 && B.get(he, AC.PROP_TAX_PAY) === 0 && B.get(he, AC.INCOME_TAX_PAY) === 0) H.release(h);
  else H.size[h] = 0;
}
function leaveCity(c, h, why, place = -1) {
  const P = c.people, H = c.hh, mem = members(c, h);
  c.event("departure", `The ${c.names.person(H.head[h] >= 0 ? H.head[h] : mem[0]).split(" ")[1]} household leaves Port Alder ${why}`);
  // the household goes on in the outer layers, its people keeping their numbers (and a commuter the job, where the
  // new home is within its reach); their friends here remember them
  if (c.emigrate) c.emigrate(h, place); else for (const i of mem) relocate(c, P.sin[i], -1, -1, place);
  for (const i of mem) { if (P.emp[i] >= 0) c.leaveJob(i, false); }
  for (const i of mem) for (let k = 0; k < 4; k++) { const f = c.slotOf(P.friend[i * 4 + k]); if (f >= 0 && P.hh[f] !== h) addMemory(c, f, M.a_friend_moved_away, c.personRef(i)); }
  for (const i of mem) { scrubPerson(c, i); removeFromHousehold(c, i); P.release(i); }
  dissolve(c, h, why);
}
// people move in and out of Port Alder through the outer layers: see periphery.js (cityMigration)
// new floors on apartment buildings when homes run short: a property company contracts a builder
function build(c, d) {
  const W = c.world, T = W.buildings, D = W.dwellings, F = c.firms, B = c.books, s = c.cfg.seed, e = c.epoch, G = c.gov;
  let vac = 0, all = 0; for (const dd of D.each()) { all++; if (D.hh[dd] < 0) vac++; }
  // finish projects that are due
  for (const b of T.each()) if (T.started[b] && e - T.started[b] >= 150) {
    T.started[b] = 0; T.floors[b]++; const add = T.w[b] * T.h[b];
    for (let u = 0; u < add; u++) { const dd = D.alloc(); if (dd < 0) break; D.bld[dd] = b; D.hh[dd] = -1; D.owner[dd] = T.owner[b]; D.rooms[dd] = 1 + (u % 3); D.value[dd] = unitValue(c, dd); D.rent[dd] = marketRent(c, dd); }
    T.units[b] += add; G.newConstruction = (G.newConstruction || 0) + add * 30000000;
    c.event("construction", `A new floor of ${add} homes opens on ${["", "", "an apartment building", "a mixed-use building"][T.kind[b]] || "a building"} in ${W.hoodName(W.frontCell(b))}`);
  }
  const want = (G.newHousing || 0) > 0 || vac * 1000 < all * 30;
  if (!want) return;
  const builders = [...F.each()].filter((f) => F.status[f] === 0 && F.sector[f] === SK.construction); if (!builders.length) return;
  let best = -1, bs = -1e9;
  for (const b of T.each()) { if (T.kind[b] !== BK.apartments || T.started[b] || T.stage[b] || T.floors[b] >= 8 || T.owner[b] < E_F0 || T.owner[b] >= E_B0) continue; const fc = W.frontCell(b), sc = c.vital[fc * 8] * 5 + W.landValue[fc] / 1000 - T.floors[b] * 5; if (sc > bs) { bs = sc; best = b; } }
  if (best < 0) return;
  const owner = T.owner[best], cost = T.w[best] * T.h[best] * 32000000, builder = builders.reduce((x, y) => (F.mRev[y] < F.mRev[x] ? y : x), builders[0]);
  if (!c.borrow(owner, cost, 1) && !(c.fund(owner, cost, true))) return;
  if (!c.fund(owner, cost, true)) return;
  B.pay(owner, E_F0 + builder, cost, AC.BUILDINGS, AC.R_SALES, K.construction); F.mRev[builder] += cost; F.ytdGross[builder] += cost;
  T.value[best] += cost; T.started[best] = e; if (G.newHousing) G.newHousing = Math.max(0, G.newHousing - T.w[best] * T.h[best]);
  c.event("construction", `${c.names.firm(builder)} starts a new floor on an apartment building in ${W.hoodName(W.frontCell(best))}`);
}

export function housingMonth(c, d, g) {
  const D = c.world.dwellings, H = c.hh, P = c.people, e = c.epoch, s = c.cfg.seed, G = c.gov;
  // market rents move with vacancy; home values with rents and rates
  let vac = 0, all = 0; for (const dd of D.each()) { all++; if (D.hh[dd] < 0) vac++; }
  const v = vac * 1000 / Math.max(1, all), drift = v < 40 ? 6 : v < 70 ? 3 : v > 120 ? -3 : 1;   // per mille a month
  G.vacancy = Math.round(v); G.heat = sat((G.heat || 0) + (v < 50 ? 8 : -6), -150, 250);
  const mr = c.nation.rate(e).mid;
  // an owner whose unit sits empty asks less each month it does (the cautious more), on top of the market's drift
  for (const dd of D.each()) {
    D.vacM[dd] = D.hh[dd] >= 0 ? 0 : Math.min(255, D.vacM[dd] + 1);
    const ask = D.hh[dd] >= 0 ? 0 : drift - (D.vacM[dd] >= 2 ? Math.min(30, (D.vacM[dd] - 1) * (4 + (16 - trait(ownerTraitsOf(c, D.owner[dd]), T_RISK)) / 2)) : 0);
    D.rent[dd] = D.afford[dd] ? Math.min(D.rent[dd], c.gov.affordRent || D.rent[dd]) : D.hh[dd] < 0 ? Math.max(65000, Math.round(D.rent[dd] * (1000 + ask) / 1000 / 500) * 500) : D.rent[dd]; D.value[dd] = Math.round(D.value[dd] * (1000 + drift - (mr > 425 ? 2 : 0)) / 1000); }
  // landlords send rent notices ninety days before an anniversary, within the state cap
  // a landlord with empty homes of its own does not push its sitting tenants (a soft market): its wish to raise fades
  // with the share of its homes that stand empty
  const cap = rentCap(d.y, c.nation), own = new Map();
  for (const dd of D.each()) { const o = D.owner[dd]; if (o < E_F0) continue; const v = own.get(o) || [0, 0]; v[0]++; if (D.hh[dd] < 0) v[1]++; own.set(o, v); }
  for (const h of H.each()) {
    if (H.tenure[h] !== 0 || H.home[h] < 0 || H.noticeAt[h] || H.landlord[h] < E_F0) continue;
    const anniv = H.lease[h] + 365 * Math.max(1, Math.ceil((e + RENT_NOTICE_DAYS - H.lease[h]) / 365));
    if (anniv - e > RENT_NOTICE_DAYS + 31 || anniv - e < RENT_NOTICE_DAYS) continue;
    if (c.world.dwellings.afford[H.home[h]] || c.world.buildings.stage[c.world.dwellings.bld[H.home[h]]]) continue;   // capped homes, and homes on notice, get no increase
    const L = H.landlord[h], A = trait(L < E_B0 ? c.ownerTraits(L - E_F0) : ownerTraitsOf(c, L), T_A), market = marketRent(c, H.home[h]);
    const ov = own.get(H.landlord[h]) || [1, 0], soft = Math.max(0, 1 - (ov[1] / Math.max(1, ov[0])) * 8);
    const want = Math.round(H.rent[h] * (1 + Math.max(0, (market - H.rent[h]) / H.rent[h]) * (1 - A / 20) * soft));
    const capped = Math.min(want, Math.floor(H.rent[h] * (1e6 + cap) / 1e6 / 500) * 500);
    if (capped <= H.rent[h]) { for (const i of members(c, h)) P.lCo[i]++; continue; }
    H.notice[h] = capped; H.noticeAt[h] = e + RENT_NOTICE_DAYS;
    const pct = (capped - H.rent[h]) * 1000 / H.rent[h];
    for (const i of members(c, h)) { P.lDe[i] += pct > 50 ? 2 : 1; if (pct > 30) addMemory(c, i, M.rent_went_up, H.landlord[h], -Math.min(127, 20 + pct)); P.expRent[i] = Math.round(P.expRent[i] * 0.7 + pct * 10 * 0.3); }
  }
  // repairs and maintenance: owners hire builders now and then; landlords keep up their buildings
  const builders = [...c.firms.each()].filter((f) => c.firms.status[f] === 0 && SECTORS[c.firms.sector[f]].key === "construction");
  if (builders.length) {
    const B = c.books, F = c.firms, rate = 65000 + (c.gov.localSales ?? 30000);
    for (const h of H.each()) {
      if (H.tenure[h] !== 1 || H.home[h] < 0) continue;
      // owners repair as the house's wear presses on them (law 57.9): more often the worse it gets
      const hb0 = c.world.dwellings.bld[H.home[h]], cond = c.world.buildings.cond[hb0];
      if (!urge(H.hurge, h * 6 + 3, 0.07 * (1 + Math.max(0, 700 - cond) / 300))) continue;
      const net = sat((1000 - cond) * 2000, 200000, 1500000), tax = ppm(net, rate), f = builders.reduce((x, y) => (F.mRev[y] < F.mRev[x] ? y : x), builders[0]);
      if (!c.fund(E_H0 + h, net + tax)) continue;
      const hb = c.world.dwellings.bld[H.home[h]], Tb = c.world.buildings; Tb.cond[hb] = Math.min(1000, Tb.cond[hb] + Math.floor(net / Math.max(1, Math.floor(Tb.value[hb] / 1000))));
      B.pay(E_H0 + h, E_F0 + f, net + tax, AC.X_PURCHASES, AC.R_SALES, K.construction); B.post(E_H0 + h, AC.X_TAX_SALES, AC.X_PURCHASES, tax, K.tax_accrual);
      B.post(E_F0 + f, AC.R_SALES, AC.SALES_TAX_PAY, tax, K.tax_accrual, E_STATE); F.taxDay[f] += 0; c.accrueSalesTax(E_F0 + f, tax);
      F.mRev[f] += net; F.ytdGross[f] += net;
    }
    // (property companies' upkeep is in develop.js, where it restores their buildings' condition)
  }
  let hp = 0, nh = 0; for (const dd of D.each()) if (c.world.buildings.kind[D.bld[dd]] === BK.house) { hp += D.value[dd]; nh++; } G.avgHomePrice = nh ? Math.round(hp / nh) : 0;
}

export { moveInto, findHome, leaveCity, removeAsset, dissolve };

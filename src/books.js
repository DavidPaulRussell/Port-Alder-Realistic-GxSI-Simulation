// Integer-cent double-entry books for every entity in Port Alder, and their audit.
// SPDX-License-Identifier: GPL-3.0-only
//
// Every posting debits one account and credits another of the same entity by the same whole number of
// cents, so each entity's balances sum to zero (debits positive). A payment between entities posts in
// the payer, the payee and every bank or central-bank account the money passes through, so claims
// always appear on both sides: a deposit is an asset of its holder and a liability of its bank, a loan
// an asset of the lender and a liability of the borrower, a tax payable a receivable of the government.
// The audit checks every one of those pairings, and that all financial claims in the closed system
// (the city with the State, the United States, the Federal Reserve and the rest of the world) sum to zero.

import { SCALE } from "./scale.js";

/* ------------------------------------------------------------------ the chart of accounts */
// [key, name, type] with type A asset (financial), R real asset, C contra asset, L liability, Q equity, I income, X expense
export const ACCOUNTS = [
  ["RESERVES", "Reserves at the Federal Reserve", "A"], ["DEPOSITS", "Checking deposits", "A"], ["SAVINGS", "Savings deposits", "A"], ["INVEST", "Investment funds", "A"],
  ["LOAN_MORT", "Mortgage loans", "A"], ["LOAN_BIZ", "Business loans", "A"], ["LOAN_AUTO", "Auto loans", "A"], ["LOAN_CARD", "Card balances", "A"],
  ["LOAN_IB", "Federal funds sold", "A"], ["LOAN_DW", "Discount window loans", "A"], ["MUNIS", "Municipal bonds", "A"], ["TREAS", "Treasury securities", "A"],
  ["TAXR_SALES", "Sales tax receivable", "A"], ["TAXR_BO", "B&O tax receivable", "A"], ["TAXR_FED", "Federal payroll taxes receivable", "A"], ["TAXR_PAYROLL", "State payroll premiums receivable", "A"],
  ["TAXR_CITYBIZ", "City business tax receivable", "A"], ["TAXR_PROP", "Property tax receivable", "A"], ["TAXR_INCOME", "Income tax receivable", "A"], ["DIST_RECV", "Local sales tax due from the State", "A"],
  ["INVENTORY", "Inventory", "R"], ["EQUIP", "Equipment", "R"], ["BUILDINGS", "Buildings", "R"], ["LAND", "Land", "R"],
  ["HOME", "Home", "R"], ["VEHICLE", "Vehicles", "R"], ["INFRA", "Streets, transit and parks", "R"], ["ACC_DEPR", "Accumulated depreciation", "C"],
  ["DEP_PAY", "Customer checking deposits", "L"], ["SAV_PAY", "Customer savings deposits", "L"], ["RES_PAY", "Bank reserves", "L"], ["GOV_ACCT_PAY", "Government and correspondent accounts", "L"],
  ["L_MORT", "Mortgage", "L"], ["L_BIZ", "Business loan", "L"], ["L_AUTO", "Auto loan", "L"], ["L_CARD", "Card balance", "L"],
  ["L_IB", "Federal funds purchased", "L"], ["L_DW", "Discount window borrowing", "L"], ["BONDS", "Bonds outstanding", "L"], ["SALES_TAX_PAY", "Sales tax payable", "L"],
  ["BO_PAY", "B&O tax payable", "L"], ["FED_PAYROLL_PAY", "Federal payroll taxes payable", "L"], ["STATE_PAYROLL_PAY", "State payroll premiums payable", "L"], ["CITYBIZ_PAY", "City business tax payable", "L"],
  ["PROP_TAX_PAY", "Property tax payable", "L"], ["INCOME_TAX_PAY", "Income tax owed", "L"], ["DIST_PAY", "Local sales tax owed to the city", "L"], ["FUND_SHARES", "Fund shares issued", "L"],
  ["EQUITY", "Opening equity and capital", "Q"], ["RETAINED", "Retained earnings", "Q"],
  ["R_SALES", "Sales", "I"], ["R_EXPORT", "Export sales", "I"], ["R_WAGES", "Wages and salaries", "I"], ["R_TIPS", "Tips", "I"],
  ["R_INTEREST", "Interest income", "I"], ["R_RENT", "Rent", "I"], ["R_TRANSFER", "Benefits and credits received", "I"], ["R_INVEST", "Investment returns", "I"],
  ["R_FEES", "Fees and fares", "I"], ["R_SALES_TAX", "Sales tax revenue", "I"], ["R_BO", "B&O tax revenue", "I"], ["R_PROP_TAX", "Property tax revenue", "I"],
  ["R_PAYROLL_FED", "Social Security, Medicare and FUTA", "I"], ["R_INCOME_TAX", "Income tax revenue", "I"], ["R_PAYROLL_STATE", "PFML, WA Cares, UI and L&I", "I"], ["R_CITYBIZ", "City business tax revenue", "I"],
  ["R_INTERGOV", "Intergovernmental revenue", "I"], ["R_OTHER", "Other income", "I"],
  ["X_COGS", "Cost of goods sold", "X"], ["X_GROCERIES", "Groceries", "X"], ["X_DINING", "Dining", "X"], ["X_GOODS", "Goods", "X"],
  ["X_SERVICES", "Services", "X"], ["X_HEALTH", "Health", "X"], ["X_TRANSPORT", "Transport", "X"], ["X_RECREATION", "Recreation", "X"],
  ["X_UTILITIES", "Light and water", "X"], ["X_RENT", "Rent", "X"], ["X_WAGES", "Wages and salaries", "X"], ["X_PAYROLL_TAX", "Employer payroll taxes", "X"],
  ["X_BENEFITS", "Employee health cover", "X"], ["X_INTEREST", "Interest expense", "X"], ["X_DEPR", "Depreciation", "X"], ["X_TAX_SALES", "Sales tax paid", "X"],
  ["X_TAX_INCOME", "Federal income tax", "X"], ["X_TAX_PAYROLL", "Payroll taxes and premiums withheld", "X"], ["X_TAX_BIZ", "B&O and business taxes", "X"], ["X_TAX_PROP", "Property tax", "X"],
  ["X_LOSS", "Credit losses", "X"], ["X_TRANSFER", "Benefits paid", "X"], ["X_PURCHASES", "Purchases and contracts", "X"], ["X_OTHER", "Other expenses", "X"],
];
export const NACC = ACCOUNTS.length;
export const AC = Object.fromEntries(ACCOUNTS.map(([k], i) => [k, i]));
export const ACC_TYPE = ACCOUNTS.map((a) => a[2]);
export const IS_FIN = ACCOUNTS.map((a) => a[2] === "A" || a[2] === "L");
export const CONS_ACC = [AC.X_GROCERIES, AC.X_DINING, AC.X_GOODS, AC.X_SERVICES, AC.X_HEALTH, AC.X_TRANSPORT, AC.X_RECREATION, AC.X_UTILITIES];
// tax payable -> receivable pairs (the payer's liability and the government's asset)
export const TAX_PAIRS = [
  ["sales", AC.SALES_TAX_PAY, AC.TAXR_SALES], ["B&O", AC.BO_PAY, AC.TAXR_BO], ["federal payroll", AC.FED_PAYROLL_PAY, AC.TAXR_FED],
  ["state payroll", AC.STATE_PAYROLL_PAY, AC.TAXR_PAYROLL], ["city business", AC.CITYBIZ_PAY, AC.TAXR_CITYBIZ], ["property", AC.PROP_TAX_PAY, AC.TAXR_PROP],
  ["income", AC.INCOME_TAX_PAY, AC.TAXR_INCOME],
];
export const LOAN_PAIRS = [["mortgage", AC.LOAN_MORT, AC.L_MORT], ["business", AC.LOAN_BIZ, AC.L_BIZ], ["auto", AC.LOAN_AUTO, AC.L_AUTO], ["card", AC.LOAN_CARD, AC.L_CARD]];

/* ------------------------------------------------------------------ entities */
export const HCAP = SCALE.households, FCAP = SCALE.firms, BCAP = 4;
export const E_H0 = 0, E_F0 = HCAP, E_B0 = HCAP + FCAP;
export const E_CITY = E_B0 + BCAP, E_SCHOOL = E_CITY + 1, E_STATE = E_CITY + 2, E_FEDGOV = E_CITY + 3, E_FED = E_CITY + 4, E_ROW = E_CITY + 5, E_N = E_CITY + 6;
export const SECTOR_NAMES = { H: "Households", F: "Firms", K: "Banks", C: "City", S: "School district", W: "State of Washington", U: "United States", R: "Federal Reserve", X: "Rest of the world" };
export function sectorOf(e) {
  if (e < E_F0) return "H"; if (e < E_B0) return "F"; if (e < E_CITY) return "K";
  return ["C", "S", "W", "U", "R", "X"][e - E_CITY];
}
// how an entity holds money: N at a city bank, G at the Federal Reserve, K a bank (reserves), F the Federal Reserve
export const holdKind = (e) => (e >= E_B0 && e < E_CITY ? "K" : e === E_FED ? "F" : e === E_STATE || e === E_FEDGOV || e === E_ROW ? "G" : "N");

export const KINDS = ["opening", "sale", "purchase", "wage", "tip", "tax accrual", "tax payment", "benefit", "loan", "repayment", "interest", "rent",
  "import", "export", "investment", "depreciation", "fee", "charge-off", "property", "bond", "settlement", "transfer", "closing", "construction", "other"];
export const K = Object.fromEntries(KINDS.map((k, i) => [k.replace(/[^a-z]+/g, "_"), i]));

export class BooksError extends Error {}

export class Books {
  constructor() {
    this.bal = new Float64Array(E_N * NACC);
    this.bankOf = new Int8Array(E_N).fill(-1);          // city bank index for N entities
    this.JCAP = 1 << 18;
    this.j = { epoch: new Uint16Array(this.JCAP), ent: new Int32Array(this.JCAP), dr: new Uint8Array(this.JCAP), cr: new Uint8Array(this.JCAP),
      amt: new Float64Array(this.JCAP), kind: new Uint8Array(this.JCAP), cp: new Int32Array(this.JCAP) };
    this.jn = 0; this.epoch = 0;
    this.day = { count: new Uint32Array(KINDS.length), sum: new Float64Array(KINDS.length) };
    this.lines = 0;
  }
  get(e, a) { return this.bal[e * NACC + a]; }
  // the balance in its normal direction (credits positive for liabilities, equity and income)
  normal(e, a) { const t = ACC_TYPE[a], v = this.bal[e * NACC + a]; return t === "L" || t === "Q" || t === "I" || t === "C" ? -v : v; }
  post(e, dr, cr, amt, kind = K.other, cp = -1) {
    if (amt === 0 || dr === cr) return;
    if (!(e >= 0 && e < E_N)) throw new BooksError(`posting to entity ${e}, which does not exist`);
    if (!Number.isSafeInteger(amt) || amt < 0) throw new BooksError(`posting of ${amt} cents is not a whole, non-negative amount (entity ${e}, ${ACCOUNTS[dr][0]}/${ACCOUNTS[cr][0]})`);
    const o = e * NACC; this.bal[o + dr] += amt; this.bal[o + cr] -= amt;
    const J = this.j, k = this.jn & (this.JCAP - 1);
    J.epoch[k] = this.epoch; J.ent[k] = e; J.dr[k] = dr; J.cr[k] = cr; J.amt[k] = amt; J.kind[k] = kind; J.cp[k] = cp;
    this.jn++; this.lines++; this.day.count[kind]++; this.day.sum[kind] += amt;
  }
  // Move amt from payer to payee: the payer debits fromDr, the payee credits toCr, and every bank and
  // central-bank account the money passes through is posted. See the case table in the header.
  pay(from, to, amt, fromDr, toCr, kind = K.other) {
    if (amt === 0) return 0;
    const tf = holdKind(from), tt = holdKind(to), bf = tf === "N" ? this.bankOf[from] : -1, bt = tt === "N" ? this.bankOf[to] : -1;
    if ((tf === "N" && bf < 0) || (tt === "N" && bt < 0)) throw new BooksError(`entity ${tf === "N" && bf < 0 ? from : to} has no bank`);
    const kOf = (e) => e - E_B0;
    let payerCr;
    if (tf === "N" || tf === "G") payerCr = AC.DEPOSITS;
    else if (tf === "K") payerCr = tt === "N" && bt === kOf(from) ? AC.DEP_PAY : AC.RESERVES;
    else payerCr = tt === "G" ? AC.GOV_ACCT_PAY : AC.RES_PAY;
    this.post(from, fromDr, payerCr, amt, kind, to);
    let payeeDr;
    if (tt === "N" || tt === "G") payeeDr = AC.DEPOSITS;
    else if (tt === "K") payeeDr = tf === "N" && bf === kOf(to) ? AC.DEP_PAY : AC.RESERVES;
    else payeeDr = tf === "G" ? AC.GOV_ACCT_PAY : AC.RES_PAY;
    this.post(to, payeeDr, toCr, amt, kind, from);
    if (tf === "N" && !((tt === "N" && bt === bf) || (tt === "K" && kOf(to) === bf))) this.post(E_B0 + bf, AC.DEP_PAY, AC.RESERVES, amt, K.settlement, from);
    if (tf === "G" && tt !== "F" && tt !== "G") this.post(E_FED, AC.GOV_ACCT_PAY, AC.RES_PAY, amt, K.settlement, from);
    if (tt === "N" && !((tf === "N" && bf === bt) || (tf === "K" && kOf(from) === bt))) this.post(E_B0 + bt, AC.RESERVES, AC.DEP_PAY, amt, K.settlement, to);
    if (tt === "G" && tf !== "F" && tf !== "G") this.post(E_FED, AC.RES_PAY, AC.GOV_ACCT_PAY, amt, K.settlement, to);
    return amt;
  }
  // checking <-> savings at the holder's bank
  toSavings(e, amt) { if (amt <= 0) return; this.post(e, AC.SAVINGS, AC.DEPOSITS, amt, K.transfer); this.post(E_B0 + this.bankOf[e], AC.DEP_PAY, AC.SAV_PAY, amt, K.transfer, e); }
  fromSavings(e, amt) { if (amt <= 0) return; this.post(e, AC.DEPOSITS, AC.SAVINGS, amt, K.transfer); this.post(E_B0 + this.bankOf[e], AC.SAV_PAY, AC.DEP_PAY, amt, K.transfer, e); }
  // move an account holder (checking and savings) to another bank
  switchBank(e, nb) {
    const ob = this.bankOf[e]; if (ob === nb) return;
    const d = this.get(e, AC.DEPOSITS), s = this.get(e, AC.SAVINGS), t = d + s;
    if (d) { this.post(E_B0 + ob, AC.DEP_PAY, AC.RESERVES, d, K.transfer, e); this.post(E_B0 + nb, AC.RESERVES, AC.DEP_PAY, d, K.transfer, e); }
    if (s) { this.post(E_B0 + ob, AC.SAV_PAY, AC.RESERVES, s, K.transfer, e); this.post(E_B0 + nb, AC.RESERVES, AC.SAV_PAY, s, K.transfer, e); }
    this.bankOf[e] = nb; return t;
  }
  // an accrual between two entities with no money moving (a tax becoming payable, a bill)
  accrue(payer, gov, amt, payerDr, payerCr, govDr, govCr, kind = K.tax_accrual) {
    if (amt === 0) return; this.post(payer, payerDr, payerCr, amt, kind, gov); this.post(gov, govDr, govCr, amt, kind, payer);
  }
  // opening entries: an asset against equity, and a claim between two entities
  openAsset(e, a, amt) { this.post(e, a, AC.EQUITY, amt, K.opening); }
  openClaim(holder, holderAcct, issuer, issuerAcct, amt) { this.post(holder, holderAcct, AC.EQUITY, amt, K.opening, issuer); this.post(issuer, AC.EQUITY, issuerAcct, amt, K.opening, holder); }
  // a deposit created at opening, posted through the holder's bank (or the Federal Reserve)
  openDeposit(e, amt, acct = AC.DEPOSITS) {
    const k = holdKind(e);
    if (k === "N") this.openClaim(e, acct, E_B0 + this.bankOf[e], acct === AC.SAVINGS ? AC.SAV_PAY : AC.DEP_PAY, amt);
    else if (k === "G") this.openClaim(e, AC.DEPOSITS, E_FED, AC.GOV_ACCT_PAY, amt);
    else throw new BooksError("banks hold reserves, not deposits");
  }
  // close income and expenses into retained earnings at the year end
  closeYear(e) {
    const o = e * NACC; let net = 0;
    for (let a = AC.R_SALES; a < NACC; a++) { const v = this.bal[o + a]; if (!v) continue; net += v; this.bal[o + a] = 0; }
    if (net) { this.bal[o + AC.RETAINED] += net; this.day.count[K.closing]++; }
    return -net;                                             // the year's profit (income less expense)
  }
  incomeOf(e) { let s = 0; const o = e * NACC; for (let a = AC.R_SALES; a < NACC; a++) s -= this.bal[o + a]; return s; }
  netWorth(e) { let s = 0; const o = e * NACC; for (let a = 0; a < AC.DEP_PAY; a++) s += this.bal[o + a]; for (let a = AC.DEP_PAY; a < AC.EQUITY; a++) s += this.bal[o + a]; return s; }
  // a reused slot starts with clean books: only income, expense and equity may remain, and they net to zero
  resetEntity(e) {
    const o = e * NACC; let s = 0;
    for (let a = 0; a < NACC; a++) { const v = this.bal[o + a]; if (v && a < AC.EQUITY) throw new BooksError(`entity ${e} still holds ${ACCOUNTS[a][0]} and cannot be reused`); s += v; }
    if (s !== 0) throw new BooksError(`entity ${e} is out of balance by ${s}`);
    this.bal.fill(0, o, o + NACC);
  }
  resetDay(epoch) { this.epoch = epoch; this.day.count.fill(0); this.day.sum.fill(0); }

  /* -------------------------------------------------------------- the audit */
  audit(active) {
    const B = this.bal, problems = [], checks = [];
    const check = (name, a, b) => { const ok = a === b; checks.push({ name, a, b, ok }); if (!ok) problems.push(`${name}: ${a} != ${b}`); };
    // 1. every entity's books balance, and every balance is a whole number of cents
    let unbalanced = 0, nonInteger = 0;
    for (let e = 0; e < E_N; e++) {
      const o = e * NACC; let s = 0;
      for (let a = 0; a < NACC; a++) { const v = B[o + a]; if (v !== 0 && !Number.isSafeInteger(v)) nonInteger++; s += v; }
      if (s !== 0) { unbalanced++; if (unbalanced <= 3) problems.push(`entity ${e} (${sectorOf(e)}) is out of balance by ${s} cents`); }
    }
    checks.push({ name: "every entity's debits equal its credits", a: unbalanced, b: 0, ok: unbalanced === 0 });
    checks.push({ name: "every balance is a whole number of cents", a: nonInteger, b: 0, ok: nonInteger === 0 });
    if (nonInteger) problems.push(`${nonInteger} balances are not whole cents`);
    // 2. each bank's deposit liabilities are its customers' deposits
    const dep = new Float64Array(BCAP), sav = new Float64Array(BCAP); let govDep = 0, reserves = 0;
    for (let e = 0; e < E_N; e++) {
      const k = holdKind(e), o = e * NACC;
      if (k === "N") { const b = this.bankOf[e]; if (b >= 0) { dep[b] += B[o + AC.DEPOSITS]; sav[b] += B[o + AC.SAVINGS]; } else if (B[o + AC.DEPOSITS] || B[o + AC.SAVINGS]) problems.push(`entity ${e} holds deposits but has no bank`); }
      else if (k === "G") govDep += B[o + AC.DEPOSITS];
      else if (k === "K") reserves += B[o + AC.RESERVES];
    }
    for (let b = 0; b < BCAP; b++) {
      check(`bank ${b}: checking deposits owed = customers' checking`, -B[(E_B0 + b) * NACC + AC.DEP_PAY], dep[b]);
      check(`bank ${b}: savings deposits owed = customers' savings`, -B[(E_B0 + b) * NACC + AC.SAV_PAY], sav[b]);
    }
    check("Federal Reserve: reserves owed = banks' reserves", -B[E_FED * NACC + AC.RES_PAY], reserves);
    check("Federal Reserve: accounts owed = State, Treasury and correspondents' balances", -B[E_FED * NACC + AC.GOV_ACCT_PAY], govDep);
    // 3. loans, bonds, funds and taxes: holders' assets = issuers' liabilities
    const sum = (a) => { let s = 0; for (let e = 0; e < E_N; e++) s += B[e * NACC + a]; return s; };
    for (const [name, asset, liab] of LOAN_PAIRS) check(`${name} loans held = owed`, sum(asset), -sum(liab));
    check("federal funds sold = purchased", sum(AC.LOAN_IB), -sum(AC.L_IB));
    check("discount window lent = borrowed", sum(AC.LOAN_DW), -sum(AC.L_DW));
    check("bonds held = outstanding", sum(AC.MUNIS) + sum(AC.TREAS), -sum(AC.BONDS));
    check("investment funds held = shares issued", sum(AC.INVEST), -sum(AC.FUND_SHARES));
    for (const [name, pay, recv] of TAX_PAIRS) check(`${name} tax receivable = payable`, sum(recv), -sum(pay));
    check("local sales tax due to the city = owed by the State", sum(AC.DIST_RECV), -sum(AC.DIST_PAY));
    // 4. no money below zero where none can be
    let negative = 0;
    for (let e = 0; e < E_N; e++) { const o = e * NACC; if (B[o + AC.DEPOSITS] < 0 || B[o + AC.SAVINGS] < 0 || B[o + AC.INVENTORY] < 0) { negative++; if (negative <= 3) problems.push(`entity ${e} has a negative cash or inventory balance`); } }
    checks.push({ name: "no negative deposits or inventory", a: negative, b: 0, ok: negative === 0 });
    // 5. the closed system: every financial claim has a counterpart
    let fin = 0; for (let e = 0; e < E_N; e++) { const o = e * NACC; for (let a = 0; a < NACC; a++) if (IS_FIN[a]) fin += B[o + a]; }
    check("all financial assets less all financial liabilities", fin, 0);
    return { ok: problems.length === 0, problems, checks };
  }
  // the sector balance sheet matrix: rows instruments, columns sectors (the stock-flow consistent view)
  matrix() {
    const cols = Object.keys(SECTOR_NAMES), rows = ACCOUNTS.map((a, i) => i).filter((i) => IS_FIN[i] || ACC_TYPE[i] === "R" || ACC_TYPE[i] === "C");
    const M = rows.map(() => new Float64Array(cols.length));
    for (let e = 0; e < E_N; e++) { const c = cols.indexOf(sectorOf(e)), o = e * NACC; rows.forEach((a, r) => { M[r][c] += this.bal[o + a]; }); }
    return { cols, rows, M };
  }
  entries(e, n = 40) {
    const out = [], J = this.j;
    for (let i = this.jn - 1, seen = 0; i >= 0 && seen < this.JCAP && out.length < n; i--, seen++) {
      const k = i & (this.JCAP - 1); if (J.ent[k] !== e) continue;
      out.push({ epoch: J.epoch[k], dr: J.dr[k], cr: J.cr[k], amt: J.amt[k], kind: J.kind[k], cp: J.cp[k] });
    }
    return out;
  }
  bytes() { return new Uint8Array(this.bal.buffer.slice(0)); }
}

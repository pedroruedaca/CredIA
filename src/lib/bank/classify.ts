/**
 * Bank movement classification (Norma 43). Pure.
 *
 * Turns each movement into what it is for a lender reading cash flows: a customer receipt, financing, an internal
 * transfer, payroll, a tax payment… Every decision records its basis and the rule that made it, so the case view and
 * the checks can say why a movement was counted. Order of evidence, strongest first:
 *   1. pair    — the same amount leaving one of the company's accounts and arriving in another within 4 days.
 *   2. holder  — the movement names the account holder (the company paying itself from a bank not uploaded).
 *   3. text    — the concept text (records 23) matches a Spanish banking phrase.
 *   4. code    — the AEB common concept (2 digits on record 22), which banks fill coarsely but consistently.
 *   5. default — nothing known: other_inflow / other_outflow, reported as unclassified.
 * Text comes before code because banks put payroll, taxes and loans under the generic transfer and direct-debit
 * codes; the code still decides when the text says nothing specific.
 *
 * Categories are facts about where money came from or went, not accounting: no movement is turned into revenue or
 * an expense of a period. LLM classification can later take the "default" movements.
 */

export const INFLOW_CATEGORIES = [
  "customer_receipt", // sales collected: transfers from third parties, card settlements, collected remittances
  "trade_finance", // invoice/receivable advances: factoring, discounting, anticipos, anticipated confirming
  "financing", // loan or credit-line drawdowns, partner loans, public loans (ICO, ENISA)
  "equity", // capital increases and partner contributions
  "refund", // money back: tax refunds, returned direct debits, reimbursed fees
  "investment_income", // matured deposits, fund redemptions, securities sales
  "other_inflow", // nothing known (unclassified)
] as const;

export const OUTFLOW_CATEGORIES = [
  "operating_payment", // suppliers, utilities, card purchases, direct debits
  "payroll",
  "social_security",
  "tax",
  "debt_service", // loan, mortgage and leasing instalments; repayment of advances
  "interest", // interest on credit lines and overdrafts
  "bank_fees",
  "cash_withdrawal",
  "customer_return", // a receipt the company issued came back unpaid
  "distribution", // dividends, capital reductions paid out
  "investment", // deposits, funds, securities bought
  "other_outflow", // nothing known (unclassified)
] as const;

/** Either direction. */
export const NEUTRAL_CATEGORIES = ["internal_transfer", "reversal"] as const;

export type BankCategory = (typeof INFLOW_CATEGORIES)[number] | (typeof OUTFLOW_CATEGORIES)[number] | (typeof NEUTRAL_CATEGORIES)[number];
export type ClassificationBasis = "pair" | "holder" | "text" | "code" | "default";

export interface Classification {
  category: BankCategory;
  basis: ClassificationBasis;
  /** Which rule decided: a text rule id, `aeb:<code>`, `pair:<sourceRef>`, `holder` or `default`. */
  rule: string;
}

/** AEB Cuaderno 43 common concepts (record 22, positions 23-24). */
export const AEB_COMMON_CONCEPTS: Record<string, string> = {
  "01": "Talones, reintegros",
  "02": "Abonarés, entregas, ingresos",
  "03": "Domiciliados, recibos, letras, pagos por su cuenta",
  "04": "Giros, transferencias, traspasos, cheques",
  "05": "Amortizaciones de préstamos, créditos",
  "06": "Remesas de efectos",
  "07": "Suscripciones, dividendos pasivos, canjes",
  "08": "Dividendos, cupones, prima de junta, amortizaciones",
  "09": "Operaciones de bolsa, compraventa de valores",
  "10": "Cheques de gasolina",
  "11": "Cajeros automáticos",
  "12": "Tarjetas de crédito y débito",
  "13": "Operaciones con el extranjero",
  "14": "Devoluciones e impagados",
  "15": "Nóminas, seguros sociales",
  "16": "Timbres, corretajes, pólizas",
  "17": "Intereses, comisiones, custodia, gastos e impuestos",
  "98": "Anulaciones, correcciones de asiento",
  "99": "Varios",
};

/** Lower case, no accents, punctuation as spaces, single spaces. */
export function normaliseConcept(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:/\\()\-_*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Direction = "in" | "out";
interface TextRule {
  id: string;
  re: RegExp;
  in?: BankCategory;
  out?: BankCategory;
}

// Order matters: the first rule that matches and has a category for the movement's direction decides.
const TEXT_RULES: TextRule[] = [
  { id: "reversal", re: /\banulacion|\bretrocesion|\bextorno|correccion (de )?asiento/, in: "reversal", out: "reversal" },
  // A direct debit the company paid that came back (inflow), or a receipt it issued that came back unpaid (outflow).
  { id: "returned", re: /\bdevolucion (de )?(recibo|adeudo|efecto|domiciliacion)|\bdevol recibo|\brecibo devuelto|\bimpagad|\bdevuelto\b/, in: "refund", out: "customer_return" },
  { id: "internal", re: /\btraspaso|entre cuentas|\bcuenta propia|\bcta propia|\bmismo titular|\bentre ctas\b/, in: "internal_transfer", out: "internal_transfer" },
  { id: "payroll", re: /\bnomina|\bsalario|\bpayroll|\bsueldo|\bfiniquito/, out: "payroll" },
  { id: "social_security", re: /seg(uridad)? ?social|\btgss\b|\bs social\b|tesoreria gral|tesoreria general|\bseguros sociales|\bcotizacion/, out: "social_security", in: "refund" },
  {
    id: "tax",
    re: /\baeat\b|hacienda|agencia (estatal (de )?administracion )?tribut|\bimpuesto|\biva\b|\birpf\b|\bmodelo \d{3}\b|\bmod ?\d{3}\b|ayuntamiento|\bibi\b|\biae\b|\bivtm\b|\btributos\b|\brecaudacion\b|diputacion/,
    out: "tax",
  },
  // Money from the tax office is a refund; "IVA" on a customer's transfer is not (it names the invoice's VAT), and
  // councils pay as customers too.
  { id: "tax_refund", re: /\baeat\b|hacienda|agencia (estatal (de )?administracion )?tribut|devolucion (de )?(iva|impuesto|irpf|modelo)/, in: "refund" },
  { id: "equity_in", re: /ampliacion (de )?capital|aportacion (de )?(socio|socios|capital|fondos)|desembolso (de )?capital|prima de emision/, in: "equity" },
  { id: "distribution", re: /\bdividendo|reparto (de )?(beneficios|dividendos)|reduccion (de )?capital/, out: "distribution" },
  { id: "cash_withdrawal", re: /\bcajero|\breintegro|retirada (de )?efectivo|disposicion (en )?(cajero|efectivo)/, out: "cash_withdrawal" },
  { id: "investment", re: /fondos? (de )?inversion|\bsuscripcion (de )?(fondo|participaciones)|reembolso (de )?(fondo|participaciones)|compra (de )?valores|venta (de )?valores|plazo fijo|\bimposicion|deposito a plazo|\bipf\b|\bletras del tesoro/, in: "investment_income", out: "investment" },
  // Anticipated confirming is financing; confirming paid at maturity is the customer paying.
  { id: "trade_finance", re: /\bfactoring|anticipo.{0,20}confirming|confirming.{0,20}anticip|descuento (de )?(efectos|papel|remesa|pagares)|remesa (al )?descuento|\bal descuento\b|anticipo (de )?(factura|facturas|credito|exportacion|importacion|recibos|remesa)|linea (de )?anticipo|negociacion (de )?efectos/, in: "trade_finance", out: "debt_service" },
  { id: "interest", re: /intereses? (deudor|deudores|descubierto|excedido|de demora|poliza|credito)|liquidacion (de )?intereses|liquidacion (de )?(poliza|credito|cuenta (de )?credito|cta credito)|\bliq (poliza|cto|credito)/, out: "interest" },
  { id: "debt_service", re: /\bprestamo|\bamortiz|\bhipoteca|\bhipotecario|\bleasing\b|\bcuota (prest|credit|leasing|hipot)|\brecibo prestamo/, out: "debt_service", in: "financing" },
  { id: "financing", re: /\bdisposicion|\bformalizacion|\bico\b|\benisa\b|\bpoliza (de )?credito|\bcredito concedido|\bfinanciacion/, in: "financing" },
  { id: "bank_fees", re: /\bcomision|\bcomis\b|gastos (de )?(mantenimiento|correo|gestion|transferencia)|\bcuota (de )?(tarjeta|mantenimiento)|\bcustodia\b/, out: "bank_fees" },
  // Only fees given back; "comisión" on an incoming payment can be the company's own commission income.
  { id: "fee_refund", re: /(devolucion|abono) (de )?(comision|comisiones|gastos)/, in: "refund" },
  { id: "renting", re: /\brenting\b/, out: "operating_payment" },
  { id: "card_settlement", re: /\btpv\b|liquidacion (de )?(tarjetas|comercio|tpv)|abono (de )?tarjetas|\bdatafono|\bredsys|\bstripe|\bpaypal|\bsumup|\badyen|\bcomercio electronico/, in: "customer_receipt", out: "operating_payment" },
  { id: "cash_deposit", re: /ingreso (en )?efectivo|ingreso (en )?caja|\bentrega efectivo/, in: "customer_receipt" },
  { id: "remittance", re: /\bremesa|cobro (de )?(recibos|efectos|factura|facturas)|\badeudos? cobrados?/, in: "customer_receipt" },
  { id: "confirming", re: /\bconfirming\b/, in: "customer_receipt", out: "operating_payment" },
  { id: "transfer", re: /\btransf|\bsepa\b|\bbizum|\bo t\b|\borden de pago|\bemitida\b|\brecibida\b/, in: "customer_receipt", out: "operating_payment" },
  { id: "direct_debit", re: /\brecibo|\badeudo|\bdomiciliacion|\bdomiciliado|\bcargo\b/, out: "operating_payment" },
  { id: "card_purchase", re: /\btarjeta|\bcompra\b/, out: "operating_payment" },
];

// The common concept, when the text said nothing specific. Codes not listed fall through to the default.
const CODE_RULES: Record<string, Partial<Record<Direction, BankCategory>>> = {
  "01": { out: "cash_withdrawal" },
  "02": { in: "customer_receipt" },
  "03": { in: "customer_receipt", out: "operating_payment" },
  "04": { in: "customer_receipt", out: "operating_payment" },
  "05": { out: "debt_service" },
  "06": { in: "customer_receipt" },
  "07": { in: "investment_income", out: "investment" },
  "08": { in: "investment_income" },
  "09": { in: "investment_income", out: "investment" },
  "10": { out: "operating_payment" },
  "11": { out: "cash_withdrawal" },
  "12": { in: "customer_receipt", out: "operating_payment" },
  "13": { in: "customer_receipt", out: "operating_payment" },
  "14": { in: "refund", out: "customer_return" },
  "15": { out: "payroll" },
  "16": { out: "bank_fees" },
  "17": { out: "bank_fees" },
  "98": { in: "reversal", out: "reversal" },
};

export interface ClassifiableMovement {
  amount: number;
  description: string;
  commonConcept: string;
  reference1?: string;
  reference2?: string;
}

/** One movement on its own (text, then code, then default). Pairs and the holder name need the whole case: see classifyAccounts. */
export function classifyMovement(t: ClassifiableMovement): Classification {
  const dir: Direction = t.amount >= 0 ? "in" : "out";
  const text = normaliseConcept([t.description, t.reference1 ?? "", t.reference2 ?? ""].join(" "));
  if (text) {
    for (const r of TEXT_RULES) {
      const category = dir === "in" ? r.in : r.out;
      if (category && r.re.test(text)) return { category, basis: "text", rule: r.id };
    }
  }
  const byCode = CODE_RULES[t.commonConcept]?.[dir];
  if (byCode) return { category: byCode, basis: "code", rule: `aeb:${t.commonConcept}` };
  return { category: dir === "in" ? "other_inflow" : "other_outflow", basis: "default", rule: "default" };
}

// ---------------------------------------------------------------------------------------------------------------
// Case-wide passes: internal transfers between the company's own accounts

const LEGAL_FORM = /\b(s ?l ?u?|s ?a ?u?|s ?l ?l|s ?coop|sociedad limitada|sociedad anonima|slp|sll)\b/g;

/** Words of a holder name that identify it (legal form dropped); null when too short to match safely. */
export function holderKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const k = normaliseConcept(name).replace(LEGAL_FORM, " ").replace(/\s+/g, " ").trim();
  return k.length >= 6 ? k : null;
}

/**
 * Movements a pair or the holder name may turn into an internal transfer: plain transfers and unclassified money,
 * never a specific finding (payroll, a card settlement, a remittance the company issued in its own name…).
 */
const TRANSFER_LIKE = new Set(["transfer", "internal", "default", "aeb:02", "aeb:04", "aeb:99"]);
const PAIR_DAYS = 3;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether the text names the holder as the other party: the payer of an inflow ("de", "ordenante") or the payee of
 * an outflow ("a", "a favor de", "beneficiario"). Some banks print the account's own holder as the beneficiary of
 * every incoming transfer ("a favor de …"), so a bare mention is not enough.
 */
export function namesHolderAsCounterparty(text: string, amount: number, keys: string[]): boolean {
  return keys.some((k) => {
    const words = k.split(" ");
    // Record 11 cuts the name at 26 characters: allow the last word to be cut short.
    const name = words.length > 1 ? `${words.slice(0, -1).join(" ")} ${words.at(-1)!.slice(0, 3)}` : k;
    return amount > 0
      ? new RegExp(`(?<!favor )\\b(de|ordenante|ord|remitente) ${escapeRe(name)}`).test(text)
      : new RegExp(`\\b(a|a favor de|beneficiario|benef|para) ${escapeRe(name)}`).test(text);
  });
}

export interface ClassifiedMovement extends ClassifiableMovement {
  bookingDate: string;
  sourceRef: string;
  category: BankCategory;
  categoryBasis?: ClassificationBasis;
  categoryRule?: string;
}

export interface ClassifiableAccount<T extends ClassifiedMovement = ClassifiedMovement> {
  accountMasked: string;
  name: string;
  transactions: T[];
}

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/**
 * Classifies every movement of a case's bank accounts (all files together), in place. Returns the accounts for
 * chaining. `companyName` is the case's legal name: movements naming it are the company moving its own money.
 */
export function classifyAccounts<A extends ClassifiableAccount>(accounts: A[], opts: { companyName?: string | null } = {}): A[] {
  for (const a of accounts) {
    for (const t of a.transactions) {
      const c = classifyMovement(t);
      Object.assign(t, { category: c.category, categoryBasis: c.basis, categoryRule: c.rule });
    }
  }

  // Holder: a generic movement naming the company itself (its own account at a bank not uploaded).
  const keys = [...new Set([...accounts.map((a) => holderKey(a.name)), holderKey(opts.companyName)].filter((k): k is string => !!k))];
  if (keys.length) {
    for (const a of accounts) {
      for (const t of a.transactions) {
        if (t.category === "internal_transfer" || !TRANSFER_LIKE.has(t.categoryRule ?? "")) continue;
        if (namesHolderAsCounterparty(normaliseConcept(t.description), t.amount, keys)) Object.assign(t, { category: "internal_transfer", categoryBasis: "holder", categoryRule: "holder" });
      }
    }
  }

  // Pairs: money leaving one account and the same amount arriving in another within PAIR_DAYS, closest dates first.
  const candidates = accounts.flatMap((a, ai) =>
    a.transactions
      .filter((t) => t.amount !== 0 && (TRANSFER_LIKE.has(t.categoryRule ?? "") || t.categoryBasis === "holder"))
      .map((t) => ({ t, ai, day: dayNumber(t.bookingDate), cents: Math.round(Math.abs(t.amount) * 100) })),
  );
  const outs = candidates.filter((c) => c.t.amount < 0);
  const ins = candidates.filter((c) => c.t.amount > 0);
  const options: { o: (typeof outs)[number]; i: (typeof ins)[number]; gap: number }[] = [];
  for (const o of outs) {
    for (const i of ins) {
      if (i.ai === o.ai || i.cents !== o.cents) continue;
      const gap = Math.abs(i.day - o.day);
      if (gap <= PAIR_DAYS) options.push({ o, i, gap });
    }
  }
  options.sort((x, y) => x.gap - y.gap || x.o.t.sourceRef.localeCompare(y.o.t.sourceRef) || x.i.t.sourceRef.localeCompare(y.i.t.sourceRef));
  const used = new Set<ClassifiedMovement>();
  for (const { o, i } of options) {
    if (used.has(o.t) || used.has(i.t)) continue;
    used.add(o.t).add(i.t);
    Object.assign(o.t, { category: "internal_transfer", categoryBasis: "pair", categoryRule: `pair:${i.t.sourceRef}` });
    Object.assign(i.t, { category: "internal_transfer", categoryBasis: "pair", categoryRule: `pair:${o.t.sourceRef}` });
  }
  return accounts;
}

// ---------------------------------------------------------------------------------------------------------------
// Inflow breakdown (what the bank says came in, and what of it is sales)

/** Inflows that are the business collecting from customers. Unclassified inflows are counted too, but reported. */
export const RECEIPT_CATEGORIES = new Set<BankCategory>(["customer_receipt", "other_inflow"]);

export interface InflowBreakdown {
  /** Customer receipts minus receipts returned unpaid, plus unclassified inflows. */
  receipts: number;
  identifiedReceipts: number;
  returnedReceipts: number;
  unclassified: number;
  /** Inflows left out of receipts, by category. */
  excluded: Partial<Record<BankCategory, number>>;
  total: number;
  /** Movements counted as receipts (for provenance). */
  counted: ClassifiedMovement[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function inflowBreakdown(movements: ClassifiedMovement[]): InflowBreakdown {
  let identified = 0;
  let unclassified = 0;
  let returned = 0;
  let total = 0;
  const excluded: Partial<Record<BankCategory, number>> = {};
  const counted: ClassifiedMovement[] = [];
  for (const t of movements) {
    if (t.amount < 0) {
      if (t.category === "customer_return") returned += -t.amount;
      continue;
    }
    total += t.amount;
    if (t.category === "customer_receipt") identified += t.amount;
    else if (t.category === "other_inflow") unclassified += t.amount;
    else {
      excluded[t.category] = r2((excluded[t.category] ?? 0) + t.amount);
      continue;
    }
    counted.push(t);
  }
  return {
    receipts: r2(identified + unclassified - returned),
    identifiedReceipts: r2(identified),
    returnedReceipts: r2(returned),
    unclassified: r2(unclassified),
    excluded,
    total: r2(total),
    counted,
  };
}

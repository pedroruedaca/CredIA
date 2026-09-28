/**
 * Pre-closing sumas y saldos for a small distribution SL, FY2025 (12 months).
 * Hand-built so every figure in the tests can be checked by hand.
 * Expected: assets 519.000 · equity 221.000 (150.000 + result 71.000) · EBITDA 110.000.
 */
import type { LedgerBalance } from "../types.ts";

type Row = [account: string, debit: number, credit: number, name: string];

const rows: Row[] = [
  ["21300000", 200_000, 0, "Maquinaria"],
  ["28130000", 0, 60_000, "Amort. acumulada maquinaria"],
  ["30000000", 50_000, 0, "Mercaderías"],
  ["43000001", 120_000, 0, "Cliente A"],
  ["43000002", 30_000, 0, "Cliente B"],
  ["40000001", 0, 80_000, "Proveedor X"],
  ["41000001", 0, 10_000, "Acreedor servicios"],
  ["47500000", 0, 15_000, "HP acreedora"],
  ["47600000", 0, 8_000, "Seguridad Social acreedora"],
  ["47200000", 5_000, 0, "HP IVA soportado"],
  ["57200001", 174_000, 0, "Banco A"],
  ["57200002", 0, 20_000, "Banco B (póliza dispuesta)"],
  ["10000000", 0, 60_000, "Capital social"],
  ["11300000", 0, 90_000, "Reservas voluntarias"],
  ["17000001", 0, 100_000, "Préstamo LP Banco A"],
  ["52000001", 0, 40_000, "Préstamo CP Banco A"],
  ["55100001", 0, 25_000, "C/c socio"],
  ["70000000", 0, 1_000_000, "Ventas de mercaderías"],
  ["60000000", 550_000, 0, "Compras de mercaderías"],
  ["62100000", 36_000, 0, "Arrendamientos"],
  ["62900000", 64_000, 0, "Otros servicios"],
  ["64000000", 180_000, 0, "Sueldos y salarios"],
  ["64200000", 55_000, 0, "SS a cargo de la empresa"],
  ["63100000", 5_000, 0, "Otros tributos"],
  ["68100000", 20_000, 0, "Amortización inmovilizado material"],
  ["66200000", 9_000, 0, "Intereses de deudas"],
  ["76900000", 0, 1_000, "Otros ingresos financieros"],
  ["63000000", 15_000, 0, "Impuesto sobre beneficios"],
  ["77100000", 0, 4_000, "Beneficio enajenación inmovilizado"],
];

export const tbSmallSl: LedgerBalance[] = rows.map(([account, debit, credit, name], i) => ({
  account,
  pgc3: account.slice(0, 3),
  name,
  debit,
  credit,
  source: "upload",
  sourceRef: `doc:fixture:row:${i + 2}`,
}));

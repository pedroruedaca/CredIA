/**
 * What each «Indicadores» tile measures, in plain words, for its popover and the designer's catalogue. Descriptive
 * only: how to read the figure, never a threshold that implies a credit decision (the lender interprets).
 */
import type { KpiTileId } from "../lib/case-view/modules.ts";

export const KPI_TILE_EXPLAIN: Record<KpiTileId, string> = {
  // From the books
  dscr: "Cuántas veces el EBITDA del año cubre la deuda que vence en 12 meses (intereses y principal). Por debajo de 1, el EBITDA no llega para el servicio de la deuda de ese año.",
  interestCoverage: "Cuántas veces el EBITDA cubre los intereses del año. Cuanto más alto, más holgura para pagar la financiación.",
  netDebtToEbitda: "Años de EBITDA que harían falta para devolver la deuda financiera neta de tesorería. Si hay CIRBE, se usa la deuda declarada en ella.",
  currentRatio: "Activo corriente frente a pasivo corriente: lo que la empresa tiene o cobrará en el año frente a lo que debe pagar en el año. Debajo, la prueba ácida, sin existencias.",
  dsoDpo: "Días que tarda en cobrar a sus clientes (DSO) y en pagar a sus proveedores (DPO), según los saldos al cierre.",
  revenue: "Ventas del periodo según la contabilidad (grupo 70), anualizadas si el periodo no es un año.",
  ebitda: "Resultado de explotación antes de amortizaciones y deterioros: lo que genera el negocio antes de financiación e impuestos. Debajo, el margen sobre ventas.",
  debtToEquity: "Deuda financiera frente a patrimonio neto: cuánto se financia con bancos y otros prestamistas por cada euro de los socios.",
  workingCapital: "Activo corriente menos pasivo corriente: el colchón para la operativa diaria.",
  financialDebt: "Préstamos, pólizas, leasing y descubiertos según la contabilidad, a corto y largo plazo.",
  grossMargin: "Ventas menos aprovisionamientos (compras y variación de existencias) sobre ventas. Es el margen contable: no resta personal ni servicios aunque sean directos; el analista puede definirlos en «Coste de ventas» para ver el margen ajustado.",
  adjustedGrossMargin: "Margen bruto con el coste de ventas que elige el analista: marca qué costes son directos en esta empresa (personal, subcontratas, suministros, alquileres…) en «Coste de ventas». Se muestra junto al contable, que no cambia.",
  netMargin: "Resultado del periodo sobre ventas: lo que queda de cada euro vendido después de todos los gastos, intereses e impuestos.",
  roe: "Rentabilidad del patrimonio: resultado anualizado sobre fondos propios al cierre. Debajo, la rentabilidad del activo (ROA).",
  ebitCoverage: "Cuántas veces el resultado de explotación (después de amortizaciones) cubre los intereses del año. Más exigente que la cobertura con EBITDA.",
  debtToEbitda: "Años de EBITDA que harían falta para devolver toda la deuda financiera, sin restar la tesorería.",
  liabilitiesToEquity: "Todo lo que la empresa debe (bancos, proveedores, Hacienda, provisiones…) frente a su patrimonio neto.",
  ccc: "Días que pasan desde que la empresa paga a sus proveedores hasta que cobra de sus clientes: DSO + días de existencias − DPO. Cuanto más largo, más circulante necesita financiar.",
  assetTurnover: "Ventas anuales por cada euro de activo: cuánto negocio genera la empresa con lo que tiene invertido.",
  // From the bank movements (Norma 43)
  minBalance: "El saldo más bajo al cierre de un día en los últimos 12 meses, sumando todas las cuentas. Señala los momentos de mayor tensión de caja.",
  averageDailyBalance: "Saldo medio de todos los días del periodo, sumando las cuentas. Más fiable que mirar solo el saldo de fin de mes.",
  currentToAverage: "Saldo actual frente al saldo medio de los últimos 90 días. Por debajo de 1, la caja ha bajado últimamente.",
  daysCashOnHand: "Días que la empresa podría seguir pagando sus gastos operativos con el saldo actual, sin nuevos cobros.",
  operatingCashFlow: "Cobros de clientes menos pagos operativos (proveedores, nóminas, impuestos…) por mes. No incluye préstamos, cuotas de deuda, socios ni inversiones.",
  netBurn: "Lo que la empresa consume de media en los meses en que paga más de lo que cobra de su actividad.",
  inflowOutflowRatio: "Entradas frente a salidas de los últimos 90 días, sin contar traspasos entre cuentas propias. Por debajo de 1, sale más dinero del que entra.",
  inflowVolatility: "Cuánto varían los cobros de clientes de un mes a otro, en % sobre la media. Alta: ingresos irregulares o por proyectos.",
  receiptsPerMonth: "Número medio de cobros de clientes al mes: da idea de cuántos clientes y operaciones hay detrás de las ventas.",
  debtServiceBurden: "Cuotas de préstamos, leasing y anticipos más intereses, sobre los cobros de clientes: qué parte de lo que cobra se va en pagar deuda.",
  payrollRegularity: "En cuántos de los meses del periodo se pagaron nóminas desde las cuentas aportadas. Huecos o retrasos pueden indicar tensión de caja.",
  returnedItems: "Recibos que vuelven: los de clientes que no pagan y los de la propia empresa que el banco devuelve (a menudo por falta de saldo).",
  overdraftDays: "Días en que alguna de las cuentas cerró en negativo.",
  returnedReceiptsRatio: "Recibos de clientes devueltos sobre los cobros de clientes: pista de la calidad de la cartera de clientes.",
  publicInflowShare: "Devoluciones de Hacienda y de la Seguridad Social sobre las entradas: dinero que no viene de ventas y no se repite cada mes.",
  internalTransferShare: "Dinero que llega desde otras cuentas de la propia empresa, sobre el total de entradas. Mucho movimiento entre cuentas puede inflar la caja aparente.",
};

/** Suggestions and limits for «Preguntar al caso». Pure. */
import { CHECK_NAME } from "../../content/case-view.es.ts";
import type { CaseViewData } from "../case-view/load.ts";
import type { CasePackage } from "../case-view/package.ts";

/** Up to four questions this case can answer, most specific first. */
export function chatSuggestions(d: CaseViewData, pkg: CasePackage): string[] {
  const out: string[] = [];
  const firstOpen = pkg.open[0];
  if (firstOpen) out.push(`¿De dónde sale la alerta «${CHECK_NAME[firstOpen.key] ?? firstOpen.name}»?`);
  if (d.bank) out.push("Cobros de clientes por mes en los últimos 12 meses");
  if (d.cirbe) out.push("Desglosa la deuda CIRBE por banco y producto");
  if (d.statements.closed && d.statements.ytd && d.statements.ytd.scope !== "revenue") out.push("Compara las ventas y el EBITDA del año en curso con el último cierre");
  else if (d.statements.closed) out.push("¿Cómo se calcula la deuda financiera neta y qué cuentas la forman?");
  if (d.solvency?.report) out.push("¿Qué incidencias recoge el informe de solvencia?");
  return out.slice(0, 4);
}

/** Questions per analyst per rolling hour, across cases. */
export const ANALYST_RATE_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 };

/** History sent with each question: the latest messages of the thread. */
export const HISTORY_MESSAGES = 16;

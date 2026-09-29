/** How Holded access is described to the borrower. Pure (used by server and client components). */
import type { ChecklistHolded } from "./checklist.ts";

export function holdedText(connections: ChecklistHolded[]): string {
  const synced = connections.filter((c) => c.status === "synced");
  if (synced.length === 0) return "Sin conectar.";
  if (synced.some((c) => c.mode === "refresh" && !c.revoked_at)) {
    return "Acceso de solo lectura. La clave se guarda cifrada para actualizar los datos; puedes revocarla cuando quieras.";
  }
  if (synced.some((c) => c.revoked_at)) return "Acceso revocado. Los datos ya importados se mantienen en la solicitud.";
  return "Acceso de solo lectura. La clave se usó una vez y no se ha guardado.";
}

/** Financing products a lender can record on a case (display copy only; no product logic depends on it). */
export const PRODUCTS = [
  { value: "poliza_circulante", label: "Póliza de circulante" },
  { value: "prestamo", label: "Préstamo" },
  { value: "factoring", label: "Factoring" },
  { value: "confirming", label: "Confirming" },
  { value: "descuento", label: "Línea de descuento" },
  { value: "otro", label: "Otro" },
] as const;

export type ProductValue = (typeof PRODUCTS)[number]["value"];

export function productLabel(value: string | null | undefined): string {
  return PRODUCTS.find((p) => p.value === value)?.label ?? "—";
}

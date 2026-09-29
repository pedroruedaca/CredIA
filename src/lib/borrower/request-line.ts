import { productLabel } from "../../content/products.es.ts";
import { formatFigure } from "../format.ts";

/** "Póliza de circulante · 250.000 €" (borrower portal and the lender's preview of it). */
export function requestLine(product: string | null, amount: number | null): string {
  const parts = [!product || product === "otro" ? "Solicitud de financiación" : productLabel(product)];
  if (amount) {
    const f = formatFigure(amount, "EUR");
    parts.push(`${f.number} ${f.unit}`);
  }
  return parts.join(" · ");
}

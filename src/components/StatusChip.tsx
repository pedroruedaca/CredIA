import { CASE_STATUS } from "@/content/case-status.es";
import { Pill } from "./ui/Pill";

export function StatusChip({ status }: { status: string }) {
  const s = CASE_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

/** Second pill next to the status: required documents the analyst marked "Lo subo yo" and has not uploaded yet. */
export function AnalystPendingChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return <Pill tone="accent">Te toca subir · <span className="font-mono">{count}</span></Pill>;
}

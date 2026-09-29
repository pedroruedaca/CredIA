import { CASE_STATUS } from "@/content/case-status.es";
import { Pill } from "./ui/Pill";

export function StatusChip({ status }: { status: string }) {
  const s = CASE_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

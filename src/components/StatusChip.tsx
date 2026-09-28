import { CASE_STATUS } from "@/content/case-status.es";

export function StatusChip({ status }: { status: string }) {
  const s = CASE_STATUS[status] ?? { label: status, className: "bg-line-row text-muted" };
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${s.className}`}>{s.label}</span>;
}

import { LenderRail } from "@/components/LenderRail";
import { requireLender } from "@/lib/lender";

export default async function CasosLayout({ children }: { children: React.ReactNode }) {
  const lender = await requireLender();
  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <LenderRail email={lender.email} lenderName={lender.lenderName} />
      <div className="flex min-w-0 grow flex-col">{children}</div>
    </div>
  );
}

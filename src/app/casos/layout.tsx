import { AppHeader } from "@/components/AppHeader";
import { requireLender } from "@/lib/lender";

export default async function CasosLayout({ children }: { children: React.ReactNode }) {
  const lender = await requireLender();
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader lender={lender} />
      {children}
    </div>
  );
}

/** Lender pages: icon rail (with the Bandeja pending count) + content. Server component. */
import { LenderRail } from "@/components/LenderRail";
import { inboxPendingCount } from "@/lib/inbox/load";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

export async function LenderShell({ children }: { children: React.ReactNode }) {
  const lender = await requireLender();
  const inbox = await inboxPendingCount(await createClient());
  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <LenderRail email={lender.email} lenderName={lender.lenderName} inboxCount={inbox} />
      <div className="flex min-w-0 grow flex-col">{children}</div>
    </div>
  );
}

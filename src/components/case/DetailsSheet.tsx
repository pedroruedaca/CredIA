"use client";

/** "Detalles": company data and the case activity (audit log), in a bottom sheet. */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ACTOR_LABEL, AUDIT_LABEL } from "@/content/case-view.es";

export interface DetailsProps {
  company: { label: string; value: string; mono?: boolean }[];
  activity: { action: string; actor: string; at: string; when: string }[];
  currentUserId: string;
}

export function DetailsSheet({ company, activity, currentUserId }: DetailsProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="link" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">Detalles</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Detalles del caso" className="max-h-[75vh]">
        <div className="grid gap-8 md:grid-cols-2">
          <section aria-label="Empresa">
            <h3 className="mb-3 text-[13px] font-medium text-muted">Empresa y solicitud</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {company.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-muted">{r.label}</dt>
                  <dd className={r.mono ? "font-mono" : undefined}>{r.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-label="Actividad">
            <h3 className="mb-3 text-[13px] font-medium text-muted">Actividad</h3>
            {activity.length === 0 ? (
              <p className="text-sm text-ink-2">Sin actividad registrada.</p>
            ) : (
              <ol className="flex flex-col">
                {activity.map((a, i) => (
                  <li key={i} className="flex items-baseline gap-3 border-t border-hairline py-2 text-sm first:border-t-0">
                    <span className="grow">{AUDIT_LABEL[a.action] ?? a.action}</span>
                    <span className="shrink-0 text-xs text-muted">{a.actor === currentUserId ? "Tú" : ACTOR_LABEL[a.actor] ?? "Equipo"}</span>
                    <time dateTime={a.at} className="w-24 shrink-0 text-right text-xs text-muted">{a.when}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </Sheet>
    </>
  );
}

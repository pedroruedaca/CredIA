"use client";

/** Case header actions: "Pedir documento" (soft, modal) and "Exportar paquete" (ink, menu PDF / Excel / JSON). */
import { ChevronDown, FileJson, FileSpreadsheet, FileText } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { requestDocument } from "@/app/casos/[id]/actions";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { Popover } from "@/components/ui/Popover";
import { REQUIREMENT_SPECS } from "@/lib/cases/requirements";

const FORMATS = [
  { id: "pdf", label: "PDF", hint: "Informe para el comité", Icon: FileText },
  { id: "xlsx", label: "Excel", hint: "Balance, PyG, KPIs, alertas y trazabilidad", Icon: FileSpreadsheet },
  { id: "json", label: "JSON", hint: "Datos con su source_ref", Icon: FileJson },
] as const;

export function ExportMenu({ caseId }: { caseId: string }) {
  return (
    <Popover
      align="end"
      className="w-72 p-2"
      trigger={(p) => (
        <Button size="sm" onClick={p.toggle} aria-expanded={p["aria-expanded"]} aria-controls={p["aria-controls"]} aria-haspopup="menu">
          Exportar paquete <ChevronDown size={15} strokeWidth={2} aria-hidden />
        </Button>
      )}
    >
      <ul className="flex flex-col">
        {FORMATS.map(({ id, label, hint, Icon }) => (
          <li key={id}>
            <a
              href={`/casos/${caseId}/exportar/${id}`}
              download
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-ink hover:bg-soft hover:text-ink hover:no-underline"
            >
              <Icon size={18} strokeWidth={1.8} className="shrink-0 text-ink-2" aria-hidden />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted">{hint}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

export function RequestDocumentButton({ caseId, companyName, requested }: { caseId: string; companyName: string; requested: string[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const options = REQUIREMENT_SPECS.filter((s) => !requested.includes(s.kind));
  const [kind, setKind] = useState<string>(options[0]?.kind ?? "");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      try {
        setResult(await requestDocument({ caseId, kind, message }));
      } catch {
        setResult({ ok: false, message: "No hemos podido pedir el documento. Inténtalo de nuevo." });
      }
    });

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => ref.current?.showModal()}>Pedir documento</Button>
      <Modal
        ref={ref}
        title={`Pedir un documento a ${companyName}`}
        onClose={() => {
          setResult(null);
          setMessage("");
        }}
      >
        {result?.ok ? (
          <div className="flex flex-col gap-4 text-[15px]">
            <p className="flex items-start gap-2 text-ink-2"><Pill tone="ok">Pedido</Pill>{result.message}</p>
            <Button variant="secondary" className="self-end" onClick={() => ref.current?.close()}>Cerrar</Button>
          </div>
        ) : options.length === 0 ? (
          <p className="text-[15px] text-ink-2">Ya has pedido todos los documentos disponibles. Si necesitas una aclaración sobre uno, ábrelo en «Para revisar».</p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field id="req-kind" label="Documento">
              <Select id="req-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                {options.map((o) => <option key={o.kind} value={o.kind}>{o.label}</option>)}
              </Select>
            </Field>
            <Field id="req-msg" label="Mensaje para la empresa (opcional)" hint="Aparecerá en el correo. Máximo 500 caracteres.">
              <Textarea id="req-msg" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} className="resize-none" />
            </Field>
            <p className="text-[13px] text-muted">El documento aparecerá en la página de la empresa con su enlace actual; no se genera uno nuevo.</p>
            {result && !result.ok && <p role="alert" className="text-[13px] text-high">{result.message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => ref.current?.close()}>Cancelar</Button>
              <Button type="submit" disabled={pending || !kind}>{pending ? "Pidiendo…" : "Pedir documento"}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

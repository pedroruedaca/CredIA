"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={link}
        aria-label="Enlace para la empresa"
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 min-w-0 grow rounded-lg border border-line-strong bg-surface-subtle px-3 font-mono text-sm"
      />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover"
      >
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
        {copied ? "Copiado" : "Copiar enlace"}
      </button>
    </div>
  );
}

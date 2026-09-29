"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

export function CopyLink({ link, label = "Enlace para la empresa" }: { link: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input readOnly value={link} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="min-w-0 grow font-mono text-sm" />
      <Button
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check size={16} strokeWidth={2} aria-hidden /> : <Copy size={16} strokeWidth={1.8} aria-hidden />}
        {copied ? "Copiado" : "Copiar enlace"}
      </Button>
    </div>
  );
}

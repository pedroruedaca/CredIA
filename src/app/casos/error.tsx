"use client";

import { ErrorLine } from "@/components/states/ErrorLine";

export default function CasosError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="w-full max-w-6xl px-4 py-10 sm:px-14 sm:py-12">
      <ErrorLine message="No hemos podido cargar esta página. Si sigue fallando, avísanos." reset={reset} />
    </main>
  );
}

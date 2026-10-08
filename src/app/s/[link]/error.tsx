"use client";

import { ErrorLine } from "@/components/states/ErrorLine";

/** The borrower keeps their progress; say so and offer a retry. */
export default function BorrowerError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-10">
      <ErrorLine message="No hemos podido cargar tu solicitud. Tu progreso está guardado." reset={reset} />
    </main>
  );
}

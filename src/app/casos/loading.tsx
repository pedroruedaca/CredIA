import { Skeleton } from "@/components/ui/Skeleton";

/** Case list while loading: heading and soft row blocks. */
export default function Loading() {
  return (
    <main className="w-full max-w-6xl px-4 py-10 sm:px-14 sm:py-12" aria-busy="true" aria-label="Cargando casos">
      <Skeleton className="h-12 w-48" />
      <Skeleton className="mt-4 h-5 w-80" />
      <div className="mt-10 flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[72px]" />)}
      </div>
    </main>
  );
}

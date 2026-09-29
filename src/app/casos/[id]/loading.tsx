import { Skeleton } from "@/components/ui/Skeleton";

/** Case view while loading: header, summary sentence, metric row, review list and balance bars. */
export default function Loading() {
  return (
    <main className="w-full max-w-[880px] px-4 py-10 sm:px-14" aria-busy="true" aria-label="Cargando caso">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="mt-4 h-12 w-3/4" />
      <Skeleton className="mt-4 h-5 w-1/2" />
      <Skeleton className="mt-10 h-16 w-full max-w-[720px]" />
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="mt-10 flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
      <Skeleton className="mt-10 h-10" />
      <Skeleton className="mt-3 h-10" />
    </main>
  );
}

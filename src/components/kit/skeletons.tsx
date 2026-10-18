import { Skeleton } from "@/components/ui/skeleton";

export function HeaderSkeleton() {
  return (
    <div className="space-y-2 pb-6" aria-hidden="true">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

export function CourseCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="mt-2 h-4 w-48" />
          <Skeleton className="mt-2 h-3 w-36" />
          <Skeleton className="mt-6 h-4 w-52" />
        </div>
      ))}
    </div>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[0, 1].map((g) => (
          <div key={g} className="space-y-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <Skeleton className="h-5 w-28" />
            {[0, 1, 2, 3].map((r) => (
              <div key={r} className="flex items-center gap-3">
                <Skeleton className="h-4 w-24" />
                <div className="flex-1" />
                <Skeleton className="h-5 w-14" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-rule px-5 py-4 last:border-0">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-12" />
        </div>
      ))}
    </div>
  );
}

export function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

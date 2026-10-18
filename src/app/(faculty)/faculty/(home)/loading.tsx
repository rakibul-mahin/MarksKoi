import { HeaderSkeleton, LoadingRegion, StatsSkeleton, TableSkeleton } from "@/components/kit/skeletons";

export default function Loading() {
  return (
    <LoadingRegion label="Loading">
      <HeaderSkeleton />
      <StatsSkeleton />
      <div className="mt-8">
        <TableSkeleton />
      </div>
    </LoadingRegion>
  );
}

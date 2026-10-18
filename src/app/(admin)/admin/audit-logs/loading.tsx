import { HeaderSkeleton, LoadingRegion, TableSkeleton } from "@/components/kit/skeletons";

export default function Loading() {
  return (
    <LoadingRegion label="Loading">
      <HeaderSkeleton />
      <TableSkeleton />
    </LoadingRegion>
  );
}

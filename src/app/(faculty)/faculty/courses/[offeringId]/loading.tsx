import { LoadingRegion, TableSkeleton } from "@/components/kit/skeletons";

export default function Loading() {
  return (
    <LoadingRegion label="Loading course">
      <TableSkeleton rows={4} />
    </LoadingRegion>
  );
}

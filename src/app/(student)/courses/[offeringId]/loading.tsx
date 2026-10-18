import { LoadingRegion, ResultsSkeleton } from "@/components/kit/skeletons";

export default function Loading() {
  return (
    <LoadingRegion label="Loading course results">
      <ResultsSkeleton />
    </LoadingRegion>
  );
}

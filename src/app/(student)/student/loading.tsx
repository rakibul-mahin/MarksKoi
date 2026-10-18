import { CourseCardsSkeleton, HeaderSkeleton, LoadingRegion } from "@/components/kit/skeletons";

export default function Loading() {
  return (
    <LoadingRegion label="Loading your courses">
      <HeaderSkeleton />
      <CourseCardsSkeleton />
    </LoadingRegion>
  );
}

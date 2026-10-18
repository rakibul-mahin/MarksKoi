import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { AppError } from "@/server/errors";
import { adminUserDetail } from "@/server/request-cache";

export default async function UserAccessLayout(props: LayoutProps<"/admin/users/[profileId]">) {
  const { profileId } = await props.params;
  const viewer = await requireRole("ADMIN");
  try {
    await adminUserDetail(viewer, profileId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  return props.children;
}

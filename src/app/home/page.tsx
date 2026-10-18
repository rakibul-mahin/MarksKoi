import { redirect } from "next/navigation";
import { homePathFor } from "@/server/authz/permissions";
import { requireViewer } from "@/server/auth/guards";

/** Post-sign-in router: sends each person to the area their roles allow. */
export default async function HomeRouter() {
  const viewer = await requireViewer();
  redirect(homePathFor(viewer));
}

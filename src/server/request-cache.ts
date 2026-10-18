import "server-only";
import { cache } from "react";
import type { Viewer } from "./authz/permissions";
import { getUserDetail } from "./services/admin";
import { getStudentCourseResults } from "./services/student";

/*
 * Request-scoped memoization so a segment layout can perform the authorization check (which
 * must run before any streaming starts for notFound() to return a real 404) and the page can
 * reuse the result without a second query or a duplicate audit entry.
 */
export const studentCourseResults = cache((viewer: Viewer, offeringId: string) => getStudentCourseResults(viewer, offeringId));
export const adminUserDetail = cache((viewer: Viewer, profileId: string) => getUserDetail(viewer, profileId));

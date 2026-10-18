"use server";

import { requireActionViewer } from "../auth/guards";
import { AppError } from "../errors";
import { runAction } from "./run-action";
import { A, arg } from "./args";
import { db } from "../db";
import { enforceRateLimit, RATE_LIMITS } from "../rate-limit";
import { addCoInstructor, createOffering, deleteOffering, removeCoInstructor, setArchived, updateOffering } from "../services/offerings";
import { connectSpreadsheet, previewMapping, saveMapping, verifyConnection } from "../services/sources";
import { publishResults, unpublishResults } from "../services/publication";
import { autoSyncIfDue, triggerSync } from "../services/sync";

/*
 * Every action is reachable by direct POST, so each one authenticates and the service layer
 * re-checks the viewer's assignment to the offering. Inputs are validated with zod in services.
 */

export async function createOfferingAction(input: unknown) {
  return runAction("createOffering", async () => {
    const viewer = await requireActionViewer("FACULTY");
    await enforceRateLimit(db, RATE_LIMITS.createCourse, viewer.profileId);
    const offering = await createOffering(viewer, input);
    return { id: offering.id };
  }, "Course created");
}

export async function updateOfferingAction(offeringId: string, input: unknown) {
  return runAction("updateOffering", async () => {
    const viewer = await requireActionViewer("FACULTY");
    await updateOffering(viewer, arg(A.id, offeringId), input);
  }, "Changes saved");
}

export async function setArchivedAction(offeringId: string, archived: boolean) {
  return runAction("setArchived", async () => {
    const viewer = await requireActionViewer("FACULTY");
    await setArchived(viewer, arg(A.id, offeringId), arg(A.bool, archived));
  }, archived ? "Course archived" : "Course restored");
}

export async function addCoInstructorAction(offeringId: string, email: string) {
  return runAction("addCoInstructor", async () => {
    const viewer = await requireActionViewer("FACULTY");
    await addCoInstructor(viewer, arg(A.id, offeringId), arg(A.email, email));
  }, "Co-instructor added");
}

export async function removeCoInstructorAction(offeringId: string, profileId: string) {
  return runAction("removeCoInstructor", async () => {
    const viewer = await requireActionViewer("FACULTY");
    await removeCoInstructor(viewer, arg(A.id, offeringId), arg(A.id, profileId));
  }, "Co-instructor removed");
}

export async function connectSpreadsheetAction(offeringId: string, spreadsheet: string) {
  return runAction("connectSpreadsheet", async () => {
    const viewer = await requireActionViewer("FACULTY");
    await enforceRateLimit(db, RATE_LIMITS.sheets, viewer.profileId);
    return connectSpreadsheet(viewer, arg(A.id, offeringId), arg(A.text(2000), spreadsheet));
  });
}

export async function verifyConnectionAction(offeringId: string) {
  return runAction("verifyConnection", async () => {
    const viewer = await requireActionViewer("FACULTY");
    await enforceRateLimit(db, RATE_LIMITS.sheets, viewer.profileId);
    return verifyConnection(viewer, arg(A.id, offeringId));
  });
}

export async function previewMappingAction(offeringId: string, payload: unknown) {
  return runAction("previewMapping", async () => {
    const viewer = await requireActionViewer("FACULTY");
    await enforceRateLimit(db, RATE_LIMITS.sheets, viewer.profileId);
    return previewMapping(viewer, arg(A.id, offeringId), payload);
  });
}

/** Saves the mapping, then runs a configuration-change sync so the new mapping takes effect. */
export async function saveMappingAction(offeringId: string, payload: unknown) {
  return runAction("saveMapping", async () => {
    const viewer = await requireActionViewer("FACULTY");
    await enforceRateLimit(db, RATE_LIMITS.sheets, viewer.profileId);
    const saved = await saveMapping(viewer, arg(A.id, offeringId), payload);
    if (!saved.saved) return { saved: false as const, warnings: saved.warnings, sync: null };
    let sync: Awaited<ReturnType<typeof triggerSync>> | null = null;
    let syncError: string | null = null;
    try {
      sync = await triggerSync(viewer, offeringId, "CONFIG_CHANGE");
    } catch (err) {
      syncError = err instanceof AppError ? err.userMessage : "The follow-up sync couldn't start. Use “Sync now” to try again.";
    }
    return { saved: true as const, warnings: saved.warnings, sync, syncError };
  });
}

export async function syncNowAction(offeringId: string) {
  return runAction("syncNow", async () => {
    const viewer = await requireActionViewer("FACULTY");
    const id = arg(A.id, offeringId);
    await enforceRateLimit(db, RATE_LIMITS.sheets, viewer.profileId);
    await enforceRateLimit(db, RATE_LIMITS.courseSync, id);
    return triggerSync(viewer, id, "MANUAL");
  });
}

export async function publishAction(offeringId: string, assessmentIds: string[], note?: string) {
  return runAction("publish", async () => {
    const viewer = await requireActionViewer("FACULTY");
    return publishResults(viewer, arg(A.id, offeringId), { assessmentIds: arg(A.ids, assessmentIds), note: arg(A.text(1000).optional(), note) });
  });
}

export async function unpublishAction(offeringId: string) {
  return runAction("unpublish", async () => {
    const viewer = await requireActionViewer("FACULTY");
    await unpublishResults(viewer, arg(A.id, offeringId));
  }, "Results unpublished. Students can no longer see them.");
}

/** Called by faculty course pages on load; syncs only if the last attempt is older than the interval. */
export async function autoSyncAction(offeringId: string) {
  return runAction("autoSync", async () => {
    const viewer = await requireActionViewer("FACULTY");
    return autoSyncIfDue(viewer, arg(A.id, offeringId));
  });
}

export async function deleteOfferingAction(offeringId: string, confirmation: string) {
  return runAction("deleteOffering", async () => {
    const viewer = await requireActionViewer("FACULTY");
    return deleteOffering(viewer, arg(A.id, offeringId), arg(A.text(300), confirmation));
  });
}

import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guards";
import { getServiceAccountEmail } from "@/server/env";
import { getMappingEditorData } from "@/server/services/sources";
import { canEditOffering } from "@/server/authz/permissions";
import { spreadsheetUrl } from "@/server/sheets/spreadsheet-id";
import { ConnectionPanel } from "./connection-panel";
import { MappingEditor, type EditorAssessment, type EditorWorksheet } from "./mapping-editor";

export const metadata: Metadata = { title: "Spreadsheet & columns" };

export default async function AssessmentsPage(props: PageProps<"/faculty/courses/[offeringId]/assessments">) {
  const { offeringId } = await props.params;
  const viewer = await requireRole("FACULTY");
  const data = await getMappingEditorData(viewer, offeringId);
  const editable = canEditOffering(viewer, data.facts);
  const sheetIdByWorksheet = new Map(data.worksheets.map((w) => [w.id, w.googleSheetId]));

  const worksheets: EditorWorksheet[] = data.worksheets.map((w) => ({
    googleSheetId: w.googleSheetId,
    title: w.title,
    present: w.present,
    enabled: w.enabled,
    isRoster: w.isRoster,
    headerRow: w.headerRow,
    headerRows: w.headerRows,
    dataStartRow: w.dataStartRow,
    studentIdHeader: w.studentIdHeader,
    emailHeader: w.emailHeader,
    nameHeader: w.nameHeader,
    sampleRows: w.sampleRows,
  }));
  const assessments: EditorAssessment[] = data.assessments.map((a) => ({
    key: a.id,
    id: a.id,
    name: a.name,
    groupName: a.group.name,
    // Official grades are always text (e.g. "A-"), whatever was saved before.
    valueType: a.kind === "OFFICIAL_GRADE" ? "TEXT" : a.valueType,
    kind: a.kind,
    maxScore: a.kind === "OFFICIAL_GRADE" ? "" : (a.maxScore?.toString() ?? ""),
    threshold: a.threshold?.toString() ?? "",
    columns: a.columns
      .filter((c) => sheetIdByWorksheet.has(c.worksheetId))
      .map((c) => ({ googleSheetId: sheetIdByWorksheet.get(c.worksheetId)!, header: c.header })),
  }));

  return (
    <div className="space-y-8">
      <ConnectionPanel
        offeringId={data.offering.id}
        editable={editable}
        serviceAccountEmail={getServiceAccountEmail()}
        source={
          data.source
            ? {
                title: data.source.spreadsheetTitle,
                url: spreadsheetUrl(data.source.spreadsheetId),
                status: data.source.status,
                lastVerifiedAt: data.source.lastVerifiedAt?.toISOString() ?? null,
                lastErrorMessage: data.source.lastErrorMessage,
              }
            : null
        }
        liveError={data.liveError}
      />
      {data.source && (
        <MappingEditor
          offeringId={data.offering.id}
          editable={editable && !data.liveError}
          initialWorksheets={worksheets}
          initialAssessments={assessments}
          knownGroups={data.groups.map((g) => g.name)}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, CircleAlert, Eye, Info, Loader2, Plus, Save, Split, Trash2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BusyBar } from "@/components/kit/busy-bar";
import { StatusPill } from "@/components/kit/status";
import { normalizeHeader } from "@/lib/normalize";
import { combinedHeaders, detectDataStartRow, headerRowsLabel, MAX_AUTO_SKIPPED_ROWS, MAX_HEADER_ROWS, maxMarkHint, rowAfterHeaders } from "@/lib/sheet-layout";
import { validateMapping } from "@/lib/mapping-validate";
import { DEFAULT_PERCENT_THRESHOLD, guessValueType, VALUE_TYPE_HELP, VALUE_TYPE_LABEL, type ValueTypeName } from "@/lib/value-types";
import { previewMappingAction, saveMappingAction } from "@/server/actions/faculty";
import { cn } from "@/lib/utils";
import { PreviewPanel, type PreviewResult } from "./preview-panel";

export type EditorWorksheet = {
  googleSheetId: number;
  title: string;
  present: boolean;
  enabled: boolean;
  isRoster: boolean;
  headerRow: number;
  headerRows: number;
  /** null = automatic. */
  dataStartRow: number | null;
  studentIdHeader: string | null;
  emailHeader: string | null;
  nameHeader: string | null;
  sampleRows: string[][];
};

export type EditorAssessment = {
  key: string;
  id: string | null;
  name: string;
  groupName: string;
  valueType: ValueTypeName;
  kind: "REGULAR" | "OFFICIAL_TOTAL" | "OFFICIAL_GRADE";
  maxScore: string;
  /** PERCENT only: above = good, equal = warning, below = barred. */
  threshold: string;
  columns: Array<{ googleSheetId: number; header: string }>;
};

const NONE = "__none__";
const DEFAULT_GROUPS = ["Attendance", "Quizzes", "Assignments", "Labs", "Midterm", "Final", "Project", "Evaluation"];

function headersOf(ws: Pick<EditorWorksheet, "sampleRows" | "headerRow" | "headerRows">): string[] {
  return combinedHeaders(ws.sampleRows, ws.headerRow, ws.headerRows);
}

const columnOf = (headers: string[], header: string | null) => {
  if (!header) return null;
  const i = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader(header));
  return i === -1 ? null : i;
};

/** The row where student data starts, as the sync will see it. */
function dataStartOf(ws: EditorWorksheet): { row: number; automatic: number } {
  const headers = headersOf(ws);
  const automatic = detectDataStartRow(ws.sampleRows, ws, { idCol: columnOf(headers, ws.studentIdHeader), emailCol: columnOf(headers, ws.emailHeader) });
  return { row: ws.dataStartRow ?? automatic, automatic };
}

const hasDuplicates = (headers: string[]) => {
  const seen = headers.filter(Boolean).map(normalizeHeader);
  return new Set(seen).size !== seen.length;
};

/**
 * First-time layout guess: the first of the top rows that names an ID or email column holds the
 * titles; if those titles repeat (a merged "Quiz" over Q1, Q2…), the rows below are combined.
 */
function guessLayout(ws: EditorWorksheet): Pick<EditorWorksheet, "headerRow" | "headerRows"> {
  for (let headerRow = 1; headerRow <= Math.min(6, ws.sampleRows.length); headerRow++) {
    const single = { ...ws, headerRow, headerRows: 1, dataStartRow: null };
    const g = guessIdentity(headersOf(single));
    if (!g.emailHeader && !g.studentIdHeader) continue;
    const firstStudent = dataStartOf({ ...single, ...g }).automatic;
    for (let headerRows = 1; headerRows <= MAX_HEADER_ROWS && rowAfterHeaders(headerRow, headerRows) <= firstStudent; headerRows++) {
      if (!hasDuplicates(headersOf({ ...single, headerRows }))) return { headerRow, headerRows };
    }
    return { headerRow, headerRows: 1 };
  }
  return { headerRow: ws.headerRow, headerRows: ws.headerRows };
}

function guessIdentity(headers: string[]) {
  const find = (re: RegExp) => headers.find((h) => re.test(h)) ?? null;
  return {
    studentIdHeader: find(/^(student\s*)?id$|student\s*id|^sid$|roll|^id\s*(no|number)?$/i),
    emailHeader: find(/e-?mail/i),
    nameHeader: find(/^(student\s*)?(full\s*)?name$/i) ?? find(/name/i),
  };
}

function guessGroup(header: string, worksheetTitle: string, valueType: ValueTypeName): string {
  if (valueType === "ATTENDANCE") return "Attendance";
  if (valueType !== "NUMERIC" && valueType !== "TEXT" && /att|absen|eligib|policy|present/i.test(header)) return "Attendance";
  const text = `${header} ${worksheetTitle}`.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/attend/, "Attendance"],
    [/quiz/, "Quizzes"],
    [/assign|hw|homework/, "Assignments"],
    [/lab/, "Labs"],
    [/mid/, "Midterm"],
    [/final/, "Final"],
    [/project/, "Project"],
  ];
  return rules.find(([re]) => re.test(text))?.[1] ?? "Evaluation";
}

function guessMax(header: string): string {
  const m = header.match(/\((\d+(?:\.\d+)?)\)|\/\s*(\d+(?:\.\d+)?)|out of\s*(\d+(?:\.\d+)?)|\[(\d+(?:\.\d+)?)\]/i);
  return m ? (m[1] ?? m[2] ?? m[3] ?? m[4]) : "";
}

/** A maximum-marks row between the titles and the first student ("Q1" over "12"). */
function maxFromSheet(ws: EditorWorksheet, header: string): string {
  const col = columnOf(headersOf(ws), header);
  return col === null ? "" : maxMarkHint(ws.sampleRows, rowAfterHeaders(ws.headerRow, ws.headerRows), dataStartOf(ws).row, col);
}

/** Sample student values and nearby title text for one column, used to guess its type. */
function columnSamples(ws: EditorWorksheet, header: string): { values: string[]; context: string[] } {
  const col = columnOf(headersOf(ws), header);
  if (col === null) return { values: [], context: [] };
  const start = dataStartOf(ws).row;
  const values = ws.sampleRows.slice(start - 1).map((r) => r[col] ?? "");
  // The row above the titles (often a merged group title such as "ATTENDANCE") and rows skipped
  // between the titles and the first student (dates, maximum marks).
  const context = [ws.sampleRows[ws.headerRow - 2]?.[col] ?? "", ...ws.sampleRows.slice(rowAfterHeaders(ws.headerRow, ws.headerRows) - 1, start - 1).map((r) => r[col] ?? "")];
  return { values, context };
}

let keySeq = 0;
const newKey = () => `new-${Date.now().toString(36)}-${keySeq++}`;

function autoConfigure(worksheets: EditorWorksheet[]): EditorWorksheet[] {
  if (worksheets.some((w) => w.enabled)) return worksheets;
  let rosterChosen = false;
  return worksheets.map((w) => {
    if (!w.present) return w;
    w = { ...w, ...guessLayout(w), dataStartRow: null };
    const g = guessIdentity(headersOf(w));
    if (!g.emailHeader && !g.studentIdHeader) return w;
    const isRoster = !rosterChosen && !!g.emailHeader;
    if (isRoster) rosterChosen = true;
    return { ...w, enabled: true, isRoster, ...g, nameHeader: g.nameHeader };
  });
}

export function MappingEditor({
  offeringId,
  editable,
  initialWorksheets,
  initialAssessments,
  knownGroups,
}: {
  offeringId: string;
  editable: boolean;
  initialWorksheets: EditorWorksheet[];
  initialAssessments: EditorAssessment[];
  knownGroups: string[];
}) {
  const router = useRouter();
  const [worksheets, setWorksheets] = useState(() => autoConfigure(initialWorksheets));
  const [assessments, setAssessments] = useState(initialAssessments);
  const [dirty, setDirty] = useState(() => !initialWorksheets.some((w) => w.enabled) && autoConfigure(initialWorksheets).some((w) => w.enabled));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [previewing, startPreview] = useTransition();
  const [saving, startSave] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const touch = () => {
    setDirty(true);
    setPreview(null);
  };
  const updateWs = (id: number, patch: Partial<EditorWorksheet>) => {
    setWorksheets((ws) =>
      ws.map((w) => {
        if (w.googleSheetId === id) {
          const next = { ...w, ...patch };
          // A fixed start row above the (moved) titles is meaningless: fall back to automatic.
          if (next.dataStartRow !== null && next.dataStartRow < rowAfterHeaders(next.headerRow, next.headerRows)) next.dataStartRow = null;
          return next;
        }
        if (patch.isRoster) return { ...w, isRoster: false };
        return w;
      }),
    );
    touch();
  };
  const updateA = (key: string, patch: Partial<EditorAssessment>) => {
    setAssessments((as) => as.map((a) => (a.key === key ? { ...a, ...patch } : a)));
    touch();
  };

  const enabled = worksheets.filter((w) => w.enabled && w.present);
  const groups = useMemo(() => [...new Set([...knownGroups, ...assessments.map((a) => a.groupName).filter(Boolean), ...DEFAULT_GROUPS])], [knownGroups, assessments]);

  const problems = useMemo(
    () =>
      validateMapping(
        worksheets.map((w) => ({
          id: String(w.googleSheetId),
          title: w.title,
          enabled: w.enabled && w.present,
          isRoster: w.isRoster,
          headerRow: w.headerRow,
          headerRows: w.headerRows,
          dataStartRow: w.dataStartRow,
          studentIdHeader: w.studentIdHeader,
          emailHeader: w.emailHeader,
          nameHeader: w.nameHeader,
          availableHeaders: headersOf(w).filter(Boolean),
        })),
        assessments.map((a) => ({
          key: a.key,
          name: a.name,
          groupName: a.groupName,
          valueType: a.valueType,
          maxScore: a.valueType === "NUMERIC" ? a.maxScore : null,
          threshold: a.valueType === "PERCENT" ? a.threshold : null,
          columns: a.columns.map((c) => ({ worksheetId: String(c.googleSheetId), header: c.header })),
        })),
      ),
    [worksheets, assessments],
  );
  const errors = problems.filter((p) => p.severity === "error");
  const mappedKeys = new Set(assessments.flatMap((a) => a.columns.map((c) => `${c.googleSheetId}|${normalizeHeader(c.header)}`)));

  const payload = (acknowledgeWarnings = false) => ({
    worksheets: worksheets.map((w) => ({
      googleSheetId: w.googleSheetId,
      enabled: w.enabled && w.present,
      isRoster: w.isRoster && w.enabled && w.present,
      headerRow: w.headerRow,
      headerRows: w.headerRows,
      dataStartRow: w.dataStartRow,
      studentIdHeader: w.studentIdHeader,
      emailHeader: w.emailHeader,
      nameHeader: w.nameHeader,
    })),
    assessments: assessments.map((a) => ({
      id: a.id,
      key: a.key,
      name: a.name.trim(),
      groupName: a.groupName.trim(),
      valueType: a.valueType,
      kind: a.kind,
      maxScore: a.valueType === "NUMERIC" ? a.maxScore.trim() : null,
      threshold: a.valueType === "PERCENT" ? a.threshold.trim() : null,
      columns: a.columns,
    })),
    acknowledgeWarnings,
  });

  const guessAssessment = (ws: EditorWorksheet, header: string): Pick<EditorAssessment, "groupName" | "valueType" | "kind" | "maxScore" | "threshold"> => {
    if (/grade/i.test(header)) return { groupName: guessGroup(header, ws.title, "TEXT"), valueType: "TEXT", kind: "OFFICIAL_GRADE", maxScore: "", threshold: "" };
    const { values, context } = columnSamples(ws, header);
    const valueType = guessValueType(header, values, context);
    return {
      groupName: guessGroup(header, ws.title, valueType),
      valueType,
      kind: valueType === "NUMERIC" && /total/i.test(header) ? "OFFICIAL_TOTAL" : "REGULAR",
      maxScore: valueType === "NUMERIC" ? guessMax(header) || maxFromSheet(ws, header) : "",
      threshold: valueType === "PERCENT" ? DEFAULT_PERCENT_THRESHOLD : "",
    };
  };

  const addFromColumn = (ws: EditorWorksheet, header: string, combineWith?: string) => {
    if (combineWith) {
      setAssessments((as) => as.map((a) => (a.key === combineWith ? { ...a, columns: [...a.columns, { googleSheetId: ws.googleSheetId, header }] } : a)));
    } else {
      setAssessments((as) => [
        ...as,
        {
          key: newKey(),
          id: null,
          name: as.some((a) => a.name.trim().toLowerCase() === header.toLowerCase()) ? `${header} (${ws.title})` : header,
          ...guessAssessment(ws, header),
          columns: [{ googleSheetId: ws.googleSheetId, header }],
        },
      ]);
    }
    touch();
  };

  const runPreview = () =>
    startPreview(async () => {
      const r = await previewMappingAction(offeringId, payload());
      if (!r.ok) return void toast.error(r.error);
      setPreview(r.data as PreviewResult);
      requestAnimationFrame(() => document.getElementById("mapping-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });

  const save = (ack: boolean) =>
    startSave(async () => {
      const r = await saveMappingAction(offeringId, payload(ack));
      if (!r.ok) return void toast.error(r.error, { duration: 8000 });
      if (!r.data.saved) {
        setWarnings(r.data.warnings);
        return;
      }
      setWarnings(null);
      setDirty(false);
      const sync = r.data.sync;
      if (sync?.status === "SUCCEEDED") toast.success("Columns saved and marks synced", { description: sync.summary });
      else if (sync) toast.warning("Columns saved. The sync needs attention", { description: sync.summary, duration: 8000 });
      else toast.success("Columns saved", { description: r.data.syncError ?? undefined });
      router.refresh();
    });

  return (
    <div className="space-y-8">
      {(previewing || saving) && <BusyBar label={saving ? "Saving and syncing" : "Building preview"} />}

      {/* Step 1: worksheets */}
      <section aria-labelledby="step-ws" className="rounded-xl bg-card ring-1 ring-foreground/10">
        <StepHeader n={1} id="step-ws" title="Choose worksheets" description="Turn on the tabs that contain marks, and mark the one tab that lists every student (the class list)." />
        <ul className="divide-y divide-rule">
          {worksheets.map((w) => {
            const headers = headersOf(w).filter(Boolean);
            const afterTitles = rowAfterHeaders(w.headerRow, w.headerRows);
            const start = dataStartOf(w);
            const lastRow = Math.max(w.sampleRows.length, w.headerRow);
            return (
              <li key={w.googleSheetId} className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Switch
                    id={`ws-${w.googleSheetId}`}
                    checked={w.enabled && w.present}
                    disabled={!editable || !w.present}
                    onCheckedChange={(v) => updateWs(w.googleSheetId, { enabled: v, isRoster: v ? w.isRoster : false })}
                  />
                  <Label htmlFor={`ws-${w.googleSheetId}`} className="text-[0.95rem] font-medium">
                    {w.title}
                  </Label>
                  {!w.present && <StatusPill tone="danger" icon={TriangleAlert}>Missing from spreadsheet</StatusPill>}
                  {w.enabled && w.present && w.isRoster && <StatusPill tone="success">Class list</StatusPill>}
                </div>
                <AnimatePresence initial={false}>
                  {w.enabled && w.present && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label htmlFor={`hr-${w.googleSheetId}`} className="text-xs text-muted-foreground">Column titles start at</Label>
                          <Select value={String(w.headerRow)} disabled={!editable} onValueChange={(v) => updateWs(w.googleSheetId, { headerRow: Number(v) })}>
                            <SelectTrigger id={`hr-${w.googleSheetId}`} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: Math.max(1, Math.min(10, w.sampleRows.length)) }, (_, i) => (
                                <SelectItem key={i} value={String(i + 1)}>
                                  Row {i + 1}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`hrs-${w.googleSheetId}`} className="text-xs text-muted-foreground">Title rows</Label>
                          <Select value={String(w.headerRows)} disabled={!editable} onValueChange={(v) => updateWs(w.googleSheetId, { headerRows: Number(v) })}>
                            <SelectTrigger id={`hrs-${w.googleSheetId}`} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: MAX_HEADER_ROWS }, (_, i) => i + 1)
                                .filter((n) => n === 1 || w.headerRow + n - 1 <= lastRow)
                                .map((n) => (
                                  <SelectItem key={n} value={String(n)}>
                                    {n === 1 ? "1 row" : `${n} rows (${w.headerRow}–${w.headerRow + n - 1}, combined)`}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`ds-${w.googleSheetId}`} className="text-xs text-muted-foreground">Student rows start at</Label>
                          <Select
                            value={w.dataStartRow === null ? "auto" : String(w.dataStartRow)}
                            disabled={!editable}
                            onValueChange={(v) => updateWs(w.googleSheetId, { dataStartRow: v === "auto" ? null : Number(v) })}
                          >
                            <SelectTrigger id={`ds-${w.googleSheetId}`} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Automatic (row {start.automatic})</SelectItem>
                              {Array.from({ length: MAX_AUTO_SKIPPED_ROWS + 1 }, (_, i) => afterTitles + i)
                                .filter((r) => r <= Math.max(lastRow, afterTitles) || r === w.dataStartRow)
                                .map((r) => (
                                  <SelectItem key={r} value={String(r)}>
                                    Row {r}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="mt-3 min-w-0">
                        <p className="text-xs text-muted-foreground">Columns found in {headerRowsLabel(w.headerRow, w.headerRows)}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {headers.length ? (
                            headers.slice(0, 30).map((h, i) => (
                              <span key={`${h}-${i}`} className="tabular rounded-md bg-muted px-2 py-0.5 text-xs">
                                {h}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-destructive">No titles here. Choose the row that has your column titles.</span>
                          )}
                        </div>
                        {start.row > afterTitles && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {start.row - afterTitles === 1 ? `Row ${afterTitles} is` : `Rows ${afterTitles}–${start.row - 1} are`} skipped as part of the titles. Numbers there (like maximum marks) fill in “Out of” when you add a column.
                          </p>
                        )}
                        {hasDuplicates(headers) && (
                          <p className="mt-2 text-xs text-warning">
                            Some titles repeat (often a merged group title such as “Quiz” over several columns). If the row below names each column, set Title rows to include it.
                          </p>
                        )}
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        {(
                          [
                            ["studentIdHeader", "Student ID column"],
                            ["emailHeader", "Student email column"],
                            ["nameHeader", "Name column (optional)"],
                          ] as const
                        ).map(([field, label]) => (
                          <div key={field} className="space-y-1.5">
                            <Label htmlFor={`${field}-${w.googleSheetId}`} className="text-xs text-muted-foreground">
                              {label}
                            </Label>
                            <Select value={w[field] ?? NONE} disabled={!editable} onValueChange={(v) => updateWs(w.googleSheetId, { [field]: v === NONE ? null : v })}>
                              <SelectTrigger id={`${field}-${w.googleSheetId}`} className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>None</SelectItem>
                                {headers.map((h, i) => (
                                  <SelectItem key={`${h}-${i}`} value={h}>
                                    {h}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                      <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="roster"
                          className="size-4 accent-[var(--primary)]"
                          checked={w.isRoster}
                          disabled={!editable}
                          onChange={() => updateWs(w.googleSheetId, { isRoster: true })}
                        />
                        This tab lists every student in the class
                      </label>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Step 2: assessments */}
      <section aria-labelledby="step-a" className="rounded-xl bg-card ring-1 ring-foreground/10">
        <StepHeader
          n={2}
          id="step-a"
          title="Choose assessment columns"
          description="Only the columns you add here are ever shown to students. New columns in your sheet stay hidden until you add them."
        />
        <div className="space-y-5 px-5 pb-6 sm:px-6">
          {enabled.length === 0 ? (
            <p className="text-sm text-muted-foreground">Turn on at least one worksheet above.</p>
          ) : (
            <div className="space-y-3">
              {enabled.map((w) => {
                const identity = new Set([w.studentIdHeader, w.emailHeader, w.nameHeader].filter(Boolean).map((h) => normalizeHeader(h)));
                const available = headersOf(w).filter((h) => h && !identity.has(normalizeHeader(h)) && !mappedKeys.has(`${w.googleSheetId}|${normalizeHeader(h)}`));
                if (available.length === 0) return null;
                return (
                  <div key={w.googleSheetId} className="rounded-lg bg-muted/50 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground">Unused columns in “{w.title}”</p>
                      {editable && (
                        <Button variant="ghost" size="xs" onClick={() => available.forEach((h) => addFromColumn(w, h))}>
                          Add all {available.length}
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {available.map((h, i) => {
                        const sameName = assessments.find((a) => a.name.trim().toLowerCase() === h.toLowerCase() && !a.columns.some((c) => c.googleSheetId === w.googleSheetId));
                        if (sameName && editable) {
                          return (
                            <DropdownMenu key={`${h}-${i}`}>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="xs" className="border-warning/40">
                                  <Split className="text-warning" aria-hidden="true" />
                                  {h}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-72">
                                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                  “{h}” is already an assessment from another worksheet. Choose how to treat this column.
                                </DropdownMenuLabel>
                                <DropdownMenuItem onSelect={() => addFromColumn(w, h, sameName.key)}>Combine: same assessment, split across worksheets</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => addFromColumn(w, h)}>Keep separate: a different assessment</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          );
                        }
                        return (
                          <Button key={`${h}-${i}`} variant="outline" size="xs" disabled={!editable} onClick={() => addFromColumn(w, h)}>
                            <Plus aria-hidden="true" />
                            {h}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {assessments.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No assessments yet. Add columns from the lists above.</p>
          ) : (
            <ol className="space-y-3" aria-label="Assessments">
              {assessments.map((a, idx) => (
                <AssessmentRow
                  key={a.key}
                  a={a}
                  index={idx}
                  total={assessments.length}
                  editable={editable}
                  groups={groups}
                  worksheets={enabled}
                  problems={problems.filter((p) => p.path?.startsWith(`a.${a.key}.`))}
                  onChange={(patch) => updateA(a.key, patch)}
                  onMove={(dir) => {
                    setAssessments((as) => {
                      const next = [...as];
                      const [item] = next.splice(idx, 1);
                      next.splice(idx + dir, 0, item);
                      return next;
                    });
                    touch();
                  }}
                  onRemove={() => {
                    setAssessments((as) => as.filter((x) => x.key !== a.key));
                    touch();
                  }}
                />
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* Step 3: preview and save */}
      <section aria-labelledby="step-save" className="rounded-xl bg-card ring-1 ring-foreground/10">
        <StepHeader n={3} id="step-save" title="Preview and save" description="Preview reads your sheet with these choices without changing anything. Saving also syncs marks, but students see nothing until you publish." />
        <div className="space-y-4 px-5 pb-6 sm:px-6">
          {errors.length > 0 && (
            <ul className="space-y-1.5 rounded-lg bg-danger-soft px-4 py-3 text-sm text-destructive" aria-live="polite">
              {errors.slice(0, 8).map((p, i) => (
                <li key={i} className="flex gap-2">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {p.message}
                </li>
              ))}
              {errors.length > 8 && <li>…and {errors.length - 8} more.</li>}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={runPreview} disabled={!editable || previewing || saving || errors.length > 0}>
              {previewing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Eye aria-hidden="true" />}
              {previewing ? "Reading your sheet…" : "Preview"}
            </Button>
            <Button onClick={() => save(false)} disabled={!editable || saving || previewing || errors.length > 0}>
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
              {saving ? "Saving and syncing…" : "Save & sync"}
            </Button>
            {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
          </div>
          {preview && <PreviewPanel result={preview} />}
        </div>
      </section>

      <AlertDialog open={!!warnings} onOpenChange={(o) => !o && setWarnings(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Check these before saving</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>SyncScore found columns that might belong together. Decide explicitly so marks aren&apos;t missed:</p>
                <ul className="list-disc space-y-1 pl-5">
                  {warnings?.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back and change</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                save(true);
              }}
              disabled={saving}
            >
              {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
              Save as it is
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StepHeader({ n, id, title, description }: { n: number; id: string; title: string; description: string }) {
  return (
    <div className="flex gap-3 px-5 pb-4 pt-5 sm:px-6">
      <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden="true">
        {n}
      </span>
      <div>
        <h2 id={id} className="font-semibold">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function AssessmentRow({
  a,
  index,
  total,
  editable,
  groups,
  worksheets,
  problems,
  onChange,
  onMove,
  onRemove,
}: {
  a: EditorAssessment;
  index: number;
  total: number;
  editable: boolean;
  groups: string[];
  worksheets: EditorWorksheet[];
  problems: Array<{ severity: string; message: string }>;
  onChange: (patch: Partial<EditorAssessment>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [addingFrom, setAddingFrom] = useState<string>("");
  const wsTitle = (id: number) => worksheets.find((w) => w.googleSheetId === id)?.title ?? "Turned-off worksheet";
  const hasError = problems.some((p) => p.severity === "error");
  return (
    <li className={cn("rounded-lg p-4 ring-1 ring-foreground/10", hasError && "ring-destructive/40")}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1fr_7rem_11rem_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`name-${a.key}`} className="text-xs text-muted-foreground">
            Name students see
          </Label>
          <Input id={`name-${a.key}`} value={a.name} disabled={!editable} onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`group-${a.key}`} className="text-xs text-muted-foreground">
            Category
          </Label>
          <Input id={`group-${a.key}`} list={`groups-${a.key}`} value={a.groupName} disabled={!editable} onChange={(e) => onChange({ groupName: e.target.value })} />
        </div>
        <datalist id={`groups-${a.key}`}>
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <div className="space-y-1.5">
          <Label htmlFor={`max-${a.key}`} className="text-xs text-muted-foreground">
            {a.valueType === "PERCENT" ? "Threshold %" : "Out of"}
          </Label>
          {a.valueType === "PERCENT" ? (
            <Input
              id={`max-${a.key}`}
              inputMode="decimal"
              className="tabular"
              value={a.threshold}
              disabled={!editable}
              onChange={(e) => onChange({ threshold: e.target.value })}
              title="Above this is good, exactly this is a warning, below is barred."
              aria-invalid={problems.some((p) => p.message.includes("threshold"))}
            />
          ) : (
            <Input
              id={`max-${a.key}`}
              inputMode="decimal"
              className="tabular"
              value={a.valueType === "NUMERIC" ? a.maxScore : "—"}
              disabled={!editable || a.valueType !== "NUMERIC"}
              onChange={(e) => onChange({ maxScore: e.target.value })}
              aria-invalid={problems.some((p) => p.message.includes("maximum"))}
            />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`type-${a.key}`} className="text-xs text-muted-foreground">
            Shown as
          </Label>
          <Select
            value={a.kind === "REGULAR" ? a.valueType : a.kind}
            disabled={!editable}
            onValueChange={(v) => {
              if (v in VALUE_TYPE_LABEL) {
                const valueType = v as ValueTypeName;
                onChange({ valueType, kind: "REGULAR", threshold: valueType === "PERCENT" && !a.threshold ? DEFAULT_PERCENT_THRESHOLD : a.threshold });
              } else if (v === "OFFICIAL_TOTAL") onChange({ kind: "OFFICIAL_TOTAL", valueType: "NUMERIC" });
              else onChange({ kind: "OFFICIAL_GRADE", valueType: "TEXT", maxScore: "" });
            }}
          >
            <SelectTrigger id={`type-${a.key}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(VALUE_TYPE_LABEL) as ValueTypeName[]).map((t) => (
                <SelectItem key={t} value={t} title={VALUE_TYPE_HELP[t]}>
                  {VALUE_TYPE_LABEL[t]}
                </SelectItem>
              ))}
              <SelectItem value="OFFICIAL_TOTAL">Official total</SelectItem>
              <SelectItem value="OFFICIAL_GRADE">Official grade</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 md:pb-0.5">
          <Button variant="ghost" size="icon-sm" disabled={!editable || index === 0} onClick={() => onMove(-1)} aria-label={`Move ${a.name} up`}>
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={!editable || index === total - 1} onClick={() => onMove(1)} aria-label={`Move ${a.name} down`}>
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={!editable} onClick={onRemove} aria-label={`Remove ${a.name}`} title="Removing hides it from future syncs; already-synced marks are kept.">
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">From:</span>
        {a.columns.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-accent-foreground">
            {wsTitle(c.googleSheetId)} › <span className="tabular">{c.header}</span>
            {editable && a.columns.length > 1 && (
              <button type="button" className="rounded hover:text-destructive" aria-label={`Remove ${c.header} from ${a.name}`} onClick={() => onChange({ columns: a.columns.filter((_, j) => j !== i) })}>
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        {a.columns.length > 1 && <span className="text-muted-foreground">(split across worksheets, so each student should have a value in only one of them)</span>}
        {editable && worksheets.length > 1 && (
          <Select
            value={addingFrom}
            onValueChange={(v) => {
              const [gid, ...rest] = v.split("|");
              onChange({ columns: [...a.columns, { googleSheetId: Number(gid), header: rest.join("|") }] });
              setAddingFrom("");
            }}
          >
            <SelectTrigger size="sm" className="h-6 w-auto gap-1 border-dashed px-2 text-xs" aria-label={`Add another worksheet column to ${a.name}`}>
              <SelectValue placeholder="+ column from another worksheet" />
            </SelectTrigger>
            <SelectContent>
              {worksheets
                .filter((w) => !a.columns.some((c) => c.googleSheetId === w.googleSheetId))
                .flatMap((w) =>
                  headersOf(w)
                    .filter(Boolean)
                    .map((h) => (
                      <SelectItem key={`${w.googleSheetId}|${h}`} value={`${w.googleSheetId}|${h}`}>
                        {w.title} › {h}
                      </SelectItem>
                    )),
                )}
            </SelectContent>
          </Select>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {problems.map((p, i) => (
            <li key={i} className={cn("flex gap-1.5", p.severity === "error" ? "text-destructive" : "text-warning")}>
              {p.severity === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
              {p.message}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

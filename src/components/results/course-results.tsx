import { Award, CalendarClock, Clock3, FileClock, Info, UserRound } from "lucide-react";
import { formatScore, STATUS_HELP, STATUS_LABEL, type CourseResultsView, type ResultGroup, type ResultItem } from "@/lib/results";
import { ATTENDANCE_VALUES, attendanceTone, percentBand, statusTone, YES } from "@/lib/value-types";
import { EmptyState } from "@/components/kit/empty-state";
import { StatusPill } from "@/components/kit/status";
import { formatDateTime } from "@/components/kit/relative-time";
import { ScoreMark } from "./score-mark";

/**
 * Student-facing results sheet. Rendered for students and, unchanged, for the faculty
 * "preview as student" view so faculty see exactly what students will see.
 */
export function CourseResults({ view, preview }: { view: CourseResultsView; preview?: "draft" | "published" }) {
  let row = 0;
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {view.semester} · Section {view.section}
          {view.archived && " · Archived"}
        </p>
        <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-[2.1rem] leading-none tracking-tight sm:text-[2.5rem]">{view.code}</span>
          <span className="text-lg text-muted-foreground sm:text-xl">{view.title}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {view.instructors.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-4" aria-hidden="true" />
              {view.instructors.join(", ")}
            </span>
          )}
          {view.publication && preview !== "draft" && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4" aria-hidden="true" />
              Published {formatDateTime(view.publication.publishedAt)}
            </span>
          )}
          {preview === "draft" && <StatusPill tone="info" icon={FileClock}>Draft preview, not visible to students</StatusPill>}
        </div>
        {view.description && <p className="max-w-2xl whitespace-pre-line border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">{view.description}</p>}
      </header>

      {view.updatesDelayed && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
          <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          These are the results published on {view.publication && formatDateTime(view.publication.publishedAt)}. Newer updates from your instructor may take a little longer to appear.
        </p>
      )}

      {!view.publication ? (
        <EmptyState icon={FileClock} title="No results published yet">
          Your instructor hasn&apos;t published marks for this course. When they do, they&apos;ll appear here. There&apos;s nothing you need to do.
        </EmptyState>
      ) : view.groups.length === 0 && view.official.length === 0 ? (
        <EmptyState icon={FileClock} title="Nothing to show yet">
          No assessments have been published for this course yet.
        </EmptyState>
      ) : (
        <>
          {view.official.length > 0 && (
            <section aria-labelledby="official-heading" className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
              <h2 id="official-heading" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold">
                <Award className="size-4 text-primary" aria-hidden="true" />
                Official results
              </h2>
              <ul className="space-y-1">
                {view.official.map((item) => (
                  <ResultRow key={item.assessmentId} item={item} index={row++} large />
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Provided by your instructor. MarksKoi never calculates totals or grades.</p>
            </section>
          )}

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            {view.groups.map((group) => (
              <section key={group.name} aria-labelledby={`g-${slug(group.name)}`} className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                <h2 id={`g-${slug(group.name)}`} className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg">{group.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {attendanceSummary(group) ?? `${group.items.length} ${group.items.length === 1 ? "assessment" : "assessments"}`}
                  </span>
                </h2>
                <ul className="divide-y divide-rule">
                  {group.items.map((item) => (
                    <ResultRow key={item.assessmentId} item={item} index={row++} />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <details className="group rounded-lg px-1 text-sm text-muted-foreground">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md py-1 hover:text-foreground">
              <Info className="size-4" aria-hidden="true" />
              What do these labels mean?
            </summary>
            <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {(Object.keys(STATUS_LABEL) as Array<keyof typeof STATUS_LABEL>).map((s) => (
                <div key={s} className="flex gap-2">
                  <dt className="font-medium text-foreground">{s === "SCORED" ? "A number" : STATUS_LABEL[s]}:</dt>
                  <dd>{s === "SCORED" ? "Your mark, out of the maximum shown. A 0 is a real score of zero." : STATUS_HELP[s]}</dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      )}
    </div>
  );
}

function ResultRow({ item, index, large }: { item: ResultItem; index: number; large?: boolean }) {
  return (
    <li className="flex items-baseline gap-2 py-2.5">
      <span className={large ? "font-medium" : "text-[0.95rem]"}>{item.name}</span>
      <span className="leader" aria-hidden="true" />
      <span className="shrink-0 text-right">
        <MarkValue item={item} index={index} large={large} />
      </span>
    </li>
  );
}

/** "8 of 10 classes attended" when a category holds attendance sessions (sick counts as attended). */
function attendanceSummary(group: ResultGroup): string | null {
  const sessions = group.items.filter((i) => i.valueType === "ATTENDANCE" && i.status === "SCORED");
  if (sessions.length === 0) return null;
  const attended = sessions.filter((i) => i.textValue !== ATTENDANCE_VALUES.ABSENT).length;
  return `${attended} of ${sessions.length} ${sessions.length === 1 ? "class" : "classes"} attended`;
}

function MarkValue({ item, index, large }: { item: ResultItem; index: number; large?: boolean }) {
  if (item.status === "SCORED") {
    if (item.valueType === "BOOLEAN") {
      return <StatusPill tone={item.textValue === YES ? "success" : "danger"}>{item.textValue}</StatusPill>;
    }
    if (item.valueType === "ATTENDANCE") {
      return (
        <span title={item.textValue === ATTENDANCE_VALUES.SICK ? "Sick leave: counted as attended." : undefined}>
          <StatusPill tone={attendanceTone(item.textValue)}>
            {item.textValue === ATTENDANCE_VALUES.SICK ? "Sick (counted)" : item.textValue}
          </StatusPill>
        </span>
      );
    }
    if (item.valueType === "STATUS") {
      return <StatusPill tone={statusTone(item.textValue)}>{item.textValue}</StatusPill>;
    }
    if (item.valueType === "PERCENT") {
      const band = percentBand(item.score, item.threshold);
      return (
        <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
          <ScoreMark index={index} className={`tabular font-semibold ${large ? "text-xl" : "text-lg"}`}>
            {formatScore(item.score)}%
          </ScoreMark>
          {band && (
            <span title={`Above ${formatScore(item.threshold)}% is good, exactly ${formatScore(item.threshold)}% is a warning, below is barred.`}>
              <StatusPill tone={band.tone}>{band.label}</StatusPill>
            </span>
          )}
        </span>
      );
    }
    if (item.valueType === "TEXT") {
      return (
        <ScoreMark index={index} className={`tabular font-semibold ${large ? "text-xl" : "text-base"}`}>
          {item.textValue}
        </ScoreMark>
      );
    }
    return (
      <span className="whitespace-nowrap">
        <ScoreMark index={index} className={`tabular font-semibold ${large ? "text-xl" : "text-lg"}`}>
          {formatScore(item.score)}
        </ScoreMark>
        {item.valueType === "NUMERIC" && item.maxScore && (
          <span className="tabular ml-1.5 text-sm text-muted-foreground">
            <span aria-hidden="true">/ </span>
            <span className="sr-only">out of </span>
            {formatScore(item.maxScore)}
          </span>
        )}
      </span>
    );
  }
  const tone = item.status === "MISSING" ? "neutral" : item.status === "PENDING" ? "info" : item.status === "EXCUSED" ? "success" : "warning";
  return (
    <span title={STATUS_HELP[item.status]}>
      <StatusPill tone={tone}>{STATUS_LABEL[item.status]}</StatusPill>
    </span>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

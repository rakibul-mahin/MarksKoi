"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, FileSpreadsheet, Link2, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ActionButton } from "@/components/kit/action-button";
import { BusyBar } from "@/components/kit/busy-bar";
import { CopyButton } from "@/components/kit/copy-button";
import { StatusPill } from "@/components/kit/status";
import { connectSpreadsheetAction, verifyConnectionAction } from "@/server/actions/faculty";

type Source = { title: string | null; url: string; status: string; lastVerifiedAt: string | null; lastErrorMessage: string | null } | null;

export function ConnectionPanel({
  offeringId,
  editable,
  serviceAccountEmail,
  source,
  liveError,
}: {
  offeringId: string;
  editable: boolean;
  serviceAccountEmail: string | null;
  source: Source;
  liveError: string | null;
}) {
  return (
    <section aria-labelledby="connection-heading" className="rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4 sm:px-6">
        <div>
          <h2 id="connection-heading" className="flex items-center gap-2 font-semibold">
            <FileSpreadsheet className="size-4 text-primary" aria-hidden="true" />
            Google spreadsheet
          </h2>
          <p className="text-sm text-muted-foreground">MarksKoi reads your sheet with view-only access. It never edits it.</p>
        </div>
        {source && (source.status === "CONNECTED" && !liveError ? <StatusPill tone="success" icon={CheckCircle2}>Connected</StatusPill> : <StatusPill tone="danger" icon={TriangleAlert}>Can&apos;t read the sheet</StatusPill>)}
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        {source ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 truncate font-medium">{source.title ?? "Untitled spreadsheet"}</p>
              <Button asChild variant="outline" size="sm">
                <a href={source.url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Open in Google Sheets
                </a>
              </Button>
              {editable && (
                <ActionButton
                  action={() => verifyConnectionAction(offeringId)}
                  size="sm"
                  variant="outline"
                  pendingLabel="Checking…"
                  successMessage="Connection verified. MarksKoi can read the spreadsheet."
                >
                  <ShieldCheck aria-hidden="true" />
                  Verify connection
                </ActionButton>
              )}
            </div>
            {(liveError || source.lastErrorMessage) && (
              <p role="alert" className="flex gap-2 rounded-lg bg-danger-soft px-4 py-3 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {liveError ?? source.lastErrorMessage}
              </p>
            )}
            {editable && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="link" className="h-auto px-0 text-sm">
                    Use a different spreadsheet…
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <ShareInstructions serviceAccountEmail={serviceAccountEmail} />
                  <ConnectForm offeringId={offeringId} replacing />
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        ) : editable ? (
          <>
            <ShareInstructions serviceAccountEmail={serviceAccountEmail} />
            <ConnectForm offeringId={offeringId} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No spreadsheet is connected.</p>
        )}
      </div>
    </section>
  );
}

function ShareInstructions({ serviceAccountEmail }: { serviceAccountEmail: string | null }) {
  return (
    <ol className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
      <li className="rounded-lg bg-muted/60 p-4">
        <p className="font-medium">Share your sheet with MarksKoi</p>
        <p className="mt-1 text-muted-foreground">
          In Google Sheets, click <strong className="font-medium text-foreground">Share</strong>, add this address as a <strong className="font-medium text-foreground">Viewer</strong>, and turn off “Notify people”.
        </p>
        {serviceAccountEmail ? (
          <div className="mt-3 flex items-center gap-2">
            <code className="tabular min-w-0 flex-1 truncate rounded-md bg-card px-3 py-2 text-xs ring-1 ring-foreground/10">{serviceAccountEmail}</code>
            <CopyButton value={serviceAccountEmail} />
          </div>
        ) : (
          <p className="mt-3 text-destructive">The service account isn&apos;t configured on this server. Ask an administrator.</p>
        )}
      </li>
      <li className="rounded-lg bg-muted/60 p-4">
        <p className="font-medium">Paste the link here</p>
        <p className="mt-1 text-muted-foreground">Copy the address from your browser while the sheet is open. MarksKoi checks that it can read it before saving.</p>
      </li>
    </ol>
  );
}

function ConnectForm({ offeringId, replacing = false }: { offeringId: string; replacing?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await connectSpreadsheetAction(offeringId, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Connected “${result.data.spreadsheetTitle}”`, { description: `${result.data.worksheetCount} worksheets found. Next, choose the columns below.` });
      setValue("");
      setConfirming(false);
      router.refresh();
    });

  return (
    <form
      className="mt-4 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (replacing && !confirming) setConfirming(true);
        else submit();
      }}
    >
      {pending && <BusyBar label="Checking spreadsheet access" />}
      <Label htmlFor={`sheet-url-${replacing ? "r" : "n"}`}>Spreadsheet link</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={`sheet-url-${replacing ? "r" : "n"}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="h-10 pl-9"
            aria-invalid={!!error}
            aria-describedby="sheet-url-error"
            required
          />
        </div>
        <Button type="submit" className="h-10" disabled={pending || !value.trim()}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {pending ? "Checking access…" : replacing ? (confirming ? "Confirm replacement" : "Replace spreadsheet") : "Verify & connect"}
        </Button>
      </div>
      {replacing && confirming && !pending && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Replacing the spreadsheet clears the column choices (your assessments, synced marks and published results are kept). You&apos;ll re-pick columns from the new sheet. Click “Confirm replacement” to continue.
        </p>
      )}
      <p id="sheet-url-error" role={error ? "alert" : undefined} className="text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}

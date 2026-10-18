import { AlertTriangle, CheckCircle2, CircleDashed, Clock, EyeOff, Globe2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE: Record<Tone, string> = {
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-danger-soft text-destructive ring-destructive/20",
  info: "bg-info-soft text-info ring-info/20",
  neutral: "bg-muted text-muted-foreground ring-foreground/10",
};

export function StatusPill({ tone, icon: Icon, children, className }: { tone: Tone; icon?: React.ElementType; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", TONE[tone], className)}>
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}

const SYNC: Record<string, { tone: Tone; label: string; icon: React.ElementType }> = {
  RUNNING: { tone: "info", label: "Syncing", icon: Loader2 },
  SUCCEEDED: { tone: "success", label: "Synced", icon: CheckCircle2 },
  PARTIAL: { tone: "warning", label: "Synced with problems", icon: AlertTriangle },
  VALIDATION_FAILED: { tone: "danger", label: "Needs review", icon: AlertTriangle },
  FAILED: { tone: "danger", label: "Sync failed", icon: XCircle },
};

export function SyncStatusBadge({ status }: { status: string | null }) {
  if (!status) return <StatusPill tone="neutral" icon={CircleDashed}>Not synced yet</StatusPill>;
  const s = SYNC[status] ?? SYNC.FAILED;
  return (
    <StatusPill tone={s.tone} icon={s.icon} className={status === "RUNNING" ? "[&_svg]:animate-spin" : undefined}>
      {s.label}
    </StatusPill>
  );
}

export function PublicationBadge({ status }: { status: string }) {
  if (status === "PUBLISHED") return <StatusPill tone="success" icon={Globe2}>Published</StatusPill>;
  if (status === "UNPUBLISHED") return <StatusPill tone="neutral" icon={EyeOff}>Unpublished</StatusPill>;
  return <StatusPill tone="neutral" icon={CircleDashed}>Draft</StatusPill>;
}

export function HealthBadge({ health }: { health: "ok" | "needs_setup" | "attention" | "stale" }) {
  switch (health) {
    case "needs_setup":
      return <StatusPill tone="info" icon={CircleDashed}>Setup incomplete</StatusPill>;
    case "attention":
      return <StatusPill tone="danger" icon={AlertTriangle}>Needs attention</StatusPill>;
    case "stale":
      return <StatusPill tone="warning" icon={Clock}>May be out of date</StatusPill>;
    default:
      return <StatusPill tone="success" icon={CheckCircle2}>Up to date</StatusPill>;
  }
}

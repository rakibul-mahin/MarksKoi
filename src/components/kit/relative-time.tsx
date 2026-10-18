import { format, formatDistanceStrict } from "date-fns";

/** Server-rendered relative time ("3 hours ago") with the exact time on hover. */
export function RelativeTime({ date, className, prefix }: { date: Date | string | null | undefined; className?: string; prefix?: string }) {
  if (!date) return <span className={className}>never</span>;
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <time dateTime={d.toISOString()} title={format(d, "d MMM yyyy, h:mm a")} className={className}>
      {prefix}
      {formatDistanceStrict(d, new Date(), { addSuffix: true })}
    </time>
  );
}

export function formatDateTime(date: Date | string): string {
  return format(typeof date === "string" ? new Date(date) : date, "d MMM yyyy, h:mm a");
}

export function formatDate(date: Date | string): string {
  return format(typeof date === "string" ? new Date(date) : date, "d MMM yyyy");
}

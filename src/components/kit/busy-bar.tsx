/** Thin indeterminate bar pinned to the top of the viewport while work is in progress. */
export function BusyBar({ label }: { label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-busy="true" className="fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden bg-primary/15">
      <div className="progress-indeterminate h-full w-full bg-primary" />
    </div>
  );
}

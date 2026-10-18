"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shared body for route error boundaries: plain explanation + retry, no raw error text. */
export function ErrorPanel({ error, reset, title = "This page couldn't load" }: { error: Error & { digest?: string }; reset: () => void; title?: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-2xl bg-card p-8 text-center ring-1 ring-foreground/10">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-danger-soft text-destructive">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </span>
      <h1 className="mt-4 font-display text-xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Something went wrong on our side. Your data is safe. Try again, and if it keeps happening, contact support
        {error.digest ? (
          <>
            {" "}with reference <span className="tabular text-foreground">{error.digest}</span>
          </>
        ) : null}
        .
      </p>
      <Button className="mt-6" onClick={reset}>
        <RotateCcw aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}

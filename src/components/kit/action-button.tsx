"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import type { ActionResult } from "@/server/errors";
import { BusyBar } from "./busy-bar";

type Props = {
  action: () => Promise<ActionResult<unknown>>;
  children: React.ReactNode;
  pendingLabel?: string;
  successMessage?: string | ((data: unknown) => string);
  confirm?: { title: string; description: React.ReactNode; confirmLabel: string; destructive?: boolean };
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  disabled?: boolean;
  onDone?: (data: unknown) => void;
};

/**
 * Runs a server action with a pending state (prevents double submits), an optional confirmation
 * dialog for consequential actions, toast feedback, and a router refresh on success.
 */
export function ActionButton({ action, children, pendingLabel, successMessage, confirm, variant, size, className, disabled, onDone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const run = () =>
    startTransition(async () => {
      const result = await action();
      setOpen(false);
      if (result.ok) {
        const msg = typeof successMessage === "function" ? successMessage(result.data) : (result.message ?? successMessage);
        if (msg) toast.success(msg);
        onDone?.(result.data);
        router.refresh();
      } else {
        toast.error(result.error);
        if (result.code === "UNAUTHENTICATED") router.push("/login?reason=expired");
      }
    });

  const button = (
    <>
    {pending && <BusyBar label={pendingLabel ?? "Working"} />}
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={() => (confirm ? setOpen(true) : run())}
    >
      {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
    </>
  );

  if (!confirm) return button;
  return (
    <>
      {button}
      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">{confirm.description}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className={confirm.destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {pending && pendingLabel ? pendingLabel : confirm.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

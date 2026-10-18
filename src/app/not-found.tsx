import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center">
      <Compass className="size-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-4 font-display text-2xl">Page not found</h1>
      <p className="mt-2 text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Button asChild className="mt-6">
        <Link href="/home">Go to my dashboard</Link>
      </Button>
    </main>
  );
}

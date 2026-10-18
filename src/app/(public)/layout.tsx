import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="rounded-md" aria-label="MarksKoi? home">
          <Logo />
        </Link>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-8 text-xs text-muted-foreground sm:px-6">
        <span>MarksKoi? · Developed and Maintained by Mohammad Rakibul Hasan Mahin [RKBM]</span>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/privacy" className="hover:text-foreground hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground hover:underline">
            Terms
          </Link>
        </nav>
      </footer>
    </div>
  );
}

import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="rounded-md" aria-label="SyncScore home">
          <Logo />
        </Link>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 py-8 text-xs text-muted-foreground sm:px-6">
        SyncScore · Developed and Maintained by Mohammad Rakibul Hasan Mahin [RKBM]
      </footer>
    </div>
  );
}

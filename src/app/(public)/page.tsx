import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FileSpreadsheet, GraduationCap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentViewer } from "@/server/auth/guards";
import { ScoreMark } from "@/components/results/score-mark";

export default async function Landing() {
  if (await getCurrentViewer()) redirect("/home");
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 overflow-x-clip px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:pt-14">
      <section>
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">For BRAC University courses</p>
        <h1 className="font-display text-[2.6rem] leading-[1.05] tracking-tight text-balance sm:text-[3.4rem]">
          Find your line on the marksheet in seconds.
        </h1>
        <ul aria-label="Your Marks. Your Space. Your Score." className="mt-9 grid max-w-md grid-cols-3 gap-3 sm:gap-5">
          {(
            [
              ["Marks", "-2deg"],
              ["Space", "1.5deg"],
              ["Score", "-1deg"],
            ] as const
          ).map(([word, tilt], i) => (
            <li key={word} className="note-paper" style={{ "--tilt": tilt } as React.CSSProperties}>
              <span className="block text-[0.7rem] font-medium uppercase leading-[1.65rem] tracking-[0.16em] text-muted-foreground">Your</span>
              <span className="block font-display text-[1.35rem] leading-[1.65rem] tracking-tight sm:text-[1.6rem]">
                <ScoreMark index={i + 2}>{word}.</ScoreMark>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="h-11 px-5 text-[0.95rem]">
            <Link href="/login">
              Sign in with your university account
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <ul className="mt-10 grid gap-4 text-sm sm:grid-cols-3">
          <li className="flex gap-2.5">
            <GraduationCap className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <strong className="font-semibold">Students</strong> see every enrolled course in one place.
            </span>
          </li>
          <li className="flex gap-2.5">
            <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <strong className="font-semibold">Faculty</strong> keep their spreadsheet and decide when to publish.
            </span>
          </li>
          <li className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <strong className="font-semibold">Private</strong> by design: nobody sees a classmate&apos;s marks.
            </span>
          </li>
        </ul>
      </section>

      {/* Illustration of the student view (sample content, not real data). */}
      <figure aria-label="Example of a student's results" className="relative">
        <div className="absolute -inset-4 -z-10 rotate-[-1.5deg] rounded-3xl bg-accent/70" aria-hidden="true" />
        <div className="rounded-2xl bg-card p-6 shadow-[0_1px_0_rgba(0,0,0,0.04),0_18px_40px_-24px_rgba(21,94,75,0.45)] ring-1 ring-foreground/10 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Fall 2026 · Section 04</p>
          <p className="mt-1 flex items-baseline gap-3">
            <span className="font-display text-3xl">CSE110</span>
            <span className="text-muted-foreground">Programming Language I</span>
          </p>
          <ul className="mt-6 divide-y divide-rule text-[0.95rem]">
            {[
              ["Quiz 1", "8.5", "10"],
              ["Quiz 2", "0", "10"],
              ["Assignment 1", "18", "20"],
              ["Midterm", "26", "30"],
            ].map(([name, score, max], i) => (
              <li key={name} className="flex items-baseline gap-2 py-2.5">
                <span>{name}</span>
                <span className="leader" aria-hidden="true" />
                <span className="whitespace-nowrap">
                  <ScoreMark index={i} className="tabular text-lg font-semibold">
                    {score}
                  </ScoreMark>
                  <span className="tabular ml-1.5 text-sm text-muted-foreground">/ {max}</span>
                </span>
              </li>
            ))}
            <li className="flex items-baseline gap-2 py-2.5">
              <span>Final exam</span>
              <span className="leader" aria-hidden="true" />
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Not entered yet</span>
            </li>
          </ul>
          <figcaption className="mt-5 text-xs text-muted-foreground">A zero is a real score; a blank is shown as “not entered yet”.</figcaption>
        </div>
      </figure>
    </div>
  );
}

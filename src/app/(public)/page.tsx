import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check, FileSpreadsheet, GraduationCap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentViewer } from "@/server/auth/guards";
import { ScoreMark } from "@/components/results/score-mark";

export default async function Landing() {
  if (await getCurrentViewer()) redirect("/home");
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 overflow-x-clip px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:pt-14">
      <section>
        {/* "Marks koi?" is Bangla for "Where are my marks?"; "Ekhanei!" means "Right here!". */}
        <h1 lang="bn-Latn" className="font-display text-[3.4rem] leading-[1.12] tracking-tight sm:text-[4.6rem]">
          <span className="hero-rise block">
            <ScoreMark delayMs={520} className="marker-yellow">
              Marks Koi<span className="hero-question">?</span>
            </ScoreMark>
          </span>
          <span className="hero-rise hero-rise-answer mt-1 block pl-[0.6em] sm:mt-2">
            <ScoreMark delayMs={1000} className="marker-mint">
              Ekhanei<span className="hero-bang">!</span>
            </ScoreMark>
          </span>
        </h1>
        <ul aria-label="Your Marks. Your Space. Your Score." className="mt-9 grid max-w-md grid-cols-3 gap-3 sm:gap-5">
          {(
            [
              ["Marks", "-2deg"],
              ["Space", "1.5deg"],
              ["Score", "-1deg"],
            ] as const
          ).map(([word, tilt], i) => (
            <li key={word} className="note-paper note-drop" style={{ "--tilt": tilt, "--drop-delay": `${1150 + i * 140}ms` } as React.CSSProperties}>
              <span className="block text-[0.7rem] font-medium uppercase leading-[1.65rem] tracking-[0.16em] text-muted-foreground">Your</span>
              <span className="block font-display text-[1.35rem] leading-[1.65rem] tracking-tight sm:text-[1.6rem]">
                <ScoreMark delayMs={1550 + i * 140}>{word}.</ScoreMark>
              </span>
            </li>
          ))}
        </ul>
        <p className="hero-fade mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
          No more scrolling through <span className="strike-marker">endless spreadsheets</span> or asking around for your marks. Sign in with your
          university account to find your results, course by course, <span className="underline-marker text-foreground">all in one place</span>.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
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
      <figure aria-label="Example of a student's results" className="hero-float relative mx-auto w-full max-w-lg lg:max-w-none">
        {/* A second sheet peeking out from underneath. */}
        <div className="paper-sheet paper-under absolute inset-0" aria-hidden="true" />
        <div className="paper-sheet relative">
          <span className="paper-tape left-6 -rotate-6" aria-hidden="true" />
          <span className="paper-tape right-6 rotate-[5deg]" aria-hidden="true" />
          {[18, 50, 82].map((top) => (
            <span key={top} className="paper-hole" style={{ top: `${top}%` }} aria-hidden="true" />
          ))}
          <span className="paper-stamp" aria-hidden="true">
            Published <Check className="size-3.5" strokeWidth={3} />
          </span>

          <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">Fall 2026 · Section 04</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="font-display text-[2rem] leading-tight">CSEXYZ</span>
            <span className="text-muted-foreground">Course Title</span>
          </p>
          <ul className="mt-5 text-[0.95rem]">
            {[
              ["Quiz 1", "8.5", "10"],
              ["Quiz 2", "0", "10"],
              ["Assignment 1", "18", "20"],
              ["Midterm", "26", "30"],
            ].map(([name, score, max], i) => (
              <li key={name} className="paper-row">
                <span>{name}</span>
                <span className="leader" aria-hidden="true" />
                <span className="whitespace-nowrap">
                  <ScoreMark delayMs={1900 + i * 160} className="tabular text-lg font-semibold">
                    {score}
                  </ScoreMark>
                  <span className="tabular ml-1.5 text-sm text-muted-foreground">/ {max}</span>
                </span>
              </li>
            ))}
            <li className="paper-row">
              <span>Final exam</span>
              <span className="leader" aria-hidden="true" />
              <span className="rounded-md border-[1.5px] border-dashed border-muted-foreground/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Not entered yet</span>
            </li>
          </ul>
          <figcaption className="mt-4 text-xs text-muted-foreground">A zero is a real score; a blank is shown as “not entered yet”.</figcaption>
        </div>
      </figure>
    </div>
  );
}

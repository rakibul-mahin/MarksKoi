/** Shared layout for the public Privacy and Terms pages. */
export const LEGAL_UPDATED = "19 October 2026";
export const CONTACT_EMAIL = "rakibulhasanmahin17121999@gmail.com";

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl px-4 pb-20 pt-8 sm:px-6 sm:pt-14">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      <h1 className="mt-2 font-display text-[2.4rem] leading-tight tracking-tight">{title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground text-pretty">{intro}</p>
      <div className="legal-body mt-10 space-y-9">{children}</div>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 leading-relaxed text-pretty">
      <h2 className="font-display text-xl">{title}</h2>
      {children}
    </section>
  );
}

export function Contact() {
  return (
    <a className="font-medium text-primary underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>
  );
}

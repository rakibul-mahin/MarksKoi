const HONORIFICS = /^(dr|prof|professor|mr|mrs|ms|md|mohammad|muhammad|engr)\.?$/i;

/** First given name for greetings, skipping honorifics ("Dr. Farhana Islam" → "Farhana"). */
export function firstNameOf(name: string | null | undefined): string | null {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const given = parts.find((p) => !HONORIFICS.test(p));
  return given ?? null;
}

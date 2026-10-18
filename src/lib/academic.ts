/** Client-safe academic display helpers. */
export const SEASONS = ["SPRING", "SUMMER", "FALL"] as const;
export type SeasonValue = (typeof SEASONS)[number];

const SEASON_LABEL: Record<SeasonValue, string> = { SPRING: "Spring", SUMMER: "Summer", FALL: "Fall" };
const SEASON_ORDER: Record<SeasonValue, number> = { SPRING: 1, SUMMER: 2, FALL: 3 };

export function semesterLabel(season: SeasonValue, year: number): string {
  return `${SEASON_LABEL[season]} ${year}`;
}

/** Sort key: later semesters first when sorted descending. */
export function semesterSortKey(season: SeasonValue, year: number): number {
  return year * 10 + SEASON_ORDER[season];
}

export function sectionLabel(section: string): string {
  return `Section ${section}`;
}

/** Current semester guess for form defaults (BRACU: Spring Jan–Apr, Summer May–Aug, Fall Sep–Dec). */
export function currentSemester(now = new Date()): { season: SeasonValue; year: number } {
  const m = now.getMonth();
  return { season: m < 4 ? "SPRING" : m < 8 ? "SUMMER" : "FALL", year: now.getFullYear() };
}

import { z } from "zod";
import { SEASONS } from "./academic";
import { normalizeCourseCode, normalizeSection } from "./normalize";

/** Shared by the client form (instant feedback) and the server (authoritative validation). */
export const offeringInputSchema = z.object({
  courseCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,5}\s?\d{3}[A-Za-z]?$/, "Use a course code like CSE110.")
    .transform(normalizeCourseCode),
  courseTitle: z.string().trim().min(2, "Enter the course title.").max(120, "Keep the title under 120 characters."),
  season: z.enum(SEASONS),
  year: z.coerce.number().int().min(2000).max(2100),
  section: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,4}$/, "Use a section like 01 or 1A.")
    .transform(normalizeSection),
  description: z
    .string()
    .trim()
    .max(1000, "Keep the description under 1000 characters.")
    // nullish: the client sends already-transformed values (empty → null), so accept both.
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const offeringUpdateSchema = z.object({
  title: z.string().trim().min(2, "Enter a title.").max(120),
  section: offeringInputSchema.shape.section,
  description: offeringInputSchema.shape.description,
  autoPublish: z.boolean(),
  scheduledSync: z.boolean(),
});

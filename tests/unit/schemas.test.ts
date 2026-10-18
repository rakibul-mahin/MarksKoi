import { describe, expect, it } from "vitest";
import { offeringInputSchema, offeringUpdateSchema } from "@/lib/schemas";

describe("shared form schemas", () => {
  it("are idempotent: server re-parsing client-transformed values succeeds (regression)", () => {
    const once = offeringInputSchema.parse({ courseCode: "cse 110", courseTitle: "PL I", season: "FALL", year: "2026", section: "1", description: "" });
    expect(once).toMatchObject({ courseCode: "CSE110", section: "01", description: null, year: 2026 });
    expect(offeringInputSchema.parse(once)).toEqual(once);
    const upd = offeringUpdateSchema.parse({ title: "Physics", section: "2", description: "", autoPublish: false, scheduledSync: true });
    expect(offeringUpdateSchema.parse(upd)).toEqual(upd);
  });
});

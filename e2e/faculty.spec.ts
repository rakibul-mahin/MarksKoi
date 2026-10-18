import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./support/auth";
import { JOURNEY_SHEET, UNSHARED_SHEET, updateSpreadsheet } from "./support/fixture";
import { withClient } from "./support/db";

test.describe.configure({ mode: "serial" });

let courseUrl = "";

async function gotoTab(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Course sections" }).getByRole("link", { name }).click();
}

test("faculty sets up, syncs and publishes a course from Google Sheets", async ({ browser }) => {
  const context = await browser.newContext();
  await signInAs(context, "new.faculty@bracu.ac.bd");
  const page = await context.newPage();

  // 1. Create the course offering.
  await page.goto("/faculty");
  await expect(page.getByRole("heading", { name: "Welcome back, Nadia" })).toBeVisible();
  await page.getByRole("link", { name: "New course" }).first().click();
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByText("Use a course code like CSE110.")).toBeVisible();
  await page.getByLabel("Course code").fill("phy 112");
  await page.getByLabel("Course title").fill("Principles of Physics II");
  await page.getByLabel("Section").fill("5");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page).toHaveURL(/\/faculty\/courses\/[0-9a-f-]{36}\/assessments$/);
  courseUrl = page.url().replace(/\/assessments$/, "");
  await expect(page.getByRole("heading", { name: /PHY112/ })).toBeVisible();

  // 2. Service-account instructions, then a sheet that isn't shared yet → actionable error.
  await expect(page.getByText("syncscore-e2e@example-project.iam.gserviceaccount.com")).toBeVisible();
  await page.getByLabel("Spreadsheet link").fill(`https://docs.google.com/spreadsheets/d/${UNSHARED_SHEET}/edit`);
  await page.getByRole("button", { name: "Verify & connect" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Share it with syncscore-e2e@" })).toBeVisible();
  await page.getByLabel("Spreadsheet link").fill("https://example.com/not-a-sheet");
  await page.getByRole("button", { name: "Verify & connect" }).click();
  await expect(page.getByText("Paste the full Google Sheets link")).toBeVisible();

  // 3. Connect the real sheet; both worksheets are discovered.
  await page.getByLabel("Spreadsheet link").fill(`https://docs.google.com/spreadsheets/d/${JOURNEY_SHEET}/edit#gid=0`);
  await page.getByRole("button", { name: "Verify & connect" }).click();
  await expect(page.getByText("PHY112 Fall 2026 — Section 05")).toBeVisible();
  await expect(page.getByLabel("Class list", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Quizzes", { exact: true })).toBeChecked();

  // 4. Map assessment columns from the Quizzes worksheet.
  await page.getByRole("button", { name: "Add all 2" }).click();
  const list = page.getByRole("list", { name: "Assessments" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByLabel("Out of").first()).toHaveValue("10"); // guessed from "(10)"
  await list.getByLabel("Name students see").first().fill("Quiz 1");
  await list.getByLabel("Name students see").nth(1).fill("Quiz 2");

  // 5. Preview (no writes), then save & sync.
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("Found 3 students")).toBeVisible();
  await expect(page.locator("#mapping-preview table")).toContainText("Zarif Haque");
  await page.getByRole("button", { name: "Save & sync" }).click();
  await expect(page.getByText("Columns saved and marks synced")).toBeVisible();

  // 6. Sync history shows the run.
  await gotoTab(page, "Sync history");
  await expect(page.getByText("After column changes")).toBeVisible();
  await expect(page.getByText("Synced", { exact: true }).first()).toBeVisible();

  // 7. Preview as a student, then publish.
  await gotoTab(page, "Publish & preview");
  await expect(page.getByText("Draft preview, not visible to students")).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("enrolled students will immediately see");
  await page.getByRole("alertdialog").getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published version 1")).toBeVisible();
  await expect(page.getByText("Students see version 1, with 2 assessments")).toBeVisible();
  await context.close();
});

test("the student sees the newly published course alongside their others", async ({ browser }) => {
  const context = await browser.newContext();
  await signInAs(context, "ayesha.rahman@g.bracu.ac.bd");
  const page = await context.newPage();
  await page.goto("/student");
  await page.getByRole("link", { name: /PHY112/ }).click();
  const quizzes = page.getByRole("region", { name: "Quizzes" });
  await expect(quizzes.getByRole("listitem").filter({ hasText: "Quiz 1" })).toContainText("6.5");
  await expect(quizzes.getByRole("listitem").filter({ hasText: "Quiz 2" })).toContainText("Not entered yet");
  await context.close();
});

test("a renamed column requires review; published results and the course URL stay stable", async ({ browser }) => {
  updateSpreadsheet(JOURNEY_SHEET, (s) => {
    s.sheets[1].values[0][1] = "Quiz One (10)";
    s.sheets[1].values[1][2] = 7;
  });
  const context = await browser.newContext();
  await signInAs(context, "new.faculty@bracu.ac.bd");
  const page = await context.newPage();
  await page.goto(courseUrl + "/sync");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("Sync needs your review")).toBeVisible();
  await page.getByRole("link", { name: /Sync now/ }).first().click();
  await expect(page.getByText(/Column "Quiz 1 \(10\)" .* was not found in "Quizzes"/)).toBeVisible();

  // Fix by re-mapping: remove the stale column, add the renamed one.
  await gotoTab(page, "Spreadsheet & columns");
  await page.getByRole("button", { name: "Remove Quiz 1" }).click();
  await page.getByRole("button", { name: "Quiz One (10)" }).click();
  const list = page.getByRole("list", { name: "Assessments" });
  await list.getByLabel("Name students see").last().fill("Quiz 1");
  await page.getByRole("button", { name: "Save & sync" }).click();
  await expect(page.getByText("Columns saved and marks synced")).toBeVisible();
  expect(page.url()).toBe(courseUrl + "/assessments");

  // Students still see the previously published values until the faculty republishes.
  const student = await browser.newContext();
  await signInAs(student, "ayesha.rahman@g.bracu.ac.bd");
  const sp = await student.newPage();
  await sp.goto(courseUrl.replace(/\/faculty\/courses\//, "/courses/"));
  await expect(sp.getByRole("region", { name: "Quizzes" }).getByRole("listitem").filter({ hasText: "Quiz 2" })).toContainText("Not entered yet");
  await student.close();
  await context.close();
});

test("sharing revoked: sync fails clearly and nothing changes for students", async ({ browser }) => {
  updateSpreadsheet(JOURNEY_SHEET, (s) => {
    s.shared = false;
  });
  const context = await browser.newContext();
  await signInAs(context, "new.faculty@bracu.ac.bd");
  const page = await context.newPage();
  await page.goto(courseUrl);
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("Sync failed")).toBeVisible();
  await expect(page.getByText(/previously synced marks were kept/).first()).toBeVisible();
  updateSpreadsheet(JOURNEY_SHEET, (s) => {
    s.shared = true;
  });
  await context.close();
});

test("opening a course whose last sync is older than 15 minutes syncs it in the background", async ({ browser }) => {
  const id = courseUrl.split("/").pop()!;
  await withClient((c) => c.query("UPDATE course_offerings SET last_sync_attempt_at = now() - interval '20 minutes' WHERE id = $1", [id]));
  updateSpreadsheet(JOURNEY_SHEET, (s) => {
    s.sheets[1].values[3][2] = 10; // Zarif, Quiz 2: 8 → 10
  });
  const context = await browser.newContext();
  await signInAs(context, "new.faculty@bracu.ac.bd");
  const page = await context.newPage();
  await page.goto(courseUrl);
  await expect(page.getByText("Up to date", { exact: true })).toBeVisible({ timeout: 20_000 });
  await gotoTab(page, "Sync history");
  await expect(page.getByText("Automatic (page opened)").first()).toBeVisible();
  // Visiting again right away doesn't sync again.
  await page.goto(courseUrl);
  await expect(page.getByText("Checking your sheet for changes…")).toHaveCount(0);
  await context.close();
});

test("the owner permanently deletes the course; students can no longer open it", async ({ browser }) => {
  const context = await browser.newContext();
  await signInAs(context, "new.faculty@bracu.ac.bd");
  const page = await context.newPage();
  await page.goto(courseUrl + "/settings");
  await page.getByRole("button", { name: "Delete course" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Delete PHY112-05 permanently?");
  const confirm = dialog.getByRole("button", { name: "Delete permanently" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Type PHY112-05 to confirm/).fill("PHY112-05");
  await confirm.click();
  await expect(page).toHaveURL(/\/faculty\/courses$/);
  await expect(page.getByText("PHY112-05 was permanently deleted")).toBeVisible();
  await expect(page.getByRole("link", { name: /PHY112/ })).toHaveCount(0);
  await context.close();

  const student = await browser.newContext();
  await signInAs(student, "ayesha.rahman@g.bracu.ac.bd");
  const sp = await student.newPage();
  await sp.goto("/student");
  await expect(sp.getByRole("link", { name: /PHY112/ })).toHaveCount(0);
  const res = await sp.goto(courseUrl.replace("/faculty/courses/", "/courses/"));
  expect(res?.status()).toBe(404);
  await student.close();
});

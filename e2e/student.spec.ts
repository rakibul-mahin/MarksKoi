import { expect, test } from "@playwright/test";
import { signInAs } from "./support/auth";

test.describe("student journey", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "ayesha.rahman@g.bracu.ac.bd");
  });

  test("sees every enrolled course, taught by different faculty", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hello, Ayesha");
    await expect(page.getByRole("link", { name: /CSE110/ })).toContainText("Dr. Farhana Islam");
    await expect(page.getByRole("link", { name: /MAT110/ })).toContainText("Kamal Uddin");
  });

  test("opens a course and sees only their own published marks", async ({ page }) => {
    await page.goto("/student");
    await page.getByRole("link", { name: /CSE110/ }).click();
    await expect(page).toHaveURL(/\/courses\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: /CSE110/ })).toBeVisible();

    const quizzes = page.getByRole("region", { name: "Quizzes" });
    await expect(quizzes.getByRole("listitem").filter({ hasText: "Quiz 1" })).toContainText("7");
    // Quiz 3 is blank for Ayesha in the sheet → "Not entered yet", never 0.
    const quiz3 = quizzes.getByRole("listitem").filter({ hasText: "Quiz 3" });
    await expect(quiz3).toContainText("Not entered yet");
    await expect(quiz3).not.toContainText(/\b0\b/);

    // Assignment 2 was not published by the instructor → must not appear at all.
    await expect(page.getByText("Assignment 2")).toHaveCount(0);
    // No other student's identity appears anywhere on the page.
    const body = await page.locator("main").innerText();
    for (const other of ["Tanvir", "Nusrat", "tanvir.hasan", "22101002"]) expect(body).not.toContain(other);
  });

  test("shows a real zero as a score", async ({ context, page }) => {
    await context.clearCookies();
    await signInAs(context, "nusrat.jahan@g.bracu.ac.bd");
    await page.goto("/student");
    await page.getByRole("link", { name: /CSE110/ }).click();
    const attendance = page.getByRole("region", { name: "Attendance" }).getByRole("listitem");
    await expect(attendance).toContainText("0");
    await expect(attendance).toContainText("out of");
    await expect(attendance).not.toContainText("Not entered yet");
  });

  test("shows faculty-defined official grades separately", async ({ page }) => {
    await page.goto("/student");
    await page.getByRole("link", { name: /MAT110/ }).click();
    await expect(page.getByRole("region", { name: "Official results" })).toContainText("Final grade");
  });

  test("navigation works on every viewport and profile shows identity", async ({ page }) => {
    await page.goto("/student");
    await page.getByRole("navigation", { name: "Student navigation" }).filter({ visible: true }).getByRole("link", { name: "Profile" }).click();
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    await expect(page.getByText("22101001")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});

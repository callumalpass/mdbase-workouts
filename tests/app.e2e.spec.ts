import { expect, test, type Page } from "@playwright/test";
import { setupMockApi } from "./helpers/mockApi";

async function switchTab(page: Page, label: RegExp) {
  await page.locator("nav button").filter({ hasText: label }).first().click();
}

test.describe("workout tracker e2e", () => {
  test("navigation across main tabs", async ({ page }) => {
    await setupMockApi(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    await switchTab(page, /calendar/i);
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

    await switchTab(page, /history/i);
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

    await switchTab(page, /chat/i);
    await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
  });

  test("quick log flow posts payload and refreshes today", async ({ page }) => {
    const mock = await setupMockApi(page);
    await page.goto("/");

    await page.getByRole("button", { name: /^\+$/ }).click();
    await expect(page.getByRole("heading", { name: "Quick Log", exact: true })).toBeVisible();

    await page.getByRole("button", { name: /squat/i }).click();

    const numericInputs = page.locator('input[type="number"]');
    await numericInputs.nth(0).fill("100");
    await numericInputs.nth(1).fill("5");
    await page.getByRole("button", { name: "Log" }).click();

    await expect.poll(() => mock.requests.quickLogs.length).toBe(1);
    expect(mock.requests.quickLogs[0]).toMatchObject({
      exercise: "squat",
      weight: 100,
      reps: 5,
    });

    await expect(page.getByText("100kg × 5")).toBeVisible();
  });

  test("plan creator submits plan with selected exercises", async ({ page }) => {
    const mock = await setupMockApi(page);
    await page.goto("/");

    await page
      .locator("section")
      .first()
      .getByRole("button")
      .filter({ hasText: /\+?\s*new/i })
      .click();
    await page.getByPlaceholder("e.g. Push Day, Full Body").fill("Upper Test Day");
    await page.getByRole("button", { name: "Add Exercises" }).click();

    await page.getByRole("button", { name: /bench press/i }).click();
    await page.getByRole("button", { name: "Create Plan" }).click();

    await expect.poll(() => mock.requests.plans.length).toBe(1);
    expect(mock.requests.plans[0]).toMatchObject({
      title: "Upper Test Day",
      exercises: [
        expect.objectContaining({
          exercise: "bench-press",
          target_sets: 3,
          target_reps: 10,
        }),
      ],
    });

    await expect(page.getByText("Upper Test Day")).toBeVisible();
  });

  test("session logger saves completed sets and metadata", async ({ page }) => {
    const mock = await setupMockApi(page);
    await page.goto("/");

    await page.getByRole("button", { name: /start workout/i }).first().click();
    await expect(page.getByRole("button", { name: "Finish" }).first()).toBeVisible();

    const setInputs = page.locator('input[type="number"]');
    await setInputs.nth(0).fill("80");
    await setInputs.nth(1).fill("5");
    await page.locator("button.w-8.h-8").first().click();

    await page.getByRole("button", { name: "Finish" }).first().click();
    await expect(page.getByText("Finish Workout")).toBeVisible();

    await page.getByRole("button", { name: "4" }).click();
    await page.getByPlaceholder("How did it feel?").fill("Solid session");
    await page.getByRole("button", { name: /save session/i }).click();

    await expect.poll(() => mock.requests.sessions.length).toBe(1);
    expect(mock.requests.sessions[0]).toMatchObject({
      plan: expect.stringMatching(/full-body$/),
      rating: 4,
      notes: "Solid session",
      exercises: [
        expect.objectContaining({
          exercise: "squat",
          sets: [expect.objectContaining({ weight: 80, reps: 5 })],
        }),
      ],
    });
  });

  test("history view supports pagination and exercise search", async ({ page }) => {
    const mock = await setupMockApi(page);
    await page.goto("/");

    await switchTab(page, /history/i);
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

    await expect(page.getByRole("button", { name: /load more/i })).toBeVisible();
    await page.getByRole("button", { name: /load more/i }).click();

    await expect
      .poll(() => mock.requests.sessionListQueries.some((q) => q.limit === 20 && q.offset === 20))
      .toBe(true);

    await page.getByRole("button", { name: "exercises" }).click();
    await page.getByPlaceholder("Search exercises...").fill("running");

    await expect(page.getByText("Running")).toBeVisible();
    await expect(page.getByText("Squat")).toHaveCount(0);
  });

  test("calendar loads sessions and chat streams assistant reply", async ({ page }) => {
    const mock = await setupMockApi(page);
    await page.goto("/");

    await switchTab(page, /calendar/i);
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
    await expect
      .poll(() => mock.requests.sessionListQueries.some((q) => q.limit === 100 && q.offset === 0))
      .toBe(true);

    await expect(page.getByText("Prev")).toBeVisible();
    await expect(page.getByText("Next")).toBeVisible();
    await expect(page.getByText(/sessions/i)).toBeVisible();

    await switchTab(page, /chat/i);
    await page.getByPlaceholder("Ask about your workouts...").fill("How was this week?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Mock assistant response.")).toBeVisible();
    await expect.poll(() => mock.requests.chat.length).toBe(1);

    await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByText("Ask me anything")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear" })).toHaveCount(0);
  });
});

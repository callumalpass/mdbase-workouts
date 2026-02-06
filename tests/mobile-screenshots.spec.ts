import { test, type Page } from "@playwright/test";
import { setupMockApi } from "./helpers/mockApi";

async function switchTab(page: Page, label: RegExp) {
  await page.locator("nav button").filter({ hasText: label }).first().click();
}

test.describe("mobile app screenshots", () => {
  test("capture tabs", async ({ page }) => {
    await setupMockApi(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.screenshot({
      path: "docs/screenshots/mobile-today.png",
      fullPage: true,
    });

    await switchTab(page, /calendar/i);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "docs/screenshots/mobile-calendar.png",
      fullPage: true,
    });

    await switchTab(page, /history/i);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "docs/screenshots/mobile-history.png",
      fullPage: true,
    });

    await switchTab(page, /chat/i);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "docs/screenshots/mobile-chat.png",
      fullPage: true,
    });
  });
});

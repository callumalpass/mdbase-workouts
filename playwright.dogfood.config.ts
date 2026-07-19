import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/dogfood",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.MDBASE_CONNECT_DOGFOOD_APP_URL || "http://localhost:5187",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
});

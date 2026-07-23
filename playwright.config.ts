import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/dogfood/**",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        ...devices["iPhone 13"],
      },
    },
  ],
  webServer: {
    command: `npm run dev:fe -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});

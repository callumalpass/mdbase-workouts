import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const developmentHttps = process.env.MDBASE_WORKOUTS_HTTPS_KEY
  && process.env.MDBASE_WORKOUTS_HTTPS_CERT
  ? {
      key: readFileSync(process.env.MDBASE_WORKOUTS_HTTPS_KEY),
      cert: readFileSync(process.env.MDBASE_WORKOUTS_HTTPS_CERT),
    }
  : undefined;

const stagingSdk = process.env.VITE_MDBASE_CONNECT_STAGING === "1";

// TEMPORARY diagnostics (remove once the Private-collection sign-in failure is
// understood): SDK 0.1.7 swallows the exception behind
// "application_worker_binding". Record what was rejected, without ports or
// record data, on globalThis.__mdbaseWorkerDiagnostics and in the console.
const sdkWorkerClientDiagnostics = {
  name: "mdbase-sdk-worker-client-diagnostics",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!id.replace(/\\/g, "/").endsWith("@mdbase-dev/sdk/dist/application/worker-client.js")) return null;
    const original = `        catch {
            this.quarantine("application_worker_binding");
        }
    };`;
    if (!code.includes(original)) throw new Error("SDK worker-client diagnostics: catch block not found");
    const replacement = `        catch (error) {
            try {
                const data = event.data, value = Array.isArray(data) ? data[4] : undefined;
                const entry = {
                    at: new Date().toISOString(),
                    kind: Array.isArray(data) ? data[2] : typeof data,
                    id: Array.isArray(data) ? data[3] : null,
                    action: value && typeof value === "object" ? (value.action ?? null) : null,
                    rpc: value && typeof value === "object" ? (value.rpc ?? null) : null,
                    status: value && typeof value === "object" ? (value.status ?? value.snapshot?.status ?? null) : null,
                    ok: value && typeof value === "object" ? (value.ok ?? null) : null,
                    snapshotKeys: value && typeof value === "object" && (value.snapshot || value.status) ? Object.keys(value.snapshot ?? value) : null,
                    active: this.active ? { id: this.active.id, reply: this.active.reply, handoff: !!this.active.handoff, fenced: this.active.fenced } : null,
                    portal: this.portal ? { id: this.portal.id, lastRpc: this.portal.lastRpc, busy: this.portal.busy, aborted: this.portal.caller.aborted } : null,
                    closedPortal: this.closedPortal, stopping: !!this.stopping,
                    error: String(error && (error.code ?? error.name)), message: String(error && error.message),
                    stack: String(error && error.stack).split("\\n").slice(0, 6).join(" | "),
                };
                (globalThis.__mdbaseWorkerDiagnostics ??= []).push(entry);
                console.error("mdbase diagnostics: worker message rejected", JSON.stringify(entry));
            }
            catch { /* diagnostics never replace the quarantine */ }
            this.quarantine("application_worker_binding");
        }
    };`;
    return code.replace(original, replacement);
  },
};


export default defineConfig({
  base: "./",
  resolve: stagingSdk ? {
    alias: [{ find: /^@mdbase-dev\/sdk$/, replacement: "@mdbase-dev/sdk-staging" }],
  } : undefined,
  plugins: [
    sdkWorkerClientDiagnostics,
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "MDBase Workouts",
        short_name: "Workouts",
        description: "Workout tracker powered by MDBase",
        start_url: ".",
        scope: ".",
        theme_color: "#ECE8E1",
        background_color: "#ECE8E1",
        display: "standalone",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /\.(?:js|css|woff2?|svg|png|jpg|jpeg|gif|ico)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "asset-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5177,
    strictPort: true,
    host: true,
    allowedHosts: ["minipc.tail2b6cde.ts.net", "host.docker.internal"],
    https: developmentHttps,
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
    exclude: ["tests/**", "**/node_modules/**"],
  },
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { finishGrantCallback, isGrantCallback } from "./grant-callback";

const redirect = "https://workouts.mdbase.dev/";

describe("Private collection approval window", () => {
  afterEach(() => vi.restoreAllMocks());

  it("recognises Connect returning to the redirect URI", () => {
    expect(isGrantCallback(new URL(`${redirect}?code=c&state=s`), redirect)).toBe(true);
    expect(isGrantCallback(new URL(`${redirect}?error=access_denied&state=s`), redirect)).toBe(true);
  });

  it("leaves ordinary visits alone", () => {
    expect(isGrantCallback(new URL(redirect), redirect)).toBe(false);
    expect(isGrantCallback(new URL(`${redirect}?code=c`), redirect)).toBe(false);
    expect(isGrantCallback(new URL(`${redirect}calendar?code=c&state=s`), redirect)).toBe(false);
    expect(isGrantCallback(new URL("https://elsewhere.dev/?code=c&state=s"), redirect)).toBe(false);
  });

  it("hands the URL to the waiting tab and closes the window", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
    const waiting = new BroadcastChannel("mdbase.app-grant.v1");
    const received = new Promise<unknown>((resolve) => {
      waiting.onmessage = (event) => resolve(event.data);
    });
    const href = `${redirect}?code=c&state=s`;

    await expect(finishGrantCallback(href)).resolves.toBe(true);
    await expect(received).resolves.toEqual({ type: "callback", url: href });
    expect(close).toHaveBeenCalled();
    waiting.close();
  });
});

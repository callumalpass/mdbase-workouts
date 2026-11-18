import { describe, expect, it, vi } from "vitest";
import { watchForAppUpdate } from "./app-update";

function fakeContainer(controller: object | null) {
  const target = new EventTarget();
  const update = vi.fn(async () => undefined);
  return Object.assign(target, {
    controller,
    getRegistration: vi.fn(async () => ({ update })),
    update,
  }) as unknown as ServiceWorkerContainer & { update: typeof update };
}

describe("watching for a new deploy", () => {
  it("reports a new worker taking over a tab that already had one", () => {
    const container = fakeContainer({});
    const onUpdate = vi.fn();
    watchForAppUpdate(onUpdate, container);

    container.dispatchEvent(new Event("controllerchange"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not report the first worker of a fresh install", () => {
    const container = fakeContainer(null);
    const onUpdate = vi.fn();
    watchForAppUpdate(onUpdate, container);

    container.dispatchEvent(new Event("controllerchange"));
    expect(onUpdate).not.toHaveBeenCalled();
    container.dispatchEvent(new Event("controllerchange"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("checks for a deploy when the tab comes back to the front", async () => {
    const container = fakeContainer({});
    const stop = watchForAppUpdate(vi.fn(), container);

    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(container.update).toHaveBeenCalled());

    stop();
    container.update.mockClear();
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(container.update).not.toHaveBeenCalled();
  });
});

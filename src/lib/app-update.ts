/**
 * A deploy installs a new service worker that takes over open tabs at once,
 * but a tab keeps running the code it loaded until it reloads, and the old
 * build's lazily loaded files are gone from the server. Notice that, and check
 * for a deploy whenever the tab comes back to the front.
 *
 * Reloading is left to the person: it would drop a workout being logged, or a
 * Connect window the page is waiting on.
 */
export function watchForAppUpdate(onUpdate: () => void, container = globalThis.navigator?.serviceWorker): () => void {
  if (!container) return () => {};
  // The first worker to control a fresh install is not an update.
  let controlled = Boolean(container.controller);
  const changed = () => {
    if (controlled) onUpdate();
    controlled = true;
  };
  const check = () => {
    if (document.visibilityState !== "visible") return;
    void container.getRegistration().then((registration) => registration?.update()).catch(() => {});
  };
  container.addEventListener("controllerchange", changed);
  document.addEventListener("visibilitychange", check);
  return () => {
    container.removeEventListener("controllerchange", changed);
    document.removeEventListener("visibilitychange", check);
  };
}

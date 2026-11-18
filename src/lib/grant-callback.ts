/**
 * Adding a Private collection opens Connect in a window, and Connect sends that
 * window back to the app's redirect URI with `state` and `code` (or `error`).
 * That page only hands the URL to the tab that is waiting for it and closes;
 * it must not start a second session, which would find the first one busy.
 */
export function isGrantCallback(url: URL, redirectUri: string): boolean {
  const redirect = new URL(redirectUri);
  return url.origin === redirect.origin
    && url.pathname === redirect.pathname
    && url.searchParams.has("state")
    && (url.searchParams.has("code") || url.searchParams.has("error"));
}

/** Delivers the callback, then closes the window. False if it could not be delivered. */
export async function finishGrantCallback(href: string): Promise<boolean> {
  try {
    const { deliverAppGrantCallback } = await import("@mdbase-dev/sdk/app-grant");
    deliverAppGrantCallback(href);
  } catch {
    return false;
  }
  window.close();
  return true;
}

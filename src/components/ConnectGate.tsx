import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  clearAuthorizationCallback,
  connect,
  connectErrorMessage,
  connectIsRequired,
  connectionInfo,
  activeConnection,
  authorizationReturnTo,
  finishAuthorization,
  savedConnections,
  selectConnection,
  workoutOperations,
} from "../lib/connect";

type GateState = "checking" | "disconnected" | "connecting" | "connected" | "error";

export default function ConnectGate({ children }: { children: ReactNode }) {
  if (!connectIsRequired()) return <>{children}</>;
  return <RequiredConnectGate>{children}</RequiredConnectGate>;
}

function RequiredConnectGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>(() => connectionInfo() ? "connected" : "checking");
  const [error, setError] = useState("");
  const completingCallback = useRef(false);

  useEffect(() => {
    const callback = new URL(location.href);
    const hasCallback = callback.searchParams.has("code") || callback.searchParams.has("error");
    if (!hasCallback) {
      if (connectionInfo()) {
        setState("connected");
        void activeConnection()?.checkDirectAccess();
      } else {
        setState("disconnected");
      }
      return;
    }
    if (completingCallback.current) return;
    completingCallback.current = true;
    setState("connecting");
    connect.completeAuthorization(location.href)
      .then((result) => {
        const connection = finishAuthorization(result);
        setState("connected");
        void connection.checkDirectAccess();
      })
      .catch((reason: unknown) => {
        completingCallback.current = false;
        setError(connectErrorMessage(reason));
        setState("error");
        clearAuthorizationCallback();
      });
  }, []);

  if (state === "connected") return <>{children}</>;

  async function beginConnection(collectionId?: string) {
    setState("connecting");
    setError("");
    try {
      await connect.authorize({
        operations: workoutOperations,
        collectionId,
        returnTo: authorizationReturnTo(),
      });
    } catch (reason) {
      setError(connectErrorMessage(reason));
      setState("error");
    }
  }

  return (
    <main className="min-h-[100dvh] overflow-y-auto px-5 py-10 sm:py-16">
      <section className="mx-auto max-w-md border border-rule bg-card" aria-labelledby="connect-title">
        <header className="border-b border-rule px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faded">Training ledger</p>
            <p className="mt-1 text-sm italic">MDBase Workouts</p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-blush">Your records</span>
        </header>

        <div className="px-5 py-7">
          <p className="ledger-section-title ledger-mark-ocean">Collection connection</p>
          <h1 id="connect-title" className="mt-5 text-3xl font-bold leading-tight">
            Open your training record.
          </h1>
          <p className="mt-3 text-sm leading-6 text-faded">
            Choose a compatible workout collection. The website receives only the record access you approve.
          </p>

          <div className="my-7 grid grid-cols-[1fr_auto_1fr] items-center" aria-label="Connection route">
            <div className="border border-rule bg-paper p-3 text-center">
              <span className="block font-mono text-[9px] uppercase tracking-widest text-faded">This page</span>
              <strong className="mt-1 block text-sm font-semibold">Workouts</strong>
            </div>
            <div className="flex items-center" aria-hidden="true">
              <span className="h-px w-5 bg-ocean" />
              <span className="h-2 w-2 rotate-45 border border-ocean bg-card" />
              <span className="h-px w-5 bg-ocean" />
            </div>
            <div className="border border-rule bg-paper p-3 text-center">
              <span className="block font-mono text-[9px] uppercase tracking-widest text-faded">Your collection</span>
              <strong className="mt-1 block text-sm font-semibold">Markdown</strong>
            </div>
          </div>

          {error && (
            <div role="alert" className="mb-4 border border-blush bg-paper px-3 py-2 text-sm text-blush">
              {error}
            </div>
          )}

          {savedConnections().length ? (
            <div className="mb-4 border-y border-rule">
              {savedConnections().map((connection) => (
                <button
                  key={connection.collectionId}
                  type="button"
                  className="flex w-full items-center justify-between gap-4 border-b border-rule px-3 py-3 text-left last:border-b-0 active:bg-paper"
                  onClick={() => {
                    selectConnection(connection.collectionId, true);
                    setState("connected");
                    void connect.connection(connection.collectionId)?.checkDirectAccess();
                  }}
                >
                  <span>
                    <strong className="block text-sm">{connection.displayName}</strong>
                    <small className="mt-1 block font-mono text-[9px] text-faded">
                      {connection.collectionId}
                    </small>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ocean">
                    Open
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            disabled={state === "checking" || state === "connecting"}
            onClick={() => void beginConnection(
              new URL(location.href).searchParams.get("collection") ?? undefined,
            )}
            className="w-full bg-blush px-4 py-3 text-sm font-semibold text-paper transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {state === "checking" ? "Checking connection…" : state === "connecting" ? "Opening mdbase connect…" : savedConnections().length ? "Connect another collection" : "Choose workout collection"}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-faded">
            Local collections stay on your computer. Hosted collections remain available when it is offline.
          </p>
        </div>
      </section>
    </main>
  );
}

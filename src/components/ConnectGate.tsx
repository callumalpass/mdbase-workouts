import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  connectErrorMessage,
  connectIsRequired,
  subscribeToWorkoutSession,
  workoutSession,
  workoutSnapshot,
} from "../lib/connect";
import { invalidateConnectApiCache } from "../lib/connect-api";

export default function ConnectGate({ children }: { children: ReactNode }) {
  if (!connectIsRequired()) return <>{children}</>;
  return <RequiredConnectGate>{children}</RequiredConnectGate>;
}

function RequiredConnectGate({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribeToWorkoutSession,
    workoutSnapshot,
  );
  const [starting, setStarting] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void workoutSession.start()
      .catch((reason: unknown) => {
        if (active) setError(connectErrorMessage(reason));
      })
      .finally(() => {
        if (active) setStarting(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (snapshot.status === "ready") {
    return (
      <ConnectedCollection
        key={snapshot.collectionId}
        connection={snapshot.connection}
      >
        {children}
      </ConnectedCollection>
    );
  }

  async function beginConnection() {
    setOpening(true);
    setError("");
    try {
      await workoutSession.authorize("choose");
    } catch (reason) {
      setError(connectErrorMessage(reason));
      setOpening(false);
    }
  }

  function openConnection(collectionId: string) {
    setError("");
    try {
      invalidateConnectApiCache();
      workoutSession.select(collectionId, { history: "replace" });
    } catch (reason) {
      setError(connectErrorMessage(reason));
    }
  }

  const unavailableMessage = snapshot.status === "unavailable"
    ? snapshot.reason === "invalid_stored_grant"
      ? "This saved authorization is no longer compatible. Choose the collection again."
      : snapshot.reason === "authorization_lost"
        ? "Access to this collection was removed. Choose it again or open another collection."
        : "This bookmarked collection is not authorized on this device."
    : "";
  const displayedError = error || unavailableMessage;
  const busy = starting || opening;

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

          {displayedError && (
            <div role="alert" className="mb-4 border border-blush bg-paper px-3 py-2 text-sm text-blush">
              {displayedError}
            </div>
          )}

          {snapshot.connections.length ? (
            <div className="mb-4 border-y border-rule">
              {snapshot.connections.map((connection) => (
                <button
                  key={connection.collectionId}
                  type="button"
                  className="flex w-full items-center justify-between gap-4 border-b border-rule px-3 py-3 text-left last:border-b-0 active:bg-paper"
                  onClick={() => openConnection(connection.collectionId)}
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
            disabled={busy}
            onClick={() => void beginConnection()}
            className="w-full bg-blush px-4 py-3 text-sm font-semibold text-paper transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {starting
              ? "Checking connection…"
              : opening
                ? "Opening mdbase connect…"
                : snapshot.connections.length
                  ? "Connect another collection"
                  : "Choose workout collection"}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-faded">
            Local collections stay on your computer. Hosted collections remain available when it is offline.
          </p>
        </div>
      </section>
    </main>
  );
}

function ConnectedCollection({
  connection,
  children,
}: {
  connection: ReturnType<typeof workoutSession.select>;
  children: ReactNode;
}) {
  useEffect(() => {
    invalidateConnectApiCache();
    void connection.checkDirectAccess();
    return () => invalidateConnectApiCache();
  }, [connection]);
  return <>{children}</>;
}

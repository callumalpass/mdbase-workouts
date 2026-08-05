import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  connectErrorMessage,
  connectIsRequired,
  recoverWorkoutPendingMutation,
  refreshWorkoutPendingMutation,
  subscribeToWorkoutPendingMutation,
  subscribeToWorkoutSession,
  workoutPendingMutationSnapshot,
  workoutSession,
  workoutSnapshot,
} from "../lib/connect";
import { invalidateConnectApiCache } from "../lib/connect-api";
import type { ConnectRequestOptions, MdbaseConnection } from "@mdbase-dev/connect";
import { requireConnectOutcome } from "../lib/connect-outcome";

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
  const [applyingDefinitions, setApplyingDefinitions] = useState(false);
  const [error, setError] = useState("");
  const foregroundRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    // The application session is a process-wide shared bootstrap. Consumers may
    // unmount independently (including React StrictMode's probe mount), so only
    // detach this consumer; keep the shared, bounded startup alive.
    void workoutSession.start({ timeoutMs: 15_000 })
      .then(requireConnectOutcome)
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

  useEffect(() => () => {
    foregroundRequest.current?.abort("Workout connection screen closed");
  }, []);

  if (snapshot.status === "ready") {
    const connection = workoutSession.connection();
    if (!connection) throw new Error("The ready workout session has no connection.");
    return (
      <ConnectedCollection
        key={snapshot.collectionId}
        connection={connection}
      >
        {children}
      </ConnectedCollection>
    );
  }

  async function beginConnection() {
    setOpening(true);
    setError("");
    try {
      requireConnectOutcome(await workoutSession.authorize("choose", requestOptions(15_000)));
    } catch (reason) {
      setError(connectErrorMessage(reason));
    } finally {
      setOpening(false);
    }
  }

  async function reviewAuthorization() {
    setOpening(true);
    setError("");
    try {
      requireConnectOutcome(await workoutSession.authorize("selected", requestOptions(15_000)));
    } catch (reason) {
      setError(connectErrorMessage(reason));
    } finally {
      setOpening(false);
    }
  }

  async function applyCollectionSetup() {
    setApplyingDefinitions(true);
    setError("");
    try {
      requireConnectOutcome(await workoutSession.applyCollectionSetup(requestOptions(30_000)));
    } catch (reason) {
      setError(connectErrorMessage(reason));
    } finally {
      setApplyingDefinitions(false);
    }
  }

  function requestOptions(timeoutMs: number): ConnectRequestOptions {
    foregroundRequest.current?.abort("A newer workout connection action superseded this one");
    const controller = new AbortController();
    foregroundRequest.current = controller;
    return { signal: controller.signal, timeoutMs };
  }

  function openConnection(collectionId: string) {
    setError("");
    try {
      invalidateConnectApiCache();
      requireConnectOutcome(
        workoutSession.select(collectionId, { history: "replace" }),
      );
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
    : snapshot.status === "authorization_required"
      ? "This collection needs updated access for the current workout contracts. Review the changes to continue."
      : snapshot.status === "blocked"
        ? snapshot.problem.message
        : "";
  const displayedError = error || unavailableMessage;
  const reviewingDefinitions = snapshot.status === "setup_review_required";
  const checkingDefinitions = snapshot.status === "checking_setup";
  const definitionsApplicable = !reviewingDefinitions
    || snapshot.update.canApply;
  const busy = starting || opening || applyingDefinitions || checkingDefinitions;

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

          {reviewingDefinitions && (
            <div className="mb-4 border border-ocean bg-paper px-3 py-3 text-sm">
              <strong className="block">Review workout definitions</strong>
              <p className="mt-1 text-faded">
                Workouts needs to install or update its portable record definitions before opening this collection.
              </p>
              <ul className="mt-2 space-y-1 font-mono text-xs text-faded">
                {snapshot.update.typePacks.map((update) => (
                  <li key={update.id}>{update.name}: {update.status}</li>
                ))}
              </ul>
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
            disabled={busy || !definitionsApplicable}
            onClick={() => void (
              reviewingDefinitions
                ? applyCollectionSetup()
                : snapshot.status === "authorization_required"
                ? reviewAuthorization()
                : beginConnection()
            )}
            className="w-full bg-blush px-4 py-3 text-sm font-semibold text-paper transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {applyingDefinitions
              ? "Applying workout definitions…"
              : checkingDefinitions
                ? "Checking workout definitions…"
                : starting
              ? "Checking connection…"
              : opening
                ? "Opening mdbase connect…"
                : reviewingDefinitions
                  ? definitionsApplicable
                    ? "Apply workout definitions"
                    : "Resolve definition conflicts"
                : snapshot.status === "authorization_required"
                  ? "Review updated access"
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
  connection: MdbaseConnection;
  children: ReactNode;
}) {
  const pending = useSyncExternalStore(
    subscribeToWorkoutPendingMutation,
    workoutPendingMutationSnapshot,
  );
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  useEffect(() => {
    invalidateConnectApiCache();
    refreshWorkoutPendingMutation();
    const controller = new AbortController();
    void connection.checkDirectAccess({ signal: controller.signal, timeoutMs: 5_000 }).catch(() => {});
    return () => {
      controller.abort("Workout collection changed");
      invalidateConnectApiCache();
    };
  }, [connection]);

  async function recover() {
    setRecovering(true);
    setRecoveryError("");
    try {
      await recoverWorkoutPendingMutation({ timeoutMs: 20_000 });
      invalidateConnectApiCache();
    } catch (error) {
      setRecoveryError(connectErrorMessage(error));
    } finally {
      setRecovering(false);
    }
  }

  return <>
    {pending && <aside role="status" className="mx-auto mt-3 max-w-2xl border border-blush bg-paper px-4 py-3 text-sm">
      <p>This workout write may have completed. Recover request <code>{pending.requestId}</code> before making it again.</p>
      {recoveryError && <p role="alert" className="mt-2 text-blush">{recoveryError}</p>}
      <button
        type="button"
        disabled={recovering}
        onClick={() => void recover()}
        className="mt-3 bg-blush px-3 py-2 font-semibold text-paper disabled:opacity-50"
      >{recovering ? "Recovering…" : "Recover write"}</button>
    </aside>}
    {children}
  </>;
}

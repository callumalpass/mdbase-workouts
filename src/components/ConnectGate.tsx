import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  applyWorkoutCollectionSetup,
  authorizeWorkoutCollection,
  connectErrorMessage,
  connectIsRequired,
  recoverWorkoutPendingMutation,
  refreshWorkoutPendingMutation,
  selectWorkoutCollection,
  setWorkoutStartupFailure,
  subscribeToWorkoutMutationBusy,
  subscribeToWorkoutPendingMutation,
  subscribeToWorkoutSession,
  subscribeToWorkoutStartupFailure,
  workoutMutationBusySnapshot,
  workoutPendingMutationSnapshot,
  workoutSession,
  workoutSnapshot,
  workoutStartupFailureSnapshot,
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
  const mutationBusy = useSyncExternalStore(
    subscribeToWorkoutMutationBusy,
    workoutMutationBusySnapshot,
  );
  const pending = useSyncExternalStore(
    subscribeToWorkoutPendingMutation,
    workoutPendingMutationSnapshot,
  );
  const startupFailure = useSyncExternalStore(
    subscribeToWorkoutStartupFailure,
    workoutStartupFailureSnapshot,
  );
  const [starting, setStarting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [applyingDefinitions, setApplyingDefinitions] = useState(false);
  const [error, setError] = useState("");
  const foregroundRequest = useRef<AbortController | null>(null);

  const lifecycleStarting = snapshot.status === "starting";
  const lifecycleTerminal = snapshot.status === "destroyed";
  const lifecycleActionable = snapshot.status !== "not_started"
    && snapshot.status !== "starting"
    && snapshot.status !== "start_failed"
    && snapshot.status !== "destroyed";

  useEffect(() => () => {
    foregroundRequest.current?.abort("Workout connection screen closed");
  }, []);

  useEffect(() => {
    if ("collectionId" in snapshot) refreshWorkoutPendingMutation();
  }, [snapshot]);

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
    if (!lifecycleActionable || opening) return;
    setOpening(true);
    setError("");
    try {
      await authorizeWorkoutCollection("choose", requestOptions(15_000));
    } catch (reason) {
      setError(connectErrorMessage(reason));
    } finally {
      setOpening(false);
    }
  }

  async function reviewAuthorization() {
    if (snapshot.status !== "authorization_required" || opening) return;
    setOpening(true);
    setError("");
    try {
      await authorizeWorkoutCollection("selected", requestOptions(15_000));
    } catch (reason) {
      setError(connectErrorMessage(reason));
    } finally {
      setOpening(false);
    }
  }

  async function applyCollectionSetup() {
    if (snapshot.status !== "setup_review_required" || applyingDefinitions) return;
    setApplyingDefinitions(true);
    setError("");
    try {
      await applyWorkoutCollectionSetup(requestOptions(30_000));
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
    if (!lifecycleActionable || opening || applyingDefinitions) return;
    setError("");
    try {
      selectWorkoutCollection(collectionId);
      invalidateConnectApiCache();
    } catch (reason) {
      setError(connectErrorMessage(reason));
    }
  }

  async function retryStart() {
    if (snapshot.status !== "start_failed" && snapshot.status !== "not_started") return;
    setStarting(true);
    setError("");
    try {
      const outcome = await workoutSession.start({ timeoutMs: 15_000 });
      requireConnectOutcome(outcome);
      setWorkoutStartupFailure(null);
    } catch (reason) {
      setWorkoutStartupFailure(reason);
      setError(connectErrorMessage(reason));
    } finally {
      setStarting(false);
    }
  }

  const unavailableMessage = snapshot.status === "start_failed"
    ? connectErrorMessage({ problem: snapshot.problem })
    : snapshot.status === "not_started" && startupFailure
      ? connectErrorMessage(startupFailure)
    : snapshot.status === "destroyed"
      ? "This workout connection session has ended. Reload Workouts to reconnect."
      : snapshot.status === "unavailable"
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
  const lifecycleBusy = starting || lifecycleStarting || opening
    || applyingDefinitions || checkingDefinitions;
  const switchingBlocked = mutationBusy || pending !== null;
  const primaryBusy = lifecycleBusy || (
    snapshot.status !== "not_started"
    && snapshot.status !== "start_failed"
    && snapshot.status !== "authorization_required"
    && switchingBlocked
  );
  const selectedCollectionId = "collectionId" in snapshot
    ? snapshot.collectionId
    : null;
  const alternativeConnections = snapshot.connections.filter(
    (connection) => connection.collectionId !== selectedCollectionId,
  );

  return (
    <main className="min-h-[100dvh] overflow-y-auto px-5 py-10 sm:py-16">
      {pending && <PendingMutationRecovery pending={pending} />}
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

          {lifecycleActionable && alternativeConnections.length ? (
            <div className="mb-4 border-y border-rule">
              {alternativeConnections.map((connection) => (
                <button
                  key={connection.collectionId}
                  type="button"
                  disabled={lifecycleBusy || mutationBusy || (
                    pending !== null
                    && pending.collectionId !== connection.collectionId
                  )}
                  className="flex w-full items-center justify-between gap-4 border-b border-rule px-3 py-3 text-left last:border-b-0 active:bg-paper disabled:opacity-50"
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

          {!lifecycleTerminal && <button
            type="button"
            disabled={primaryBusy || !definitionsApplicable}
            onClick={() => void (
              snapshot.status === "start_failed" || snapshot.status === "not_started"
                ? retryStart()
                : reviewingDefinitions
                  ? applyCollectionSetup()
                  : snapshot.status === "authorization_required"
                    ? reviewAuthorization()
                    : beginConnection()
            )}
            className="w-full bg-blush px-4 py-3 text-sm font-semibold text-paper transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {snapshot.status === "start_failed" || snapshot.status === "not_started"
              ? starting ? "Retrying connection…" : "Retry connection"
              : applyingDefinitions
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
                 : alternativeConnections.length
                   ? "Connect another collection"
                   : "Choose workout collection"}
          </button>}
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

  return <>
    <PendingMutationRecovery />
    {children}
  </>;
}

function PendingMutationRecovery({
  pending: suppliedPending,
}: {
  pending?: ReturnType<typeof workoutPendingMutationSnapshot>;
}) {
  const storedPending = useSyncExternalStore(
    subscribeToWorkoutPendingMutation,
    workoutPendingMutationSnapshot,
  );
  const pending = suppliedPending ?? storedPending;
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");

  async function recover() {
    if (!pending) return;
    setRecovering(true);
    setRecoveryError("");
    try {
      await recoverWorkoutPendingMutation({ timeoutMs: 20_000 });
      invalidateConnectApiCache();
      window.location.reload();
    } catch (error) {
      setRecoveryError(connectErrorMessage(error));
    } finally {
      setRecovering(false);
    }
  }

  if (!pending) return null;
  const setupMutation = pending.operation === "apply_collection_setup";
  return <aside role="status" className="mx-auto mb-3 mt-3 max-w-2xl border border-blush bg-paper px-4 py-3 text-sm">
      <p>
        This {setupMutation ? "workout setup change" : "workout write"} may have completed.
        Recover request <code>{pending.requestId}</code> before making it again.
      </p>
      {recoveryError && <p role="alert" className="mt-2 text-blush">{recoveryError}</p>}
      <button
        type="button"
        disabled={recovering}
        onClick={() => void recover()}
        className="mt-3 bg-blush px-3 py-2 font-semibold text-paper disabled:opacity-50"
      >{recovering ? "Recovering…" : setupMutation ? "Recover setup change" : "Recover write"}</button>
    </aside>;
}

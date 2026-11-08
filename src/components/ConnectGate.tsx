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
  startWorkoutSession,
  subscribeToWorkoutMutationBusy,
  subscribeToWorkoutPendingMutation,
  subscribeToWorkoutSession,
  subscribeToWorkoutStartupFailure,
  workoutMutationBusySnapshot,
  workoutPendingMutationSnapshot,
  workoutSnapshot,
  workoutStartupFailureSnapshot,
  type ConnectRequestOptions,
  type WorkoutConnection,
} from "../lib/connect";
import { invalidateConnectApiCache } from "../lib/connect-api";
import { describeError, type MdbaseErrorAction, type MdbasePhase } from "@mdbase-dev/sdk";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const foregroundRequest = useRef<AbortController | null>(null);
  const phase = snapshot.phase;

  useEffect(() => () => {
    foregroundRequest.current?.abort("Workout connection screen closed");
  }, []);

  useEffect(() => {
    refreshWorkoutPendingMutation();
  }, [phase, pending?.requestId]);

  useEffect(() => {
    if (phase.kind !== "ready" && startupFailure) {
      setError(connectErrorMessage(startupFailure));
    }
  }, [phase.kind, startupFailure]);

  if (phase.kind === "ready") {
    return (
      <ConnectedCollection key={phase.collectionId} connection={phase.connection}>
        {children}
      </ConnectedCollection>
    );
  }

  async function act(action: () => Promise<void>): Promise<void> {
    if (busy || mutationBusy || pending) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(connectErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function requestOptions(timeoutMs: number): ConnectRequestOptions {
    foregroundRequest.current?.abort("A newer workout connection action superseded this one");
    const controller = new AbortController();
    foregroundRequest.current = controller;
    return { signal: controller.signal, timeoutMs };
  }

  const chooser = snapshot.collections
    .filter((collection) => collection.collectionId !== phaseCollectionId(phase))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const problem = phase.kind === "problem"
    ? phase.problem
    : phase.kind === "signed_out"
      ? phase.notice
      : null;
  const terminal = phase.kind === "closed";
  const displayedError = error || problem?.message || "";
  const unavailable = phase.kind === "unavailable";
  const starting = phase.kind === "starting" || phase.kind === "authorizing" || phase.kind === "opening";
  const action = connectionAction(phase, () => ({
    kind: phase.kind,
    perform: () => act(async () => {
      switch (phase.kind) {
        case "signed_out":
        case "choosing":
          await authorizeWorkoutCollection("choose", requestOptions(15_000));
          break;
        case "needs_approval":
          await authorizeWorkoutCollection("selected", requestOptions(15_000));
          break;
        case "needs_setup":
          await applyWorkoutCollectionSetup(requestOptions(30_000));
          break;
        case "problem":
          if (phase.problem.action === "set_up") {
            await applyWorkoutCollectionSetup(requestOptions(30_000));
          } else if (phase.problem.action === "sign_in") {
            await authorizeWorkoutCollection("choose", requestOptions(15_000));
          } else if (phase.problem.action === "approve") {
            await authorizeWorkoutCollection("selected", requestOptions(15_000));
          } else {
            await startWorkoutSession(requestOptions(15_000));
          }
          break;
        default:
          await startWorkoutSession(requestOptions(15_000));
      }
    }),
  }));
  const actionLabel = busy
    ? "Connecting…"
    : starting
      ? phase.kind === "opening"
        ? "Opening workout collection…"
        : "Checking connection…"
      : action.label;

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

          {phase.kind === "needs_setup" && (
            <div className="mb-4 border border-ocean bg-paper px-3 py-3 text-sm">
              <strong className="block">Review workout definitions</strong>
              <p className="mt-1 text-faded">
                Workouts needs to install or update its portable record definitions before opening this collection.
              </p>
            </div>
          )}

          {chooser.length ? (
            <div className="mb-4 border-y border-rule">
              {chooser.map((collection) => {
                const reason = collection.availability?.state === "unavailable"
                  ? describeError(collection.availability)?.message
                  : null;
                return (
                  <button
                    key={collection.collectionId}
                    type="button"
                    disabled={busy || mutationBusy || pending !== null || Boolean(reason)}
                    className="flex w-full items-center justify-between gap-4 border-b border-rule px-3 py-3 text-left last:border-b-0 active:bg-paper disabled:opacity-50"
                    onClick={() => void act(async () => {
                      await selectWorkoutCollection(collection.collectionId, requestOptions(15_000));
                      invalidateConnectApiCache();
                    })}
                  >
                    <span>
                      <strong className="block text-sm">{collection.displayName}</strong>
                      <small className="mt-1 block font-mono text-[9px] text-faded">
                        {reason ?? collection.collectionId}
                      </small>
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ocean">
                      {reason ? "Unavailable" : "Open"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!terminal && !unavailable && action.visible && (
            <button
              type="button"
              disabled={busy || starting || mutationBusy || pending !== null}
              onClick={() => void action.perform()}
              className="w-full bg-blush px-4 py-3 text-sm font-semibold text-paper transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {actionLabel}
            </button>
          )}
          <p className="mt-3 text-center text-xs leading-5 text-faded">
            Local collections stay on your computer. Cloud copies and Private collections stay available when it is offline.
          </p>
        </div>
      </section>
    </main>
  );
}

function phaseCollectionId(phase: MdbasePhase): string | null {
  return "collectionId" in phase ? phase.collectionId ?? null : null;
}

function connectionAction(
  phase: MdbasePhase,
  describe: () => { kind: string; perform: () => Promise<void> },
): { label: string; visible: boolean; perform: () => Promise<void> } {
  const { perform } = describe();
  switch (phase.kind) {
    case "signed_out":
      return { label: "Sign in to mdbase", visible: true, perform };
    case "choosing":
      return { label: "Choose workout collection", visible: true, perform };
    case "needs_approval":
      return {
        label: phase.declined ? "Choose workout collection" : "Review updated access",
        visible: true,
        perform,
      };
    case "needs_setup":
      return { label: "Apply workout definitions", visible: true, perform };
    case "problem":
      return {
        label: phase.problem.actionLabel
          ?? labelForAction(phase.problem.action)
          ?? "Try again",
        visible: phase.problem.action !== "none" && phase.problem.action !== "contact_support",
        perform,
      };
    case "closed":
    case "unavailable":
      return { label: "", visible: false, perform };
    default:
      return { label: "", visible: false, perform };
  }
}

function labelForAction(action: MdbaseErrorAction): string | null {
  switch (action) {
    case "retry":
    case "wait":
    case "check_connection":
      return "Try again";
    case "sign_in":
      return "Sign in to mdbase";
    case "approve":
      return "Review access";
    case "choose_collection":
      return "Choose workout collection";
    case "set_up":
      return "Apply workout definitions";
    case "resolve_outcome":
      return "Recover write";
    default:
      return null;
  }
}

function ConnectedCollection({
  connection,
  children,
}: {
  connection: Extract<MdbasePhase, { kind: "ready" }>["connection"];
  children: ReactNode;
}) {
  useEffect(() => {
    invalidateConnectApiCache();
    refreshWorkoutPendingMutation();
    const stop = connection.records.ledger.subscribe(() => refreshWorkoutPendingMutation());
    return () => {
      stop();
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
  return <aside role="status" className="mx-auto mb-3 mt-3 max-w-2xl border border-blush bg-paper px-4 py-3 text-sm">
      <p>
        This workout write may have completed.
        Recover write <code>{pending.requestId}</code> before making it again.
      </p>
      {recoveryError && <p role="alert" className="mt-2 text-blush">{recoveryError}</p>}
      <button
        type="button"
        disabled={recovering}
        onClick={() => void recover()}
        className="mt-3 bg-blush px-3 py-2 font-semibold text-paper disabled:opacity-50"
      >{recovering ? "Recovering…" : "Recover write"}</button>
    </aside>;
}

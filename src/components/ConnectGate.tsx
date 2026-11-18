import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  applyWorkoutCollectionSetup,
  addWorkoutCollection,
  approveWorkoutCollection,
  connectErrorMessage,
  connectIsRequired,
  selectWorkoutCollection,
  signInToWorkouts,
  startWorkoutsOver,
  startWorkoutSession,
  subscribeToWorkoutSession,
  subscribeToWorkoutStartupFailure,
  unlockWorkoutCollection,
  workoutSnapshot,
  workoutStartupFailureSnapshot,
} from "../lib/connect";
import { followWorkoutCollection, resetWorkoutCollectionCache } from "../lib/connect-api";
import { describeError, type MdbaseErrorAction, type MdbasePhase } from "@mdbase-dev/sdk";
import SyncStatus from "./SyncStatus";

export default function ConnectGate({ children }: { children: ReactNode }) {
  if (!connectIsRequired()) return <>{children}</>;
  return <RequiredConnectGate>{children}</RequiredConnectGate>;
}

function RequiredConnectGate({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribeToWorkoutSession,
    workoutSnapshot,
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
    if (busy) return;
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

  // Nothing here is timed. Sign-in and approval wait on the person in the
  // Connect window, and aborting one closes that window; a Private collection
  // pick still in flight then stops the SDK ("application_worker_binding").
  // Opening and setup are bounded by the SDK. The signal only cancels work
  // this screen no longer shows.
  function requestOptions(): { signal: AbortSignal } {
    foregroundRequest.current?.abort("A newer workout connection action superseded this one");
    const controller = new AbortController();
    foregroundRequest.current = controller;
    return { signal: controller.signal };
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
  // A slow open is still the SDK's to finish, but the person gets a way on:
  // reload to start it afresh, or sign out when even that does not help.
  const slowOpening = phase.kind === "opening" && phase.slow;
  const stuck = phase.kind === "problem" || slowOpening;
  const action = connectionAction(phase, () => ({
    kind: phase.kind,
    perform: () => act(async () => {
      // Each phase moves on with the SDK call its README names for it.
      switch (phase.kind) {
        case "signed_out":
          await signInToWorkouts(requestOptions());
          break;
        case "authorizing":
          // The window may be gone (closed, or this page reloaded) while the
          // request is still pending: the same action opens it again on it.
          if (phase.purpose === "sign_in") await signInToWorkouts(requestOptions());
          else if (phase.purpose === "add") await addWorkoutCollection(requestOptions());
          else await approveWorkoutCollection(phase.collectionId, requestOptions());
          break;
        case "choosing":
          await addWorkoutCollection(requestOptions());
          break;
        case "needs_approval":
          await approveWorkoutCollection(phase.collectionId, requestOptions());
          break;
        case "needs_setup":
          await applyWorkoutCollectionSetup(requestOptions());
          break;
        case "opening":
          window.location.reload();
          break;
        case "problem":
          switch (phase.problem.action) {
            case "set_up":
              await applyWorkoutCollectionSetup(requestOptions());
              break;
            case "sign_in":
              await signInToWorkouts(requestOptions());
              break;
            case "approve":
              await approveWorkoutCollection(phase.collectionId, requestOptions());
              break;
            case "choose_collection":
              await addWorkoutCollection(requestOptions());
              break;
            default:
              await startWorkoutSession(requestOptions());
          }
          break;
        default:
          await startWorkoutSession(requestOptions());
      }
    }),
  }));
  const actionLabel = busy
    ? "Connecting…"
    : starting && phase.kind !== "authorizing" && !slowOpening
      ? phase.kind === "opening"
        ? "Opening workout collection…"
        : "Checking connection…"
      : action.label;

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

          <WaitingNotice phase={phase} />

          {phase.kind === "needs_unlock" && phase.mode === "password" && (
            <form
              className="mb-4"
              onSubmit={(event) => {
                event.preventDefault();
                const field = event.currentTarget.elements.namedItem("password") as HTMLInputElement;
                const password = field.value;
                field.value = "";
                void act(() => unlockWorkoutCollection(phase.collectionId, password, requestOptions()));
              }}
            >
              <label className="block text-sm">
                <span className="block font-semibold">Encryption password</span>
                <span className="mt-1 block text-faded">
                  {phase.problem?.message ?? "Enter your mdbase encryption password to read this collection in this browser."}
                </span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={busy || phase.unlocking}
                  className="mt-2 w-full border border-rule bg-paper px-3 py-2"
                />
              </label>
              <button
                type="submit"
                disabled={busy || phase.unlocking}
                className="mt-3 w-full bg-blush px-4 py-3 text-sm font-semibold text-paper disabled:opacity-50"
              >
                {busy || phase.unlocking ? "Unlocking…" : "Unlock"}
              </button>
            </form>
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
                    disabled={busy || Boolean(reason)}
                    className="flex w-full items-center justify-between gap-4 border-b border-rule px-3 py-3 text-left last:border-b-0 active:bg-paper disabled:opacity-50"
                    onClick={() => void act(async () => {
                      await selectWorkoutCollection(collection.collectionId, requestOptions());
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
              disabled={busy || (starting && phase.kind !== "authorizing" && !slowOpening)}
              onClick={() => void action.perform()}
              className="w-full bg-blush px-4 py-3 text-sm font-semibold text-paper transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {actionLabel}
            </button>
          )}
          {stuck && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(async () => {
                foregroundRequest.current?.abort("Starting the workout connection over");
                await startWorkoutsOver((pending) => window.confirm(
                  `${pending === 1 ? "1 change hasn't" : pending ? `${pending} changes haven't` : "Some changes haven't"} reached mdbase yet. Signing out loses ${pending === 1 ? "it" : "them"} in this browser. Sign out anyway?`,
                ));
              })}
              className="mt-3 w-full border border-rule px-4 py-2 text-xs text-faded active:bg-paper disabled:opacity-50"
            >
              Sign out and start again
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

/**
 * While the SDK starts, waits on the Connect window or opens a collection there
 * is no action to offer, so say what it is waiting for instead of showing an
 * empty card. A Private collection opens through the computer that holds it;
 * when that takes long, it is usually still waiting for that computer.
 */
export function waitingCopy(phase: MdbasePhase): { title: string; detail: string | null } | null {
  switch (phase.kind) {
    case "starting":
      return { title: "Checking connection…", detail: null };
    case "authorizing":
      return {
        title: "Continue in the mdbase window.",
        detail: phase.purpose === "sign_in"
          ? "Sign in there. This page carries on by itself once you have. If you can't see that window, open it again below."
          : "Choose or approve the collection there. This page carries on by itself once you have. If you can't see that window, open it again below.",
      };
    case "opening": {
      const name = phase.displayName ?? "your workout collection";
      return {
        title: `Opening ${name}${phase.progress ? ` · ${OPENING_STEPS[phase.progress]}` : ""}…`,
        detail: phase.slow
          ? "This is taking longer than usual. A Private collection opens through the computer that holds it, so check that mdbase Connect is running there and allow Workouts if it asks. If it is, reload to try again."
          : null,
      };
    }
    case "needs_unlock":
      return phase.mode === "password"
        ? null
        : {
          title: "This collection is locked in this browser.",
          detail: "It can only be unlocked from a computer running the mdbase app. Open it there, then reload this page.",
        };
    default:
      return null;
  }
}

const OPENING_STEPS: Record<NonNullable<Extract<MdbasePhase, { kind: "opening" }>["progress"]>, string> = {
  joining: "joining",
  opening_store: "opening storage",
  connecting_log: "connecting",
  syncing: "syncing",
  loading_snapshot: "loading records",
  replaying: "catching up",
  waiting_for_key: "waiting for the key",
  verifying_read: "checking access",
  checking_setup: "checking definitions",
};

function WaitingNotice({ phase }: { phase: MdbasePhase }) {
  const copy = waitingCopy(phase);
  if (!copy) return null;
  return (
    <div role="status" aria-live="polite" className="mb-4 border border-rule bg-paper px-3 py-3 text-sm">
      <strong className="block font-semibold">{copy.title}</strong>
      {copy.detail && <p className="mt-1 leading-6 text-faded">{copy.detail}</p>}
    </div>
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
    case "authorizing":
      return { label: "Open the mdbase window again", visible: true, perform };
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
    case "opening":
      return { label: "Reload", visible: phase.slow, perform };
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
    resetWorkoutCollectionCache();
    const stop = followWorkoutCollection({
      collectionId: connection.id,
      displayName: connection.displayName,
      records: connection.records,
    });
    return () => {
      stop();
      resetWorkoutCollectionCache();
    };
  }, [connection]);

  return <>
    <SyncStatus />
    {children}
  </>;
}

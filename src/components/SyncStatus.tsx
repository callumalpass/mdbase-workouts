import { useState, useSyncExternalStore } from "react";
import { describeError, type MdbaseSync, type SyncAttention } from "@mdbase-dev/sdk";
import { subscribeToWorkoutSession, workoutSnapshot } from "../lib/connect";

/**
 * The SDK's one status for the open collection (`snapshot.sync`). Writes
 * resolve once they are kept on this device; this says whether they have
 * reached the cloud copy yet, and shows a write the service refused.
 */
export default function SyncStatus() {
  const snapshot = useSyncExternalStore(subscribeToWorkoutSession, workoutSnapshot);
  const sync = snapshot.sync;
  const records = snapshot.phase.kind === "ready" ? snapshot.phase.connection.records : null;
  const [dismissing, setDismissing] = useState(false);
  if (!sync) return null;

  const label = syncLabel(sync);
  const rejected = sync.writes?.rejected[0] ?? null;

  return <>
    {label && (
      <p
        role="status"
        className={`fixed top-[18px] right-14 z-30 font-mono text-[10px] uppercase tracking-[0.12em] ${
          sync.state === "attention" ? "text-blush" : "text-faded"
        }`}
      >
        {label}
      </p>
    )}
    {rejected && records && (
      <div
        role="alert"
        className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md border border-blush bg-paper px-4 py-3 text-sm shadow-sm"
      >
        <p className="font-semibold">A change was not saved.</p>
        <p className="mt-1 text-faded">
          {(rejected.problem && describeError(rejected.problem)?.message)
            ?? "The workout collection refused it."}
        </p>
        <button
          type="button"
          disabled={dismissing}
          onClick={() => {
            setDismissing(true);
            void records.ledger.acknowledge(rejected.mutationId)
              .catch(() => undefined)
              .finally(() => setDismissing(false));
          }}
          className="mt-3 border border-rule px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-faded active:bg-card disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    )}
  </>;
}

/** Null when there is nothing worth showing: everything is saved, or a save is only a moment old. */
export function syncLabel(sync: MdbaseSync): string | null {
  switch (sync.state) {
    case "attention":
      return attentionLabel(sync.attention[0], sync);
    case "saved_on_device":
      return "Saved on this device";
    case "offline":
      return "Offline";
    case "reconnecting":
      return "Reconnecting…";
    case "saving":
      return sync.pendingFor === "moment" ? null : "Saving…";
    case "catching_up":
      return "Catching up…";
    case "saved":
      return null;
  }
}

function attentionLabel(attention: SyncAttention | undefined, sync: MdbaseSync): string {
  switch (attention) {
    case "rejected":
      return "Change not saved";
    case "conflicts":
      return sync.conflicts === 1 ? "1 conflict to review" : `${sync.conflicts} conflicts to review`;
    case "held":
      return "Change held for review";
    case "storage_may_be_evicted":
      return "Only on this device";
    case undefined:
      return "Needs attention";
    default:
      return describeError(attention)?.title ?? "Needs attention";
  }
}

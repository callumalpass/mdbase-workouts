import { useState, useEffect, useSyncExternalStore } from "react";
import { api } from "../lib/api";
import {
  authorizeWorkoutCollection,
  forgetWorkoutCollection,
  selectWorkoutCollection,
  subscribeToWorkoutMutationBusy,
  subscribeToWorkoutPendingMutation,
  subscribeToWorkoutSession,
  workoutMutationBusySnapshot,
  workoutPendingMutationSnapshot,
  workoutSnapshot,
} from "../lib/connect";
import { invalidateConnectApiCache } from "../lib/connect-api";
import { clearWorkoutCache } from "../lib/workout-cache";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsSheet({ open, onClose }: Props) {
  const snapshot = useSyncExternalStore(
    subscribeToWorkoutSession,
    workoutSnapshot,
  );
  const mutationBusy = useSyncExternalStore(
    subscribeToWorkoutMutationBusy,
    workoutMutationBusySnapshot,
  );
  const pendingMutation = useSyncExternalStore(
    subscribeToWorkoutPendingMutation,
    workoutPendingMutationSnapshot,
  );
  const phase = snapshot.phase;
  const connection = phase.kind === "ready" ? phase.connection : null;
  const connected = connection
    ? { collectionId: connection.id, displayName: connection.displayName }
    : null;
  const [dataDir, setDataDir] = useState("");
  const [resolvedDir, setResolvedDir] = useState("");
  const [originalDir, setOriginalDir] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [collectionName, setCollectionName] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);
  const connectedCollectionId = connected?.collectionId;

  useEffect(() => {
    if (open) {
      api.settings.get().then((s) => {
        setDataDir(s.configDataDir);
        setOriginalDir(s.configDataDir);
        setResolvedDir(s.dataDir);
        setCollectionName(s.collectionName || "");
        setError("");
      }).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load collection settings");
      });
    }
  }, [connectedCollectionId, connection, open]);

  if (!open) return null;

  const isDirty = dataDir.trim() !== "" && dataDir.trim() !== originalDir;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await api.settings.update({ dataDir: dataDir.trim() });
      setDataDir(updated.configDataDir);
      setOriginalDir(updated.configDataDir);
      setResolvedDir(updated.dataDir);
      setCollectionName(updated.collectionName || "");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-paper border-t-2 border-blush p-5 pb-8
        animate-[slideUp_0.2s_ease-out] max-h-[85dvh] overflow-y-auto">
        <div className="w-10 h-[2px] bg-rule mx-auto mb-4" />

        <h2 className="text-lg font-semibold mb-4">Settings</h2>

        {connected ? (
          <div className="border border-rule bg-card p-4">
            <p className="text-[10px] font-mono text-faded tracking-wider uppercase">Workout collection</p>
            <p className="mt-2 text-sm font-semibold">{collectionName || "Connected through mdbase connect"}</p>
            <p className="mt-1 text-xs text-faded">Connected through mdbase connect</p>
            <p className="mt-2 truncate font-mono text-[10px] text-faded">{connected.collectionId}</p>
            <button
              type="button"
              disabled={sessionBusy || mutationBusy}
              onClick={() => {
                setSessionBusy(true);
                setError("");
                void (async () => {
                  try {
                    const pending = connection?.records.ledger.getSnapshot().pending ?? [];
                    if (pending.length && !window.confirm(
                      "This collection has unsettled writes. Disconnecting discards their recovery records. Disconnect anyway?",
                    )) {
                      return;
                    }
                    await forgetWorkoutCollection(connected.collectionId, {
                      confirmPending: pending.length > 0,
                    });
                    clearWorkoutCache(connected.collectionId);
                    invalidateConnectApiCache();
                    onClose();
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : "The collection could not be disconnected.");
                  } finally {
                    setSessionBusy(false);
                  }
                })();
              }}
              className="mt-4 border border-rule px-3 py-2 text-xs text-faded active:bg-paper"
            >
              Disconnect collection
            </button>
            {snapshot.collections.filter(
              (candidate) => candidate.collectionId !== connected.collectionId,
            ).map((candidate) => (
              <button
                key={candidate.collectionId}
                type="button"
                disabled={sessionBusy || mutationBusy || (
                  pendingMutation !== null
                  && pendingMutation.collectionId !== candidate.collectionId
                ) || candidate.availability?.state === "unavailable"}
                onClick={() => {
                  setSessionBusy(true);
                  setError("");
                  void selectWorkoutCollection(candidate.collectionId)
                    .then(() => {
                      invalidateConnectApiCache();
                      onClose();
                    })
                    .catch((reason: unknown) => {
                      setError(reason instanceof Error ? reason.message : "The collection could not be opened.");
                    })
                    .finally(() => setSessionBusy(false));
                }}
                className="mt-2 block w-full border border-rule px-3 py-2 text-left text-xs text-faded active:bg-paper"
              >
                Open {candidate.displayName}
              </button>
            ))}
            <button
              type="button"
              disabled={sessionBusy || mutationBusy || pendingMutation !== null}
              onClick={() => {
                setSessionBusy(true);
                setError("");
                void authorizeWorkoutCollection("choose")
                  .catch((reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : "Another collection could not be connected.");
                  })
                  .finally(() => setSessionBusy(false));
              }}
              className="mt-2 block w-full border border-ocean px-3 py-2 text-xs text-ocean active:bg-paper"
            >
              Connect another collection
            </button>
          </div>
        ) : <>
          <label className="block text-[10px] font-mono text-faded tracking-wider uppercase mb-1.5">
            Data directory
          </label>
          <input
            type="text"
            value={dataDir}
            onChange={(e) => setDataDir(e.target.value)}
            placeholder="./data"
            className="w-full border border-rule bg-card px-3 py-2.5 text-sm
              font-mono placeholder:text-faded/50 focus:outline-none focus:border-blush
              transition-colors"
          />
          <p className="text-[10px] font-mono text-faded mt-1.5 truncate">
            {resolvedDir}
          </p>
        </>}

        {error && (
          <p className="text-sm text-blush mt-2">{error}</p>
        )}

        <div className="flex gap-2 mt-5">
          {connected ? (
            <button
              onClick={onClose}
              className="w-full py-3 border border-rule text-sm font-medium text-faded active:bg-card"
            >
              Close
            </button>
          ) : <>
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-rule text-sm font-medium
                text-faded active:bg-card active:scale-[0.98] transition-all duration-75"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="flex-1 py-3 bg-blush text-paper text-sm font-medium
                active:scale-[0.97] transition-transform duration-75 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </>}
        </div>
      </div>
    </div>
  );
}

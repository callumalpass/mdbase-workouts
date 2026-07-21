import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { connect, connectionInfo } from "../lib/connect";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsSheet({ open, onClose }: Props) {
  const connected = connectionInfo();
  const [dataDir, setDataDir] = useState("");
  const [resolvedDir, setResolvedDir] = useState("");
  const [originalDir, setOriginalDir] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [collectionName, setCollectionName] = useState("");

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
  }, [open]);

  if (!open) return null;

  const isDirty = dataDir.trim() !== "" && dataDir.trim() !== originalDir;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.settings.update({ dataDir: dataDir.trim() });
      window.location.reload();
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
            <p className="mt-2 text-sm font-semibold">{collectionName || "Connected through MDBASE Connect"}</p>
            <p className="mt-1 text-xs text-faded">Connected through MDBASE Connect</p>
            <p className="mt-2 truncate font-mono text-[10px] text-faded">{connected.collectionId}</p>
            <button
              type="button"
              onClick={() => { connect.disconnect(); window.location.reload(); }}
              className="mt-4 border border-rule px-3 py-2 text-xs text-faded active:bg-paper"
            >
              Disconnect collection
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

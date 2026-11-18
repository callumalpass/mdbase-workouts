import { useEffect, useState } from "react";
import { watchForAppUpdate } from "../lib/app-update";

/** Says when this tab runs an older Workouts than the one now deployed. */
export default function UpdateBanner() {
  const [updated, setUpdated] = useState(false);
  useEffect(() => watchForAppUpdate(() => setUpdated(true)), []);
  if (!updated) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 border-b border-ocean bg-card px-4 py-2 text-xs"
    >
      <span>Workouts has been updated.</span>
      <button
        type="button"
        onClick={() => location.reload()}
        className="border border-ocean px-2 py-1 font-semibold text-ocean active:bg-paper"
      >
        Reload
      </button>
    </div>
  );
}

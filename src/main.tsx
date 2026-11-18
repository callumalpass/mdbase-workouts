import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import UpdateBanner from "./components/UpdateBanner";
import "./index.css";
import {
  connectIsRequired,
  startWorkoutSession,
  workoutRedirectUri,
} from "./lib/connect";
import { finishGrantCallback, isGrantCallback } from "./lib/grant-callback";

const root = ReactDOM.createRoot(document.getElementById("root")!);

if (connectIsRequired() && isGrantCallback(new URL(location.href), workoutRedirectUri)) {
  // The Private-collection approval window: hand the result to the waiting tab.
  const href = location.href;
  history.replaceState(null, "", workoutRedirectUri);
  root.render(<CallbackNotice />);
  void finishGrantCallback(href).then((delivered) => {
    root.render(<CallbackNotice delivered={delivered} />);
  });
} else {
  // The connection screen follows the session's phase while it starts, so render
  // at once. Starting is not timed: a Private collection can take a while to
  // open, and aborting the start would only stop it.
  if (connectIsRequired()) void startWorkoutSession();
  root.render(
    <React.StrictMode>
      <UpdateBanner />
      <App />
    </React.StrictMode>
  );
}

/** Shown only if the window stays open (a browser may refuse to close it). */
function CallbackNotice({ delivered }: { delivered?: boolean }) {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faded">MDBase Workouts</p>
      <p className="mt-4 text-lg">
        {delivered === false
          ? "This browser could not pass the approval back. Close this window and try again from Workouts."
          : "Done. You can close this window and return to Workouts."}
      </p>
    </main>
  );
}

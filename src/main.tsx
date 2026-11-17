import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import {
  connectIsRequired,
  startWorkoutSession,
} from "./lib/connect";

// The connection screen follows the session's phase while it starts, so render
// at once. Starting is not timed: a Private collection can take a while to
// open, and aborting the start would only stop it.
if (connectIsRequired()) void startWorkoutSession();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

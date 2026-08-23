import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import {
  connectIsRequired,
  startWorkoutSession,
} from "./lib/connect";

async function bootstrap() {
  if (connectIsRequired()) {
    await startWorkoutSession({ timeoutMs: 15_000 });
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();

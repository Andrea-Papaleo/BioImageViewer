import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { Provider } from "react-redux";
import { store } from "./state/store.ts";
import { SchedulerProvider } from "./contexts/schuduler/WorkerSchedulerProvider.tsx";
import { DataPipelineProvider } from "./contexts/data-pipeline/DataPipelineProvider.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <SchedulerProvider>
        <DataPipelineProvider>
          <App />
        </DataPipelineProvider>
      </SchedulerProvider>
    </Provider>
  </StrictMode>,
);

import { useContext } from "react";
import { SchedulerContext } from "./WorkerSchedulerContext";
import { WorkerScheduler } from "@/services/WorkerScheduler/WorkerScheduler";
import type { AggregateProgress } from "@/services/WorkerScheduler/types";

export const useScheduler = (): WorkerScheduler => {
  const context = useContext(SchedulerContext);
  if (!context) {
    throw new Error("useScheduler must be used within SchedulerProvider");
  }
  return context.scheduler;
};

export const useSchedulerProgress = (): AggregateProgress => {
  const context = useContext(SchedulerContext);
  if (!context) {
    throw new Error(
      "useSchedulerProgress must be used within SchedulerProvider",
    );
  }
  return context.progress;
};

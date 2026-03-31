import type { AggregateProgress } from "@/services/WorkerScheduler/types";
import { WorkerScheduler } from "@/services/WorkerScheduler/WorkerScheduler";
import { createContext } from "react";

type SchedulerContextValue = {
  scheduler: WorkerScheduler;
  progress: AggregateProgress;
};

export const SchedulerContext = createContext<SchedulerContextValue | null>(
  null,
);

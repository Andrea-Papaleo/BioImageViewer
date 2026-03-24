import type { AggregateProgress } from "@/services/WorkerScheduler/types";
import { WorkerScheduler } from "@/services/WorkerScheduler/WorkerScheduler";
import { useEffect, useRef, useState } from "react";
import { SchedulerContext } from "./WorkerSchedulerContext";

const initialProgress: AggregateProgress = {
  pending: 0,
  running: 0,
  completed: 0,
  failed: 0,
  overallPercent: 0,
};

export const SchedulerProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const schedulerRef = useRef<WorkerScheduler>(null);
  const [progress, setProgress] = useState<AggregateProgress>(initialProgress);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const scheduler = new WorkerScheduler();
    schedulerRef.current = scheduler;

    // Subscribe to aggregate progress
    const unsubscribe = scheduler.onProgress(setProgress);

    setIsReady(true);

    return () => {
      unsubscribe();
      scheduler.shutdown();
    };
  }, []);

  if (!isReady || !schedulerRef.current) return null;

  return (
    <SchedulerContext.Provider
      value={{ scheduler: schedulerRef.current, progress }}
    >
      {children}
    </SchedulerContext.Provider>
  );
};

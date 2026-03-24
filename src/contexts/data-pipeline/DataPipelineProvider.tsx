import React, { useEffect, useRef, useState, type ReactNode } from "react";

import { DataPipelineService } from "@/services/DataPipelineService/DataPipelineService";
import { useScheduler } from "../schuduler";

import type { Progress } from "@/services/types";
import {
  DataPipelineContext,
  type DataPipelineContextValue,
} from "./DataPipelineContext";
import { StorageService } from "@/services/StorageService/StorageService";

type DataPipelineProviderProps = {
  children: ReactNode;
};

export const DataPipelineProvider: React.FC<DataPipelineProviderProps> = ({
  children,
}) => {
  const scheduler = useScheduler();
  const pipelineRef = useRef<DataPipelineService>(null);
  const [value, setValue] = useState<DataPipelineContextValue>();
  const [progress, setProgress] = useState<Progress>({
    stage: "idle",
    stageProgress: 0,
    overallProgress: 0,
    processedCount: 0,
    totalCount: 0,
    errors: [],
    warnings: [],
  });

  // Startup cleanup: clear IndexedDB if persistence is disabled
  useEffect(() => {
    const cleanup = async () => {
      const storage = StorageService.getInstance();
      await storage.init();
      await storage.clearAll();
    };
    cleanup();
  }, []);

  useEffect(() => {
    const pipeline = DataPipelineService.getInstance(scheduler);
    pipelineRef.current = pipeline;

    // Subscribe to progress updates
    const unsubscribe = pipeline.onProgress(setProgress);

    setValue({
      pipeline: pipelineRef.current!,
      progress: {
        stage: "idle",
        stageProgress: 0,
        overallProgress: 0,
        processedCount: 0,
        totalCount: 0,
        errors: [],
        warnings: [],
      },
      isProcessing: false,
    });

    return () => {
      unsubscribe();
    };
  }, [scheduler]);

  useEffect(() => {
    if (!pipelineRef.current) return;
    const isProcessing =
      progress.stage !== "idle" &&
      progress.stage !== "complete" &&
      progress.stage !== "error" &&
      progress.stage !== "cancelled";
    setValue((value) => ({
      pipeline: value!.pipeline,
      progress,
      isProcessing,
    }));
  }, [progress]);

  if (!value) {
    return null;
  }

  return (
    <DataPipelineContext.Provider value={value}>
      {children}
    </DataPipelineContext.Provider>
  );
};

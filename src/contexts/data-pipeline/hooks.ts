import { DataPipelineService } from "@/services/DataPipelineService";
import { useContext } from "react";
import { DataPipelineContext } from "./DataPipelineContext";
import type { Progress } from "@/services/types";

/**
 * Get the DataPipelineService instance
 */
export const useDataPipeline = (): DataPipelineService => {
  const context = useContext(DataPipelineContext);
  if (!context) {
    throw new Error("useDataPipeline must be used within DataPipelineProvider");
  }
  return context.pipeline;
};

/**
 * Get current pipeline progress
 */
export const usePipelineProgress = (): Progress => {
  const context = useContext(DataPipelineContext);
  if (!context) {
    throw new Error(
      "usePipelineProgress must be used within DataPipelineProvider",
    );
  }
  return context.progress;
};

/**
 * Check if pipeline is currently processing
 */
export const useIsPipelineProcessing = (): boolean => {
  const context = useContext(DataPipelineContext);
  if (!context) {
    throw new Error(
      "useIsPipelineProcessing must be used within DataPipelineProvider",
    );
  }
  return context.isProcessing;
};

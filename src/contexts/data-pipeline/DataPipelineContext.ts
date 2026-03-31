import { DataPipelineService } from "@/services/DataPipelineService";
import type { Progress } from "@/services/types";
import { createContext } from "react";

export type DataPipelineContextValue = {
  pipeline: DataPipelineService;
  progress: Progress;
  isProcessing: boolean;
};

export const DataPipelineContext =
  createContext<DataPipelineContextValue | null>(null);

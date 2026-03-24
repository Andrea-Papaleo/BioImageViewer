export type TaskError = {
  source: string;
  error: Error;
  recoverable: boolean;
};

export type Progress = {
  stage: string;
  stageProgress: number; // 0-100 for current stage
  overallProgress: number; // 0-100 for entire pipeline
  currentTask?: string;
  processedCount: number;
  totalCount: number;
  errors: Error[];
  warnings: string[];
};

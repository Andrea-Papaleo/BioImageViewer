import {
  useIsPipelineProcessing,
  usePipelineProgress,
} from "@/contexts/data-pipeline";

/**
 * Shows a progress bar when the data pipeline is actively processing.
 * Place this in the app layout — it auto-hides when idle.
 */
export const ProgressIndicator: React.FC = () => {
  const isProcessing = useIsPipelineProcessing();
  const progress = usePipelineProgress();

  if (!isProcessing) return null;

  const stageLabels: Record<string, string> = {
    loading: "Loading files",
    analyzing: "Analyzing files",
    preparing: "Preparing images",
    deserializing: "Deserializing project",
    serializing: "Serializing project",
    storing: "Saving to storage",
  };

  const label = stageLabels[progress.stage] ?? progress.stage;

  return (
    <div className="absolute bottom-2 left-1/2 z-9999 w-1/2 -translate-x-1/2 rounded bg-blue-600 px-2 py-1 text-white">
      <div className="flex justify-between">
        <span className="text-sm">
          {label}
          {progress.currentTask ? ` — ${progress.currentTask} ` : ""}
        </span>
        <span className="text-sm">
          {progress.processedCount}/{progress.totalCount}
        </span>
      </div>
      {/* Stage progress */}
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/30">
        <div
          className="h-full rounded-full bg-white transition-all"
          style={{ width: `${progress.stageProgress}%` }}
        />
      </div>
      {/* Overall progress */}
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/30">
        <div
          className="h-full rounded-full bg-white transition-all"
          style={{ width: `${progress.overallProgress}%` }}
        />
      </div>
    </div>
  );
};

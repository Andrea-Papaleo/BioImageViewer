import { useCallback, useState } from "react";
import { useDispatch } from "react-redux";

import { useDataPipeline } from "@/contexts/data-pipeline";

import { appSlice } from "@/state/appSlice";
import type { Experiment, ImageSeries } from "@/state/types";

import type {
  PipelineResult,
  UploadOptionswithCallbacks,
} from "@/services/DataPipelineService/types";

type UseUploadPipelineReturn = {
  upload: (
    files: FileList,
    options?: UploadOptionswithCallbacks,
  ) => Promise<PipelineResult>;
  isUploading: boolean;
};

/**
 * Hook that orchestrates the upload pipeline
 *
 * Calls DataPipelineService for worker-based processing,
 * then dispatches the results to Redux
 */
export function useUploadPipeline(): UseUploadPipelineReturn {
  const dispatch = useDispatch();
  const pipeline = useDataPipeline();
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<string>();

  const upload = useCallback(
    async (
      files: FileList,
      options?: UploadOptionswithCallbacks,
    ): Promise<PipelineResult> => {
      setIsUploading(true);

      try {
        // 1. Run the pipeline (workers + IndexDB)
        const result = await pipeline.uploadFiles(files, options);

        if (!result.success || result.images.length === 0) {
          if (result.errors.length > 0) {
            setErrors(
              `File Upload Error: ${result.errors
                .map((e) => `${e.source} -- ${e.error.message}`)
                .join("\n---\n")}`,
            );
          }
          return result;
        }

        const { imageSeries, images, planes, channels } = result.images[0];

        const experiment: Experiment = {
          id: crypto.randomUUID(),
          imageSeriesIds: [],
        };

        const reduxImageSeries: ImageSeries[] = [];
        imageSeries.forEach((series) => {
          experiment.imageSeriesIds.push(series.id);
          reduxImageSeries.push({ ...series, experimentId: experiment.id });
        });

        dispatch(
          appSlice.actions.setState({
            experiments: [experiment],
            imageSeries: reduxImageSeries,
            images,
            planes,
            channels,
          }),
        );

        // 4. Report errors if any
        if (result.errors.length > 0) {
          setErrors(`Some files failed: ${result.warnings.join("\n")}`);
        }

        return result;
      } finally {
        setIsUploading(false);
      }
    },
    [dispatch, pipeline],
  );

  return { upload, isUploading };
}

import { TiffReader } from "./TiffReader";
import { Stack as IJSStack } from "image-js";
import type { ImportImageInput, LoadAndPrepareOutput } from "./types";
import type { CancelToken } from "@/services/WorkerScheduler/types";

import {
  experimentFromStack,
  extractImageDimensionsFromStack,
} from "./imageHelpers";
import { DicomReader } from "./DicomReader/DicomReader";
import { BasicReader } from "./BasicReader/BasicReader";
import {
  MIME,
  type DimensionConfig,
} from "@/services/DataPipelineService/types";
import type { Shape } from "@/types";

export async function loadImage(
  input: ImportImageInput,
  cancelToken: CancelToken,
  onProgress: (value: number) => void,
): Promise<LoadAndPrepareOutput> {
  let stack: IJSStack;
  let shape: Shape;
  let dimConfig: DimensionConfig;
  switch (input.mimeType) {
    case MIME.PNG:
    case MIME.JPEG: {
      const fileResult = await BasicReader.extract(
        input.fileData,
        input.mimeType,
      );
      stack = fileResult.stack;
      shape = fileResult.shape;
      dimConfig = {
        dimensionOrder: "xytzc",
        channels: shape.channels,
        slices: shape.planes,
        frames: 1,
      };
      break;
    }
    case MIME.DICOM: {
      const fileResult = await DicomReader.extract(input.fileData);
      stack = fileResult.stack;
      shape = fileResult.shape;
      dimConfig = {
        dimensionOrder: "xytzc",
        channels: shape.channels,
        slices: shape.planes,
        frames: 1,
      };
      break;
    }
    case MIME.TIFF: {
      const fileResult = await TiffReader.extract(
        input.fileData,
        input.dimSpec!.channels,
        input.dimSpec!.slices,
      );
      stack = fileResult.stack;
      shape = fileResult.shape;
      dimConfig = input.dimSpec!;
      break;
    }
    default:
      throw new Error(`Unsupported mimetype: ${input.mimeType}`);
  }
  onProgress(30);

  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }
  const imageSeriesMap = extractImageDimensionsFromStack(stack, dimConfig);
  onProgress(50);
  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }
  const { imageSeries, images, planes, channels, channelMetas } =
    experimentFromStack(imageSeriesMap, {
      fileName: input.fileName,
      shape,
      bitDepth: stack.bitDepth,
    });
  onProgress(100);
  return { imageSeries, images, planes, channels, channelMetas };
}

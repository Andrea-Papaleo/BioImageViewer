import { TiffReader } from "./TiffReader";

import type {
  LoadAndPrepareBasicInput,
  LoadAndPrepareDicomInput,
  LoadAndPrepareInput,
  LoadAndPrepareOutput,
} from "./types";
import type { CancelToken } from "@/services/WorkerScheduler/types";
import type { AnalyzeTiffInput, AnalyzeTiffOutput } from "./TiffReader/types";

import {
  experimentFromStack,
  extractImageDimensionsFromStack,
} from "./imageHelpers";
import { DicomReader } from "./DicomReader/DicomReader";
import { BasicReader } from "./BasicReader/BasicReader";

export async function loadAndPrepareDicom(
  input: LoadAndPrepareDicomInput,
  cancelToken: CancelToken,
  onProgress: (value: number) => void,
): Promise<LoadAndPrepareOutput> {
  onProgress(0);

  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }
  const { stack, shape } = await DicomReader.extract(input.fileData);
  onProgress(30);

  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }
  const imageSeriesMap = extractImageDimensionsFromStack(stack, {
    dimensionOrder: "xytzc",
    channels: shape.channels,
    slices: shape.planes,
    frames: 1,
  });
  onProgress(50);

  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }
  const { imageSeries, images, planes, channels, channelMetas } =
    experimentFromStack(imageSeriesMap, {
      fileName: File.name,
      shape,
      bitDepth: stack.bitDepth,
    });
  onProgress(100);
  return { imageSeries, images, planes, channels, channelMetas };
}

export async function loadAndPrepareBasic(
  input: LoadAndPrepareBasicInput,
  cancelToken: CancelToken,
  onProgress: (value: number) => void,
): Promise<LoadAndPrepareOutput> {
  onProgress(0);

  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }
  const { stack, shape } = await BasicReader.extract(
    input.fileData,
    input.mimeType,
  );
  onProgress(30);

  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }
  const imageSeriesMap = extractImageDimensionsFromStack(stack, {
    dimensionOrder: "xytzc",
    channels: shape.channels,
    slices: shape.planes,
    frames: 1,
  });
  onProgress(50);

  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }
  const { imageSeries, images, planes, channels, channelMetas } =
    experimentFromStack(imageSeriesMap, {
      fileName: File.name,
      shape,
      bitDepth: stack.bitDepth,
    });
  onProgress(100);
  return {
    imageSeries,
    images,
    planes,
    channelMetas,
    channels,
  };
}

export async function loadAndPrepare(
  input: LoadAndPrepareInput,
  cancelToken: CancelToken,
  onProgress: (value: number) => void,
): Promise<LoadAndPrepareOutput> {
  onProgress(0);

  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }

  const { stack, shape } = await TiffReader.extract(
    input.fileData,
    input.dimSpec.channels,
    input.dimSpec.slices,
  );
  onProgress(30);

  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }

  const imageSeriesMap = extractImageDimensionsFromStack(stack, input.dimSpec);
  onProgress(50);

  const { imageSeries, images, planes, channels, channelMetas } =
    experimentFromStack(imageSeriesMap, {
      fileName: File.name,
      shape,
      bitDepth: stack.bitDepth,
    });

  onProgress(100);

  return { imageSeries, images, planes, channels, channelMetas };
}

export async function analyzeTiff(
  payload: AnalyzeTiffInput,
  cancelToken: CancelToken,
  _onProgress: (value: number) => void,
): Promise<AnalyzeTiffOutput> {
  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }
  const analyzer = new TiffReader();
  //analyzer.analyze(payload.fileData);
  return await analyzer.analyze(payload.fileData);
}

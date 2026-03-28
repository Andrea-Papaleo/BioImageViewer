import { TiffReader } from "./TiffReader";

import type {
  ChannelResult,
  ImageResult,
  ImageSeriesResult,
  LoadAndPrepareInput,
  LoadAndPrepareOutput,
} from "./types";
import { DEFAULT_COLORS } from "@/utils";
import type { CancelToken } from "@/services/WorkerScheduler/types";
import type { AnalyzeTiffInput, AnalyzeTiffOutput } from "./TiffReader/types";

import type { ChannelMeta, Plane } from "@/state/types";
import {
  extractImageDimensionsFromStack,
  loadImageFromBuffer,
} from "./imageHelpers";
import { findBestFitBins } from "./histogram/stolen";

export async function loadAndPrepare(
  input: LoadAndPrepareInput,
  cancelToken: CancelToken,
  onProgress: (value: number) => void,
): Promise<LoadAndPrepareOutput> {
  onProgress(0);

  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }

  const { stack } = await loadImageFromBuffer(input.fileData);
  onProgress(30);

  if (cancelToken.cancelled) {
    throw new DOMException("Task cancelled", "AbortError");
  }

  onProgress(50);

  const imageSeriesMap = extractImageDimensionsFromStack(stack, input.dimSpec);

  const imageSeries: ImageSeriesResult[] = [];
  const images: ImageResult[] = [];
  const planes: Plane[] = [];
  const channels: ChannelResult[] = [];
  const channelMetas: ChannelMeta[] = [];

  const shape = {
    planes: input.dimSpec.slices,
    channels: input.dimSpec.channels,
    width: stack.getImage(0).width,
    height: stack.getImage(0).height,
  };
  const bitDepth = stack.bitDepth;
  const name = input.fileName.split(".")[0];
  const series: ImageSeriesResult = {
    id: crypto.randomUUID(),
    name: `${name}-series`,
    bitDepth,
    shape,
    timeSeries: false,
    imageIds: [],
    channels: [],
  };
  const channelMeta: ChannelMeta[] = Array.from(
    { length: input.dimSpec.channels },
    (_v, idx) => ({
      id: crypto.randomUUID(),
      name: `Channel-${idx}`,
      bitDepth,
      seriesId: series.id,
      colorMap: DEFAULT_COLORS[idx % 6],
      minValue: 2 ** bitDepth - 1,
      maxValue: 0,
      rampMinLimit: 2 ** bitDepth - 1,
      rampMaxLimit: 0,
      rampMin: 2 ** bitDepth - 1,
      rampMax: 0,
      visible: true,
    }),
  );
  series.channels = channelMeta.map((chM) => chM.id);
  channelMetas.push(...channelMeta);
  const initImagePlane = Math.floor(input.dimSpec.slices / 2);

  imageSeriesMap.forEach((imageMap, imageIDX) => {
    const image: ImageResult = {
      id: crypto.randomUUID(),
      name: `${name}-${imageIDX}`,
      seriesId: series.id,
      shape,
      categoryId: "cat",
      activePlane: initImagePlane,
      planeIds: [],
      timepoint: series.timeSeries ? imageIDX : 0,
      bitDepth,
    };

    series.imageIds.push(image.id);
    imageMap.forEach((planeMap, planeIDX) => {
      const plane: Plane = {
        id: crypto.randomUUID(),
        imageId: image.id,
        zIndex: planeIDX,
        channelIds: [],
      };
      image.planeIds.push(plane.id);
      planeMap.forEach((channel, channelIDX) => {
        const histogram = channel.histogram().buffer as ArrayBuffer;
        const [histMin, histMax] = findBestFitBins(
          histogram,
          channel.width * channel.height,
        );
        const { min: mins, max: maxes } = channel.minMax();
        const minValue = mins[0];
        const maxValue = maxes[0];
        const min = histMin;
        const max = histMax;
        const meta = channelMeta[channelIDX];
        if (minValue < meta.minValue) {
          meta.minValue = minValue;
          meta.rampMinLimit = minValue;
        }
        if (maxValue > meta.maxValue) {
          meta.maxValue = maxValue;
          meta.rampMaxLimit = maxValue;
        }
        if (planeIDX === initImagePlane) {
          meta.rampMin = min;
          meta.rampMax = max;
        }

        const data = channel.getRawImage().data.buffer as ArrayBuffer;
        const channelResult: ChannelResult = {
          id: crypto.randomUUID(),
          name: `Channel-${channelIDX}`,
          channelMetaId: meta.id,
          dtype: "float32",
          planeId: plane.id,
          histogram,
          data,
          width: channel.width,
          height: channel.height,
          bitDepth,
        };
        plane.channelIds.push(channelResult.id);
        channels.push(channelResult);
      });
      planes.push(plane);
    });
    images.push(image);
  });
  imageSeries.push(series);

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

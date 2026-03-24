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

import type { Plane } from "@/state/types";
import {
  extractImageDimensionsFromStack,
  loadImageFromBuffer,
} from "./imageHelpers";

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

  const shape = {
    planes: input.dimSpec.slices,
    channels: input.dimSpec.channels,
    width: stack.getImage(0).width,
    height: stack.getImage(0).height,
  };
  const bitDepth = stack.bitDepth;
  const series: ImageSeriesResult = {
    id: crypto.randomUUID(),
    name: `series-${0}`,
    bitDepth,
    shape,
    timeSeries: false,
    imageIds: [],
  };

  imageSeriesMap.forEach((imageMap, imageIDX) => {
    const image: ImageResult = {
      id: crypto.randomUUID(),
      name: `image-${imageIDX}`,
      seriesId: series.id,
      shape,
      categoryId: "cat",
      activePlane: input.dimSpec.slices / 2,
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
        const data = new Uint8Array(channel.getRawImage().data)
          .buffer as ArrayBuffer;
        const channelResult: ChannelResult = {
          id: crypto.randomUUID(),
          name: `channel-${channelIDX}`,
          dtype: "float32",
          color: {
            map: DEFAULT_COLORS[channelIDX % 6],
            min: 0,
            max: 1,
          },
          planeId: plane.id,
          visible: true,
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

  const results: Array<LoadAndPrepareOutput["old"][number]> = [];

  onProgress(100);

  return { old: results, imageSeries, images, planes, channels };
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
  return await analyzer.analyzeGeoTiff(payload.fileData);
}

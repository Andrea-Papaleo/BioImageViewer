import { decodeStack, Stack as IJSStack, Image as IJSImage } from "image-js";
import {
  type ChannelResult,
  type ImageResult,
  type ImageSeriesResult,
} from "./types";
import type { DimensionConfig } from "@/services/DataPipelineService/types";
import { DEFAULT_COLORS } from "@/utils";
import { findBinOfPercentiles } from "./histogram/stolen";
import type { ChannelMeta, Plane } from "@/state/types";
import type { BitDepth } from "@/types";

// ============================================================
// Image Loading
// ============================================================
const forceStack = (image: IJSImage | IJSStack): IJSStack => {
  if (image instanceof IJSStack) {
    return image;
  }
  const splitImage = image.split();
  if (image.alpha) {
    return new IJSStack(splitImage.slice(0, splitImage.length - 1));
  }
  return new IJSStack(splitImage);
};

/**
 * Load image from ArrayBuffer
 * Returns an image-js Stack (even for single images)
 */
export async function loadImageFromBuffer(
  buffer: ArrayBuffer,
): Promise<IJSStack> {
  const dataArray = new Uint8Array(buffer);

  const image = decodeStack(dataArray);

  return forceStack(image);
}

export const extractImageDimensionsFromStack = (
  imageStack: IJSStack,
  dimensonSpec: DimensionConfig,
): Map<number, Map<number, Map<number, IJSImage>>> => {
  const { dimensionOrder, channels, slices, frames } = dimensonSpec;

  const imageMap: Map<number, Map<number, Map<number, IJSImage>>> = new Map();

  const addToStructure = (t: number, z: number, c: number, data: IJSImage) => {
    if (imageMap.has(t)) {
      const planes = imageMap.get(t)!;
      if (planes.has(z)) {
        const channels = planes.get(z)!;
        if (channels.has(c)) {
          throw new Error("duplicate Channel");
        }
        channels.set(c, data);
      } else {
        planes.set(z, new Map([[c, data]]));
      }
    } else {
      imageMap.set(t, new Map([[z, new Map([[c, data]])]]));
    }
  };
  switch (dimensionOrder) {
    case "xyctz":
      for (let c = 0; c < channels; c++) {
        const cOffset = c * frames * slices;
        for (let t = 0; t < frames; t++) {
          const tOffset = t * slices;
          for (let z = 0; z < slices; z++) {
            // create empty array of expected size
            const index = tOffset + cOffset + z;
            const image = imageStack.getImage(index);
            addToStructure(t, z, c, image);
          }
        }
      }
      break;
    case "xyczt":
      for (let c = 0; c < channels; c++) {
        const cOffset = c * frames * slices;
        for (let z = 0; z < slices; z++) {
          const zOffset = z * frames;
          for (let t = 0; t < frames; t++) {
            // create empty array of expected size
            const index = t + cOffset + zOffset;
            const image = imageStack.getImage(index);
            addToStructure(t, z, c, image);
          }
        }
      }
      break;
    case "xytcz":
      for (let t = 0; t < frames; t++) {
        const tOffset = t * slices * channels;
        for (let c = 0; c < channels; c++) {
          const cOffset = c * slices;
          for (let z = 0; z < slices; z++) {
            // create empty array of expected size
            const index = tOffset + cOffset + z;
            const image = imageStack.getImage(index);
            addToStructure(t, z, c, image);
          }
        }
      }
      break;
    case "xytzc":
      for (let t = 0; t < frames; t++) {
        const tOffset = t * slices * channels;
        for (let z = 0; z < slices; z++) {
          const zOffset = z * channels;
          for (let c = 0; c < channels; c++) {
            // create empty array of expected size
            const index = tOffset + zOffset + c;
            const image = imageStack.getImage(index);
            addToStructure(t, z, c, image);
          }
        }
      }
      break;
    case "xyzct":
      for (let z = 0; z < slices; z++) {
        const zOffset = z * frames * channels;
        for (let c = 0; c < channels; c++) {
          const cOffset = c * frames;
          for (let t = 0; t < frames; t++) {
            // create empty array of expected size
            const index = t + zOffset + cOffset;
            const image = imageStack.getImage(index);
            addToStructure(t, z, c, image);
          }
        }
      }
      break;
    case "xyztc":
      for (let z = 0; z < slices; z++) {
        const zOffset = z * frames * channels;
        for (let t = 0; t < frames; t++) {
          const tOffset = t * channels;
          for (let c = 0; c < channels; c++) {
            // create empty array of expected size
            const index = tOffset + zOffset + c;
            const image = imageStack.getImage(index);
            addToStructure(t, z, c, image);
          }
        }
      }
      break;
  }

  return imageMap;
};

const processChannel = (channel: IJSImage) => {
  const histogram = channel.histogram().buffer as ArrayBuffer;
  const pixels = channel.getRawImage().data;
  const pixelsBuffer = pixels.buffer as ArrayBuffer;
  const numPixels = channel.width * channel.height;
  const [rampMin, rampMax] = findBinOfPercentiles(
    histogram,
    numPixels,
    0.5,
    0.98,
  );
  const [lowerQuartile, upperQuartile] = findBinOfPercentiles(
    histogram,
    numPixels,
    0.25,
    0.75,
  );
  const { min: mins, max: maxes } = channel.minMax();
  const median = channel.median()[0];
  const mean = channel.mean()[0];
  console.log("median: ", median, " -- mean: ", mean);
  const minValue = mins[0];
  const maxValue = maxes[0];
  let sumSquaredDiff = 0;
  let total = 0;
  let _mad = 0;
  for (let i = 0; i < numPixels; i++) {
    total += pixels[i];
    _mad += Math.abs(pixels[i] - median);
    const diff = pixels[i] - mean;
    sumSquaredDiff += diff * diff;
  }
  const mad = _mad / numPixels;
  const std = Math.sqrt(sumSquaredDiff / numPixels);
  return {
    data: pixelsBuffer,
    histogram,
    rampMin,
    rampMax,
    minValue,
    maxValue,
    std,
    mad,
    total,
    upperQuartile,
    lowerQuartile,
  };
};

export const experimentFromStack = (
  imageSeriesMap: Map<number, Map<number, Map<number, IJSImage>>>,
  config: {
    fileName: string;
    shape: {
      width: number;
      height: number;
      channels: number;
      planes: number;
    };

    bitDepth: BitDepth;
  },
) => {
  const imageSeries: ImageSeriesResult[] = [];
  const images: ImageResult[] = [];
  const planes: Plane[] = [];
  const channels: ChannelResult[] = [];
  const channelMetas: ChannelMeta[] = [];

  const bitDepth = config.bitDepth;
  const name = config.fileName.split(".")[0];
  const series: ImageSeriesResult = {
    id: crypto.randomUUID(),
    name: `${name}-series`,
    bitDepth: config.bitDepth,
    shape: config.shape,
    timeSeries: false,
    imageIds: [],
    channels: [],
  };
  const channelMeta: ChannelMeta[] = Array.from(
    { length: config.shape.channels },
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
  const initImagePlane = Math.floor(config.shape.planes / 2);

  imageSeriesMap.forEach((imageMap, imageIDX) => {
    const image: ImageResult = {
      id: crypto.randomUUID(),
      name: `${name}-${imageIDX}`,
      seriesId: series.id,
      shape: config.shape,
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
        const { data, histogram, minValue, rampMin, maxValue, rampMax } =
          processChannel(channel);
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
          meta.rampMin = rampMin;
          meta.rampMax = rampMax;
        }

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
          maxValue,
          minValue,
        };
        plane.channelIds.push(channelResult.id);
        channels.push(channelResult);
      });
      planes.push(plane);
    });
    images.push(image);
  });
  imageSeries.push(series);

  return { imageSeries, images, planes, channels, channelMetas };
};

import type { TiffImportConfig } from "@/services/DataPipelineService/types";
import type {
  Channel,
  ChannelMeta,
  ImageObject,
  ImageSeries,
  Plane,
} from "@/state/types";
import type { BitDepth } from "@/types";

export enum ImageShapeEnum {
  DicomImage,
  GreyScale,
  SingleRGBImage,
  HyperStackImage,
  InvalidImage,
}
export interface ImageShapeInfo {
  shape: ImageShapeEnum;
  bitDepth?: BitDepth;
  components?: number;
  alpha?: boolean;
}

/**
 * Input for combined load + prepare operation
 */
export type LoadAndPrepareBasicInput = {
  fileData: ArrayBuffer;
  fileName: string;
  mimeType: string;
};
/**
 * Input for combined load + prepare operation
 */
export type LoadAndPrepareInput = {
  fileData: ArrayBuffer;
  dimSpec: TiffImportConfig;
  fileName: string;
};
/**
 * Output from load + prepare (ready for storage)
 */

export type ImageSeriesResult = Omit<ImageSeries, "experimentId">;
export type ImageResult = ImageObject;
export type ChannelResult = Omit<Channel, "storageReference"> & {
  data: ArrayBuffer;
  histogram: ArrayBuffer;
};
export type LoadAndPrepareOutput = {
  imageSeries: ImageSeriesResult[];
  images: ImageResult[];
  planes: Plane[];
  channels: ChannelResult[];
  channelMetas: ChannelMeta[];
};

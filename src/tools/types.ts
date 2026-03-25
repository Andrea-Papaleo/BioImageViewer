import type { TiffImportConfig } from "@/services/DataPipelineService/types";
import type { Channel, ImageObject, ImageSeries, Plane } from "@/state/types";
import type { BitDepth, ColorsRaw, ShapeArray } from "@/types";

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
export type LoadAndPrepareInput = {
  fileData: ArrayBuffer;
  dimSpec: TiffImportConfig;
  fileName: string;
  mimeType: string;
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
  old: Array<{
    id: string;

    // For IndexedDB storage
    buffer: ArrayBuffer;
    dtype: "float32" | "int32" | "uint8";
    shape: ShapeArray;
    preparedChannels: {
      data: number[][];
      histograms?: number[][];
    };
    renderedSrc: string;

    // For Redux metadata
    bitDepth: BitDepth;
    colors: ColorsRaw;
  }>;
  imageSeries: ImageSeriesResult[];
  images: ImageResult[];
  planes: Plane[];
  channels: ChannelResult[];
};

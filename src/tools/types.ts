import { MIME } from "@/services/DataPipelineService/types";
import type {
  MimeType,
  TiffImportConfig,
} from "@/services/DataPipelineService/types";
import type {
  Channel,
  ChannelMeta,
  ImageObject,
  ImageSeries,
  Plane,
} from "@/state/types";

/**
 * Input for combined load + prepare operation
 */
export type ImportImageInput =
  | {
      fileData: ArrayBuffer;
      fileName: string;
      mimeType: MimeType;
      dimSpec: undefined;
    }
  | {
      fileData: ArrayBuffer;
      fileName: string;
      mimeType: typeof MIME.TIFF;
      dimSpec: TiffImportConfig;
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

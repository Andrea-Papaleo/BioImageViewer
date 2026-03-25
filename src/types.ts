import type { Tensor2D } from "@tensorflow/tfjs";
import type { BitDepth as IJSBitDepth } from "image-js";
export const DB_NAME = "tiff-explorer-data";
export const DB_VERSION = 2;

export const STORES = {
  EXPERIMENT_DATA: "experiment-date",
  SERIES_DATA: "series-data",
  IMAGE_DATA: "image-data",
  PLANE_DATA: "plane-data",
  CHANNEL_DATA: "channel-data",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

export type BitDepth = IJSBitDepth;
export type DataArray = Uint8Array | Uint16Array | Float32Array;
export type Shape = {
  planes: number;
  height: number;
  width: number;
  channels: number;
};
export type ShapeArray = [number, number, number, number];

type ColorsMeta = {
  range: { [channel: number]: [number, number] };
  visible: { [channel: number]: boolean };
};

export type ColorsRaw = {
  color: [number, number, number][];
} & ColorsMeta;

export type Colors = {
  color: Tensor2D; // shape: C x 3; [channel_idx, rgb]
} & ColorsMeta;
export type StorageReference = {
  storageId: string;
  storeName: StoreName;
  width: number;
  height: number;
  dtype: "float32" | "int32" | "uint8";
  byteSize: number;
};

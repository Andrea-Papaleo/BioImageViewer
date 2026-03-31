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
/**
 * Reference stored in Redux instead of actual tensor
 */
export type StorageReference = {
  storageId: string;
  storeName: StoreName;
  width: number;
  height: number;
  dtype: DType;
  byteSize: number;
};

export const DTYPES = {
  UINT8: "uint8",
  INT32: "int32",
  FLOAT32: "float32",
} as const;

export type DType = (typeof DTYPES)[keyof typeof DTYPES];

export type BitDepth = IJSBitDepth;
export type Shape = {
  planes: number;
  height: number;
  width: number;
  channels: number;
};
export type ShapeArray = [number, number, number, number];

import type { EntityState } from "@reduxjs/toolkit";
import type { BitDepth, Shape, StorageReference } from "../types";

export type ImageMetadata = {
  id: string;
  name: string;
  kind: string;
  bitDepth: BitDepth;
  shape: Shape;
  timeSeries: boolean;
  imageDataIds: string[];
  defaultImageId: string;
};
export type ChannelData = {
  channelId: string;
  channelData?: number[];
  histogram?: number[]; // 256 bins for 8-bit, etc.
};
export type ImageMeasurements = { channels: Record<string, ChannelData> };

export type Experiment = { id: string; imageSeriesIds: string[] };
export type ImageSeries = {
  id: string;
  experimentId: string;
  name: string;
  bitDepth: BitDepth;
  shape: Shape;
  imageIds: string[];
  timeSeries: boolean;
};
export type ImageObject = {
  id: string;
  name: string;
  seriesId: string;
  shape: Shape;
  categoryId: string;
  activePlane: number;
  timepoint: number;
  planeIds: string[];
  bitDepth: BitDepth;
};

export type Plane = {
  id: string;
  imageId: string;
  zIndex: number;
  channelIds: string[];
};
export type ChannelMeasurements = {
  total?: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;
  mad?: number;
  lowerQuartile?: number;
  upperQuartile?: number;
};
export type ChannelColor = {
  map: [number, number, number];
  min: number;
  max: number;
};
export type Channel = {
  id: string;
  planeId: string;
  name: string;
  dtype: "float32" | "int32" | "uint8";
  color: ChannelColor;
  visible: boolean;
  storageReference: StorageReference;
  bitDepth: BitDepth;
  width: number;
  height: number;
};

export type AppState = {
  experiments: EntityState<Experiment, string>;
  imageSeries: EntityState<ImageSeries, string>;
  images: EntityState<ImageObject, string>;
  planes: EntityState<Plane, string>;
  channels: EntityState<Channel, string>;
  activeImageId: string | undefined;
  activePlaneId: string | undefined;
  activeChannelIds: string[];
};

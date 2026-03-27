import type { EntityState } from "@reduxjs/toolkit";
import type { BitDepth, DType, Shape, StorageReference } from "../types";

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

export type Experiment = { id: string; imageSeriesIds: string[] };
export type ImageSeries = {
  id: string;
  experimentId: string;
  name: string;
  bitDepth: BitDepth;
  shape: Shape;
  imageIds: string[];
  timeSeries: boolean;
  channels: string[];
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

export type ColorMap = [number, number, number];
export type ChannelColor = {
  map: [number, number, number];
  min: number;
  max: number;
};
export type Channel = {
  id: string;
  planeId: string;
  channelMetaId: string;
  name: string;
  dtype: DType;
  storageReference: StorageReference;
  bitDepth: BitDepth;
  width: number;
  height: number;
};

export type ValueLimit = { limit: number; override?: number };
export type ChannelMeta = {
  id: string;
  name: string;
  seriesId: string;
  bitDepth: BitDepth;
  colorMap: ColorMap;
  visible: boolean;
  minValue: number;
  maxValue: number;
  rampMin: number;
  rampMax: number;
  rampMinLimit: number;
  rampMaxLimit: number;
};

export type AppState = {
  experiments: EntityState<Experiment, string>;
  imageSeries: EntityState<ImageSeries, string>;
  images: EntityState<ImageObject, string>;
  planes: EntityState<Plane, string>;
  channels: EntityState<Channel, string>;
  channelMetas: EntityState<ChannelMeta, string>;
  activeImageId: string | undefined;
  activePlaneId: string | undefined;
  activeChannelIds: string[];
};

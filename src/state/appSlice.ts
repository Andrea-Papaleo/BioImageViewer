import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type {
  AppState,
  Channel,
  Experiment,
  ImageMetadata,
  ImageObject,
  ImageSeries,
  Plane,
} from "./types";

export const experimentAdapter = createEntityAdapter<Experiment>();
export const imageSeriesAdapter = createEntityAdapter<ImageSeries>();
export const metadataAdapter = createEntityAdapter<ImageMetadata>();
export const imageAdapter = createEntityAdapter<ImageObject>();
export const planeAdapter = createEntityAdapter<Plane>();
export const channelAdapter = createEntityAdapter<Channel>();

const initialState: AppState = {
  images: imageAdapter.getInitialState(),
  experiments: experimentAdapter.getInitialState(),
  imageSeries: imageSeriesAdapter.getInitialState(),
  planes: planeAdapter.getInitialState(),
  channels: channelAdapter.getInitialState(),
  activeImageId: undefined,
  activePlaneId: undefined,
  activeChannelIds: [],
};
export const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    clearState() {
      return initialState;
    },
    setState(
      state,
      action: PayloadAction<{
        experiments: Array<Experiment>;
        images: Array<ImageObject>;
        imageSeries: Array<ImageSeries>;
        planes: Array<Plane>;
        channels: Array<Channel>;
      }>,
    ) {
      const { experiments, imageSeries, images, planes, channels } =
        action.payload;

      experimentAdapter.addMany(state.experiments, experiments);
      imageSeriesAdapter.addMany(state.imageSeries, imageSeries);
      imageAdapter.addMany(state.images, images);
      planeAdapter.addMany(state.planes, planes);
      channelAdapter.addMany(state.channels, channels);
      state.activeImageId = images[0].id;
    },
    addExperiment(
      state,
      action: PayloadAction<{
        experimentId: string;
        images: Array<ImageObject>;
        imageSeries: Array<ImageSeries>;
        planes: Array<Plane>;
        channels: Array<Channel>;
      }>,
    ) {
      const { experimentId, imageSeries, images, planes, channels } =
        action.payload;
      const newExperiment: Experiment = {
        id: experimentId,
        imageSeriesIds: imageSeries.map((t) => t.id),
      };
      experimentAdapter.addOne(state.experiments, newExperiment);
      imageSeriesAdapter.addMany(state.imageSeries, imageSeries);
      imageAdapter.addMany(state.images, images);
      planeAdapter.addMany(state.planes, planes);
      channelAdapter.addMany(state.channels, channels);
    },

    addImages(state, action: PayloadAction<Array<ImageObject>>) {
      const imageNames = Object.values(state.images.entities).map(
        (im) => im.name,
      );
      const images = action.payload.map((im) => {
        let imageName = im.name;
        let count = 1;
        while (imageNames.includes(imageName)) {
          imageName = imageName + "(" + count + ")";
          count++;
        }
        im.name = imageName;
        imageNames.push(imageName);
        return im;
      });
      imageAdapter.addMany(state.images, images);
    },
    setActiveImageId(state, action: PayloadAction<string>) {
      state.activeImageId = action.payload;
    },
    setActivePlaneId(state, action: PayloadAction<number>) {
      if (!state.activeImageId) return;
      state.images.entities[state.activeImageId].activePlane = action.payload;
    },
    setActiveChannelIds(state, action: PayloadAction<string[]>) {
      state.activeChannelIds = action.payload;
    },
    setChannelVisibility(
      state,
      action: PayloadAction<{ id: string; visible: boolean }>,
    ) {
      const { id, visible } = action.payload;
      channelAdapter.updateOne(state.channels, { id, changes: { visible } });
    },
    setChannelColorRange(
      state,
      action: PayloadAction<{
        id: string;
        range: { min: number; max: number };
      }>,
    ) {
      const { id, range } = action.payload;
      const channel = state.channels.entities[id];
      const changes = {
        color: { ...channel.color, min: range.min, max: range.max },
      };
      channelAdapter.updateOne(state.channels, {
        id,
        changes,
      });
    },
    setChannelColorMap(
      state,
      action: PayloadAction<{ id: string; map: [number, number, number] }>,
    ) {
      const { id, map } = action.payload;
      const channel = state.channels.entities[id];
      const changes = {
        color: { ...channel.color, map },
      };
      channelAdapter.updateOne(state.channels, {
        id,
        changes,
      });
    },
  },
});

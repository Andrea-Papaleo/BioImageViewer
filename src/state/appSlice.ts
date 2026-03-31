import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import {
  type ChannelMeta,
  type AppState,
  type Channel,
  type Experiment,
  type ImageObject,
  type ImageSeries,
  type Plane,
} from "./types";

const experimentAdapter = createEntityAdapter<Experiment>();
const imageSeriesAdapter = createEntityAdapter<ImageSeries>();
const imageAdapter = createEntityAdapter<ImageObject>();
const planeAdapter = createEntityAdapter<Plane>();
const channelAdapter = createEntityAdapter<Channel>();
const channelMetaAdapter = createEntityAdapter<ChannelMeta>();

const initialState: AppState = {
  images: imageAdapter.getInitialState(),
  experiments: experimentAdapter.getInitialState(),
  imageSeries: imageSeriesAdapter.getInitialState(),
  planes: planeAdapter.getInitialState(),
  channels: channelAdapter.getInitialState(),
  channelMetas: channelMetaAdapter.getInitialState(),
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
        channelMetas: Array<ChannelMeta>;
      }>,
    ) {
      const {
        experiments,
        imageSeries,
        images,
        planes,
        channels,
        channelMetas,
      } = action.payload;

      experimentAdapter.addMany(state.experiments, experiments);
      imageSeriesAdapter.addMany(state.imageSeries, imageSeries);
      imageAdapter.addMany(state.images, images);
      planeAdapter.addMany(state.planes, planes);
      channelAdapter.addMany(state.channels, channels);
      channelMetaAdapter.addMany(state.channelMetas, channelMetas);
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

    updateChannelMeta(
      state,
      action: PayloadAction<{
        id: string;
        changes: Partial<
          Pick<
            ChannelMeta,
            | "visible"
            | "colorMap"
            | "rampMin"
            | "rampMax"
            | "rampMinLimit"
            | "rampMaxLimit"
          >
        >;
      }>,
    ) {
      const { id, changes } = action.payload;
      channelMetaAdapter.updateOne(state.channelMetas, { id, changes });
    },
  },
});

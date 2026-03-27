import { createSelector, weakMapMemoize } from "@reduxjs/toolkit";
import type { RootState } from "./store";

export const selectAppState = ({ app }: RootState) => {
  return app;
};

export const selectImages = ({ app }: RootState) => {
  return app.images.entities;
};
export const selectPlanes = ({ app }: RootState) => {
  return app.planes.entities;
};
export const selectChannels = ({ app }: RootState) => {
  return app.channels.entities;
};
export const selectChannelMetas = ({ app }: RootState) => {
  return app.channelMetas.entities;
};

export const selectExperiment = ({ app }: RootState) => {
  return app.experiments.entities;
};

export const selectActiveImageId = ({ app }: RootState) => {
  return app.activeImageId;
};

export const selectActiveImage = createSelector(
  selectImages,
  selectActiveImageId,
  (images, id) => {
    if (!id) return null;
    return images[id];
  },
);

export const selectImagePlanes = createSelector(
  selectActiveImage,
  selectPlanes,
  (activeImage, planes) => {
    if (!activeImage) return [];
    return activeImage.planeIds.map((id) => planes[id]);
  },
);
export const selectActivePlaneId = createSelector(
  selectImages,
  selectPlanes,
  selectActiveImageId,
  (images, planes, activeImageId) => {
    if (!activeImageId) return;
    const activeImage = images[activeImageId];
    const activePlaneIndex = activeImage.activePlane;
    const imagePlanes = activeImage.planeIds;
    return imagePlanes.find(
      (planeId) => planes[planeId].zIndex === activePlaneIndex,
    );
  },
);
export const selectActivePlaneIdx = createSelector(
  selectImages,
  selectActiveImageId,
  (images, activeImageId) => {
    if (!activeImageId) return;
    return images[activeImageId].activePlane;
  },
);

export const selectActiveBitdepth = createSelector(
  selectActiveImageId,
  selectImages,
  (activeId, images) => {
    if (!activeId) return null;
    return images[activeId].bitDepth;
  },
);

export const selectActiveChannels = createSelector(
  selectActivePlaneId,
  selectPlanes,
  selectChannels,
  (activePlaneId, planes, channels) => {
    if (!activePlaneId) return [];
    const activePlane = planes[activePlaneId];
    return activePlane.channelIds.map((ch) => channels[ch]);
  },
);

export const selectChannelVisibility = createSelector(
  [selectChannels, selectChannelMetas, (_state, id: string) => id],
  (channels, metas, id) => metas[channels[id].channelMetaId].visible,
  { memoize: weakMapMemoize },
);

export const selectMetaByChannel = createSelector(
  [selectChannels, selectChannelMetas, (_state, id: string) => id],
  (channels, metas, id) => metas[channels[id].channelMetaId],
  { memoize: weakMapMemoize },
);

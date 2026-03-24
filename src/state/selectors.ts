import { createSelector } from "@reduxjs/toolkit";
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

export const selectExperiment = ({ app }: RootState) => {
  return app.experiments.entities;
};

export const selectActiveImageId = ({ app }: RootState) => {
  return app.activeImageId;
};

export const selectActivePlaneId = createSelector(
  selectImages,
  selectPlanes,
  selectActiveImageId,
  (images, planes, activeImageId) => {
    if (!activeImageId) return;
    const activePlaneIndex = images[activeImageId].activePlane;
    return Object.values(planes).find(
      (plane) => plane.zIndex === activePlaneIndex,
    )?.id;
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

export const selectActiveChannelIds = ({ app }: RootState) => {
  return app.activeChannelIds;
};

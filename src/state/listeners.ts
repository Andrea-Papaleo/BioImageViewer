import { createListenerMiddleware } from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "./store"; // type-only import — no runtime cycle
import { appSlice } from "./appSlice";

export const appListenerMiddleware = createListenerMiddleware();

const startAppListening = appListenerMiddleware.startListening.withTypes<
  RootState,
  AppDispatch
>();

startAppListening({
  actionCreator: appSlice.actions.addImages,
  effect: (action, listenerAPI) => {
    const images = action.payload;
    const id = images[0].id;
    listenerAPI.dispatch(appSlice.actions.setActiveImageId(id));
  },
});

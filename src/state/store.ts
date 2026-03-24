import { configureStore } from "@reduxjs/toolkit";
import { appSlice } from "./appSlice";
import { appListenerMiddleware } from "./listeners";

export const store = configureStore({
  reducer: { app: appSlice.reducer },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(appListenerMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;

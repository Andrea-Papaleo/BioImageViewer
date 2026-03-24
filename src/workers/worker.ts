// src/workers/scheduler/worker.ts
import { analyzeTiff, loadAndPrepare } from "@/tools/IOUtils";
import type { IWorkerAPI, TaskRegistry } from "./types";
import "./workerPolyfills"; // Must be first — polyfills `window` for zarr/imjoy-rpc

import * as Comlink from "comlink";

const taskRegistry: TaskRegistry = {
  loadAndPrepare: (payload, ct, prog) => loadAndPrepare(payload, ct, prog),
  analyzeTiff: (payload, ct, prog) => analyzeTiff(payload, ct, prog),
};
const workerAPI: IWorkerAPI = {
  async execute(type, payload, cancelToken, onProgress) {
    const handler = taskRegistry[type];
    if (!handler) throw new Error(`Unknown task type: ${type}`);
    return handler(payload, cancelToken, onProgress);
  },
};

Comlink.expose(workerAPI);

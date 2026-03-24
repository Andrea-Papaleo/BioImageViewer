import type { Progress } from "@/services/types";
import type { CancelToken, TaskMap } from "@/services/WorkerScheduler/types";

type TaskHandler<K extends keyof TaskMap> = (
  payload: TaskMap[K]["payload"],
  cancelToken: CancelToken,
  onProgress: (progress: number | Partial<Progress>) => void,
) => Promise<TaskMap[K]["result"]>;

export type TaskRegistry = { [K in keyof TaskMap]: TaskHandler<K> };
/**
 * WorkerAPI
 */

export interface IWorkerAPI {
  execute<T extends keyof TaskMap>(
    type: T,
    payload: TaskMap[T]["payload"],
    cancelToken: CancelToken,
    onProgress: (value: number | Partial<Progress>) => void,
  ): Promise<TaskMap[T]["result"]>;
}

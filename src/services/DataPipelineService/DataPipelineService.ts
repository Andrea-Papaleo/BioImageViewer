import type { ImageSeriesResult, LoadAndPrepareOutput } from "@/tools/types.ts";
import { STORES, type StoreName } from "../../types.ts";
import { parseError } from "../../utils.ts";
import { StorageService } from "../StorageService/StorageService.ts";
import type { ChannelStorageInput } from "../StorageService/types.ts";
import type { Progress, TaskError } from "../types.ts";
import { TaskPriority, type TaskHandle } from "../WorkerScheduler/types.ts";
import { WorkerScheduler } from "../WorkerScheduler/WorkerScheduler.ts";
import type {
  FileAnalysisResult,
  IDataPipelineService,
  PipelineResult,
  PipelineStage,
  TiffImportConfig,
  UploadOptionswithCallbacks,
} from "./types.ts";
import type { Channel, ImageObject, Plane } from "@/state/types.ts";

const INITIAL_PROGRESS: Progress = {
  stage: "idle",
  stageProgress: 0,
  overallProgress: 0,
  processedCount: 0,
  totalCount: 0,
  errors: [],
  warnings: [],
};

/**
 * DataPipelineService
 *
 * Central orchestrator for all data ingestion operations in Piximi.
 * Coordinates between workers (for heavy processing), IndexedDB (for storage),
 * and Redux (for state management).
 *
 * Key principles:
 * - All heavy work happens in workers
 * - Data is fully prepared before entering Redux
 * - Progress is reported at each stage
 * - Operations are cancellable
 *
 * Phase 1 Status: SKELETON
 * - Types and structure defined
 * - Methods stubbed with TODO comments
 * - Ready for Phase 2 implementation
 */
export class DataPipelineService implements IDataPipelineService {
  private static instance: DataPipelineService | null = null;

  private scheduler: WorkerScheduler;
  private storage: StorageService;
  private progress: Progress = { ...INITIAL_PROGRESS };
  private progressListeners: Set<(progress: Progress) => void> = new Set();
  private abortController: AbortController | null = null;

  private constructor(scheduler: WorkerScheduler) {
    this.scheduler = scheduler;
    this.storage = StorageService.getInstance();
  }

  // ============================================================
  // PUBLIC -- START
  // ============================================================
  /**
   * Get singleton instance
   * Requires WorkerScheduler to be passed on first call
   */
  static getInstance(scheduler?: WorkerScheduler): DataPipelineService {
    if (!DataPipelineService.instance) {
      if (!scheduler) {
        throw new Error("WorkerScheduler required for first initialization");
      }
      DataPipelineService.instance = new DataPipelineService(scheduler);
    }
    return DataPipelineService.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    DataPipelineService.instance = null;
  }

  // ============================================================
  // Main Entry Points
  // ============================================================

  /**
   * Upload and process files
   *
   * 1. Analyze files to detect types
   * 2. Handle time series grouping
   * 3. Dispatch to workers for loading + preparation
   * 4. Store tensors in IndexedDB
   * 5. Return data ready for Redux dispatch
   */

  async uploadFiles(
    files: FileList,
    options?: UploadOptionswithCallbacks,
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    this.resetProgress();

    try {
      // -- Stage 1: Analyze
      this.updateProgress({
        stage: "analyzing",
        totalCount: files.length,
        overallProgress: 5,
      });

      const analysisResult = await this.analyzeFiles(files);

      if (this.abortController?.signal.aborted) {
        return this.cancelledResult(files.length);
      }

      const hasMultiframe = analysisResult.some(
        (result) => result.tiffInfo?.isMultiFrame,
      );
      // Handle TIFF files needing user input
      const tiffConfigs = new Map<string, TiffImportConfig>();
      if (hasMultiframe && options?.onTiffDialog) {
        const config = await options.onTiffDialog(analysisResult);
        if (config === null) {
          this.resetProgress();
          return this.cancelledResult(files.length);
        } else {
          Object.entries(config).forEach(([fileName, config]) => {
            tiffConfigs.set(fileName, config);
          });
        }
      }

      // -- Stage 2: Load + Prepare in workers

      this.updateProgress({
        stage: "loading",
        overallProgress: 10,
      });

      const taskHandles: Array<{
        fileName: string;
        handle: TaskHandle<LoadAndPrepareOutput>;
      }> = [];

      const errors: TaskError[] = [];
      let totalBytes = 0;

      for (let i = 0; i < files.length; i++) {
        if (this.abortController?.signal.aborted) break;

        const file = files[i];

        try {
          const fileData = await file.arrayBuffer();
          console.log(fileData);
          console.log(fileData.byteLength);
          totalBytes += fileData.byteLength;
          console.log("file data: ", fileData);

          const mimeType = file.type || this.inferMimeType(file.name);

          const handle = this.scheduler.dispatch({
            type: "loadAndPrepare",
            payload: {
              fileData,
              dimSpec: tiffConfigs.get(file.name)!,
              fileName: file.name,
              mimeType,
            },
            priority: TaskPriority.HIGH,
            onProgress: (progress) => {
              if (typeof progress === "number")
                this.updateProgress({
                  stageProgress: progress,
                  currentTask: file.name,
                  processedCount: i,
                });
            },
          });

          taskHandles.push({
            fileName: file.name,
            handle,
          });
        } catch (err) {
          errors.push({
            source: file.name,
            error: parseError(err),
            recoverable: true,
          });
        }
      }

      // --  Await all worker tasks
      const results: Array<{
        fileName: string;
        output: LoadAndPrepareOutput;
      }> = [];

      for (const { fileName, handle } of taskHandles) {
        try {
          const output = await handle.promise;
          results.push({ fileName, output });

          this.updateProgress({
            processedCount: results.length,
            overallProgress:
              10 + Math.floor((results.length / taskHandles.length) * 60),
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            // Cancelled -- don't count as error
            continue;
          }
          errors.push({
            source: fileName,
            error: parseError(err),
            recoverable: true,
          });
        }
      }

      if (results.length === 0) {
        this.updateProgress({ stage: "error" });
        return {
          success: false,
          metadataIds: [],
          images: [],
          errors,
          warnings: [],
          stats: {
            totalFiles: files.length,
            successCount: 0,
            failedCount: files.length,
            totalBytes,
            preparationTimeMs: Date.now() - startTime,
          },
        };
      }

      // -- Stage 3: Store in IndexedDB
      const storageItems: Array<{
        id: string;
        storeName: StoreName;
        data: ChannelStorageInput;
      }> = [];

      const imageSeries: ImageSeriesResult[] = [];
      const images: ImageObject[] = [];
      const planes: Plane[] = [];
      this.updateProgress({
        stage: "storing",
        overallProgress: 75,
      });
      results.forEach((result) => {
        imageSeries.push(...result.output.imageSeries);
        images.push(...result.output.images);
        planes.push(...result.output.planes);

        result.output.channels.forEach((channel) => {
          storageItems.push({
            id: channel.id,
            storeName: STORES.CHANNEL_DATA,
            data: channel,
          });
        });
      });

      const storageResult = await this.storage.storeBatch(storageItems);

      if (!storageResult.success) {
        this.updateProgress({ stage: "error" });
        return {
          success: false,
          metadataIds: [],
          images: [],
          errors: [
            ...errors,
            {
              source: "IndexedDB",
              error: storageResult.error,
              recoverable: false,
            },
          ],
          warnings: [],
          stats: {
            totalFiles: files.length,
            successCount: 0,
            failedCount: files.length,
            totalBytes,
            preparationTimeMs: Date.now() - startTime,
          },
        };
      }

      // -- Stage 4: Build Redux-ready payload

      this.updateProgress({
        stage: "storing",
        overallProgress: 90,
      });

      const channelRefs = storageResult.data;

      const channels: Channel[] = storageItems.map((item, idx) => ({
        id: item.data.id,
        name: item.data.name,
        planeId: item.data.planeId,
        width: item.data.width,
        height: item.data.height,
        bitDepth: item.data.bitDepth,
        dtype: item.data.dtype,
        storageReference: channelRefs[idx],
        color: item.data.color,
        visible: item.data.visible,
      }));

      // Collect results — to be dispatched by the caller
      // (DataPipelineService does NOT dispatch to Redux directly;
      //  it returns data that the React component dispatches)

      this.updateProgress({
        stage: "complete",
        overallProgress: 100,
        processedCount: results.length,
      });

      return {
        success: true,
        images: [{ fileName: "fuck", imageSeries, images, planes, channels }],
        metadataIds: [],
        errors,
        warnings:
          errors.length > 0 ? [`${errors.length} file(s) failed to load`] : [],
        stats: {
          totalFiles: files.length,
          successCount: results.length,
          failedCount: errors.length,
          totalBytes,
          preparationTimeMs: Date.now() - startTime,
        },
      };
    } catch (err) {
      this.updateProgress({ stage: "error" });
      throw err;
    }
  }

  // ============================================================
  // File Analysis
  // ============================================================

  /**
   * Analyze files without processing them
   * Used to determine if dialogs are needed (e.g., TIFF frame interpretation)
   *
   * 1. Check file types
   * 2. For TIFFs, parse header to detect frames
   * 3. Return analysis results for UI decisions
   */
  async analyzeFiles(files: FileList): Promise<FileAnalysisResult[]> {
    // Phase 1: Return basic analysis
    const results: FileAnalysisResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const mimeType = file.type || this.inferImageType(file.name);
      const imageType = this.inferImageType(file.name);

      const result: FileAnalysisResult = {
        fileName: file.name,
        fileSize: file.size,
        mimeType,
        imageType,
      };

      // For TIFF files, analyze in worker to detect multi-frame
      if (imageType === "tiff") {
        try {
          const fileData = await file.arrayBuffer();
          const handle = this.scheduler.dispatch({
            type: "analyzeTiff",
            payload: { fileData },
            priority: TaskPriority.HIGH,
          });

          const tiffResult = await handle.promise;
          result.tiffInfo = {
            ...tiffResult,
          };
        } catch {
          //if analysis fails, treat as regular image
        }
      }
      results.push(result);
    }

    return results;
  }

  // ============================================================
  // Progress Management
  // ============================================================

  /**
   * Subscribe to progress updates
   * Returns unsubscribe function
   */
  onProgress(callback: (progress: Progress) => void): () => void {
    this.progressListeners.add(callback);
    // Immediately send current progress
    callback(this.progress);
    return () => {
      this.progressListeners.delete(callback);
    };
  }

  /**
   * Get current progress
   */
  getProgress(): Progress {
    return { ...this.progress };
  }

  /**
   * Get current stage
   */
  getStatus(): PipelineStage {
    return this.progress.stage as PipelineStage;
  }

  /**
   * Cancel current operation
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.updateProgress({ stage: "cancelled" });
    }
  }

  useGeoTIFF(files: FileList): void {}

  // ============================================================
  // PUBLIC -- END
  // ============================================================
  // ============================================================
  // PRIVATE -- START
  // ============================================================

  private updateProgress(updates: Partial<Progress>): void {
    this.progress = { ...this.progress, ...updates };
    this.notifyProgressListeners();
  }

  private notifyProgressListeners(): void {
    for (const listener of this.progressListeners) {
      listener(this.progress);
    }
  }

  private resetProgress(): void {
    this.progress = { ...INITIAL_PROGRESS };
    this.abortController = new AbortController();
  }

  private cancelledResult(totalFiles: number): PipelineResult {
    return {
      success: false,
      metadataIds: [],
      images: [],
      errors: [],
      warnings: ["Upload cancelled by user"],
      stats: {
        totalFiles,
        successCount: 0,
        failedCount: 0,
        totalBytes: 0,
        preparationTimeMs: 0,
      },
    };
  }

  private inferMimeType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "png":
        return "image/png";
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "tif":
      case "tiff":
        return "image/tiff";
      case "dcm":
        return "application/dicom";
      case "bmp":
        return "image/bmp";
      default:
        return "application/octet-stream";
    }
  }

  private inferImageType(fileName: string): "standard" | "tiff" | "dicom" {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "tif" || ext === "tiff") return "tiff";
    if (ext === "dcm") return "dicom";
    return "standard";
  }
  // ============================================================
  // PRIVATE -- END
  // ============================================================
}

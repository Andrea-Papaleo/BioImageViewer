import type {
  ChannelResult,
  ImageSeriesResult,
  LoadAndPrepareOutput,
} from "@/tools/types.ts";
import { STORES, type StorageReference } from "@/types.ts";
import { parseError } from "@/utils.ts";
import { StorageService } from "../StorageService/StorageService.ts";
import type { Progress, TaskError } from "../types.ts";
import { TaskPriority, type TaskHandle } from "../WorkerScheduler/types.ts";
import { WorkerScheduler } from "../WorkerScheduler/WorkerScheduler.ts";
import {
  FILE,
  MIME,
  type FileAnalysisResult,
  type FileInterpretationResult,
  type FileType,
  type IDataPipelineService,
  type MimeType,
  type PipelineCancelResult,
  type PipelineResult,
  type PipelineStage,
  type ReaderResult,
  type TiffAnalysisResult,
  type TiffImportConfig,
  type UploadOptionswithCallbacks,
} from "./types.ts";
import type {
  Channel,
  ChannelMeta,
  ImageObject,
  Plane,
} from "@/state/types.ts";

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
  private startTime: number | null = null;
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
    this.startTime = Date.now();
    this.resetProgress();

    try {
      // -- Stage 1: Analyze
      this.updateProgress({
        stage: "analyzing",
        totalCount: files.length,
        overallProgress: 5,
      });
      console.log("heer");
      const interpretationResults = this.interpretFiles(files);
      if (this.abortController?.signal.aborted) {
        return { success: false, cancelled: true };
      }

      let imageResults: ReaderResult;
      switch (interpretationResults.imageType) {
        case FILE.BASIC:
          imageResults = await this.parseBasicImages(
            files,
            interpretationResults.fileResults,
          );
          break;

        case FILE.DICOM:
          imageResults = await this.parseDicomImages(files);
          break;
        case FILE.CZI:

        case FILE.TIFF:
          imageResults = await this.parseTiffImages(files, options);
          break;
      }

      if (!imageResults.success) {
        if (imageResults.reason === "cancelled") {
          return { success: false, cancelled: true };
        }
        return {
          success: false,
          cancelled: false,
          data: [],
          errors: [...imageResults.errors],
          warnings: [],
          stats: {
            totalFiles: files.length,
            successCount: 0,
            failedCount: files.length,
            totalBytes: 0,
            preparationTimeMs: Date.now() - this.startTime,
          },
        };
      }

      const storageResult = await this.storeData(imageResults.data.channelData);

      if (!storageResult.success) {
        this.updateProgress({ stage: "error" });
        return {
          success: false,
          cancelled: false,
          data: [],
          errors: [
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
            totalBytes: 0,
            preparationTimeMs: Date.now() - this.startTime,
          },
        };
      }

      // -- Stage 4: Build Redux-ready payload

      this.updateProgress({
        stage: "storing",
        overallProgress: 90,
      });

      const channels: Channel[] = imageResults.data.channelData.map(
        (item, idx) => {
          const { data: _data, histogram: _histogram, ...rest } = item;
          return {
            ...rest,
            storageReference: storageResult.references[idx],
          };
        },
      );

      // Collect results — to be dispatched by the caller
      // (DataPipelineService does NOT dispatch to Redux directly;
      //  it returns data that the React component dispatches)

      this.updateProgress({
        stage: "complete",
        overallProgress: 100,
        processedCount: 100,
      });

      return {
        success: true,
        cancelled: false,
        data: [
          {
            fileName: files[0].name,
            imageSeries: imageResults.data.imageSeries,
            images: imageResults.data.images,
            planes: imageResults.data.planes,
            channelMetas: imageResults.data.channelMetas,
            channels,
          },
        ],
        errors: [],
        warnings: [],
        stats: {
          totalFiles: files.length,
          successCount: files.length,
          failedCount: 0,
          totalBytes: 0,
          preparationTimeMs: Date.now() - this.startTime,
        },
      };
    } catch (err) {
      this.updateProgress({ stage: "error" });
      throw err;
    }
  }

  async storeData(
    channelData: ChannelResult[],
  ): Promise<
    | { success: false; error: Error }
    | { success: true; references: StorageReference[] }
  > {
    const storageItems = channelData.map((channel) => ({
      id: channel.id,
      storeName: STORES.CHANNEL_DATA,
      data: channel,
    }));
    const storageResult = await this.storage.storeBatch(storageItems);

    if (!storageResult.success) {
      return { success: false, error: storageResult.error };
    }

    // -- Stage 4: Build Redux-ready payload

    this.updateProgress({
      stage: "storing",
      overallProgress: 90,
    });

    return { success: true, references: storageResult.data };
  }
  async parseDicomImages(files: FileList) {
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
        totalBytes += fileData.byteLength;

        const handle = this.scheduler.dispatch({
          type: "loadAndPrepareDicom",
          payload: {
            fileData,
            fileName: file.name,
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
    return this.processImages(taskHandles);
  }

  async parseBasicImages(
    files: FileList,
    fileAnalyses: FileInterpretationResult["fileResults"],
  ) {
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
        totalBytes += fileData.byteLength;

        const handle = this.scheduler.dispatch({
          type: "loadAndPrepareBasic",
          payload: {
            fileData,
            fileName: file.name,
            mimeType: fileAnalyses[file.name].mimeType,
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
    return this.processImages(taskHandles);
  }
  async parseTiffImages(
    files: FileList,
    options?: UploadOptionswithCallbacks,
  ): Promise<ReaderResult> {
    const analysisResult = await this.analyzeTiffs(files);

    const hasMultiframe = analysisResult.some((result) => result.isMultiFrame);
    // Handle TIFF files needing user input
    const tiffConfigs = new Map<string, TiffImportConfig>();
    if (hasMultiframe && options?.onTiffDialog) {
      const config = await options.onTiffDialog(analysisResult);
      if (config === null) {
        this.resetProgress();

        return this.cancelledResult();
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
        totalBytes += fileData.byteLength;

        const handle = this.scheduler.dispatch({
          type: "loadAndPrepare",
          payload: {
            fileData,
            dimSpec: tiffConfigs.get(file.name)!,
            fileName: file.name,
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

    return this.processImages(taskHandles);
  }

  async processImages(
    taskHandles: {
      fileName: string;
      handle: TaskHandle<LoadAndPrepareOutput>;
    }[],
  ): Promise<ReaderResult> {
    // --  Await all worker tasks
    const errors: TaskError[] = [];
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
        reason: "error",
        errors,
      };
    }

    // -- Stage 3: Store in IndexedDB

    const channelData: ChannelResult[] = [];
    const imageSeries: ImageSeriesResult[] = [];
    const images: ImageObject[] = [];
    const planes: Plane[] = [];
    const channelMetas: ChannelMeta[] = [];
    this.updateProgress({
      stage: "storing",
      overallProgress: 75,
    });
    results.forEach((result) => {
      imageSeries.push(...result.output.imageSeries);
      images.push(...result.output.images);
      planes.push(...result.output.planes);
      channelMetas.push(...result.output.channelMetas);
      channelData.push(...result.output.channels);
    });
    return {
      success: true,
      data: { imageSeries, channelMetas, images, planes, channelData },
    };
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
  interpretFiles(files: FileList): FileInterpretationResult {
    // Phase 1: Return basic analysis
    const results: FileInterpretationResult["fileResults"] = {};
    const imageTypeSet = new Set<FileType>();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const mimeType = this.inferMimeType(file);
      const imageType = this.inferImageType(file.name);
      imageTypeSet.add(imageType);
      if (imageTypeSet.size > 1) {
        throw new Error(
          `Input files must be of the same type. Found ${imageTypeSet.entries}`,
        );
      }

      const result: FileAnalysisResult = {
        fileName: file.name,
        fileSize: file.size,
        mimeType,
        imageType,
      };

      // For TIFF files, analyze in worker to detect multi-frame

      results[file.name] = result;
    }

    return { imageType: [...imageTypeSet][0], fileResults: results };
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
  async analyzeTiffs(files: FileList): Promise<TiffAnalysisResult[]> {
    // Phase 1: Return basic analysis
    const results: TiffAnalysisResult[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        const fileData = await file.arrayBuffer();
        const handle = this.scheduler.dispatch({
          type: "analyzeTiff",
          payload: { fileData },
          priority: TaskPriority.HIGH,
        });

        const tiffResult = await handle.promise;
        results.push({ fileName: file.name, ...tiffResult });
      } catch {
        //if analysis fails, treat as regular image
      }
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

  private cancelledResult(): PipelineCancelResult {
    return {
      success: false,
      reason: "cancelled",
      warning: "Upload cancelled by user",
    };
  }

  private inferMimeType(file: File): MimeType {
    const type = file.type;
    if ((Object.values(MIME) as string[]).includes(type)) {
      return type as MimeType;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "png":
        return MIME.PNG;
      case "jpg":
      case "jpeg":
        return MIME.JPEG;
      case "tif":
      case "tiff":
        return MIME.TIFF;
      case "dcm":
        return MIME.DICOM;
      case "bmp":
        return MIME.BMP;
      case "czi":
        return MIME.CZI;
      default:
        return MIME.UNKNOWN;
    }
  }

  private inferImageType(fileName: string): FileType {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "tif" || ext === "tiff") return FILE.TIFF;
    if (ext === "dcm") return FILE.DICOM;
    if (ext === "czi") return FILE.CZI;
    return FILE.BASIC;
  }
  // ============================================================
  // PRIVATE -- END
  // ============================================================
}

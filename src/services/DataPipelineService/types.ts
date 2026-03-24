import type {
  Channel,
  ImageMetadata,
  ImageObject,
  Plane,
} from "../../state/types";
import type { StoredItemReference } from "../StorageService/types";
import type { DimensionOrder, OMEDims } from "../../tools/TiffReader/types";
import type { Progress, TaskError } from "../types";
import type { ImageSeriesResult } from "@/tools/types";

// ============================================================
// Pipeline Status & Progress
// ============================================================

export type PipelineStage =
  | "idle"
  | "loading"
  | "analyzing"
  | "deserializing"
  | "serializing"
  | "storing"
  | "complete"
  | "error"
  | "cancelled";

// ============================================================
// Upload Options
// ============================================================

export type UploadOptions = {
  // Time series configuration
  timeSeries?: boolean;
  timeSeriesDelimiter?: string;

  // Channel configuration (for ambiguous formats)
  channelConfig?: {
    interpretation: "rgb" | "greyscale" | "multichannel";
    channelCount?: number;
  };

  // Processing options
  skipPrepare?: boolean;
};

export type TiffImportConfig = {
  dimensionOrder: (typeof DimensionOrder)[number];
  channels: number;
  slices: number;
  frames: number;
  frameRange?: { start: number; end: number };
  OMEDims?: OMEDims;
};

// ============================================================
// Pipeline Results
// ============================================================

export type PipelineImageResult = {
  fileName: string;
  imageSeries: ImageSeriesResult[];
  images: ImageObject[];
  planes: Plane[];
  channels: Channel[];
};

export type PipelineResult = {
  success: boolean;
  images: PipelineImageResult[];
  metadataIds: string[];
  errors: TaskError[];
  warnings: string[];
  stats: {
    totalFiles: number;
    successCount: number;
    failedCount: number;
    totalBytes: number;
    preparationTimeMs: number;
  };
};

// ============================================================
// Prepared Data (output from workers)
// ============================================================

export type PreparedImageData = {
  // Metadata for Redux
  metadata: Omit<ImageMetadata, "imageDataIds" | "defaultImageId"> & {
    imageDataIds: string[];
    defaultImageId: string;
  };

  // Image objects for Redux (without Tensor4D)
  images: Array<
    Omit<ImageObject, "data"> & {
      tensorRef: StoredItemReference;
    }
  >;

  // Raw data for IndexedDB (one per image)
  data: Array<{
    id: string;
    buffer: ArrayBuffer;
    dtype: "float32" | "int32" | "uint8";
    shape: [number, number, number, number];
    preparedChannels: {
      data: number[][];
      histograms?: number[][];
    };
    renderedSrc: string;
  }>;
};

// ============================================================
// File Analysis Results
// ============================================================

export type FileAnalysisResult = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  imageType: "standard" | "tiff" | "dicom";

  // For TIFF files
  tiffInfo?: {
    frameCount: number;
    isMultiFrame: boolean;
    suggestedType: "timeSeries" | "zStack" | "channels" | "unknown";
    confidence: number;
    OMEDims?: Partial<OMEDims>;
    metadata: Record<string, unknown>;
  };
};

// ============================================================
// Service Interface
// ============================================================

export interface IDataPipelineService {
  // Main entry points
  uploadFiles(
    files: FileList,
    options?: UploadOptions,
  ): Promise<PipelineResult>;
  // Analysis (for UI decisions)
  analyzeFiles(files: FileList): Promise<FileAnalysisResult[]>;
  // useGeoTIFF(files:FileList)
  // Progress and cancellation
  onProgress(callback: (progress: Progress) => void): () => void;
  cancel(): void;

  // State
  getStatus(): PipelineStage;
  getProgress(): Progress;
}

// ============================================================
// UI Dialog Integration
// ============================================================

export type TiffDialogCallbackResult = Record<string, TiffImportConfig>;
/**
 * Callback for requesting user decisions during pipeline execution.
 * The pipeline pauses and waits for the callback to resolve
 */
export type TiffDialogCallback = (
  analysisResults: FileAnalysisResult[],
) => Promise<TiffDialogCallbackResult | null>; //null = cancel

/**
 * Callback for requesting channel configuration from user.
 * Used when uploaded files have ambiguous channel counts
 */
export type ChannelConfigCallback = (
  fileInfo: FileAnalysisResult[],
) => Promise<number | null>; // null = cancel

/**
 * Extended upload options including dialog callbacks
 */
export type UploadOptionswithCallbacks = UploadOptions & {
  onTiffDialog?: TiffDialogCallback;
  onChannelConfig?: ChannelConfigCallback;
};

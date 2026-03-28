import type {
  Channel,
  ChannelMeta,
  ImageObject,
  Plane,
} from "../../state/types";
import type { DimensionOrder, OMEDims } from "../../tools/TiffReader/types";
import type { StoredItemReference } from "../StorageService";
import type { Progress, TaskError } from "../types";
import type { ChannelResult, ImageSeriesResult } from "@/tools/types";

export const FILE = {
  BASIC: "basic",
  TIFF: "tiff",
  DICOM: "dicom",
  CZI: "czi",
} as const;
export const MIME = {
  PNG: "image/png",
  JPEG: "image/jpeg",
  TIFF: "image/tiff",
  DICOM: "application/dicom",
  BMP: "image/bmp",
  CZI: "image/czi",
  UNKNOWN: "application/octet-stream",
} as const;
export type MimeType = (typeof MIME)[keyof typeof MIME];
export type FileType = "standard" | "tiff" | "dicom" | "czi";
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

export type PipelineDataResult = {
  fileName: string;
  imageSeries: ImageSeriesResult[];
  images: ImageObject[];
  planes: Plane[];
  channels: Channel[];
  channelMetas: ChannelMeta[];
};

export type ReaderResult =
  | {
      success: false;
      reason: "error";
      errors: TaskError[];
    }
  | PipelineCancelResult
  | {
      success: true;
      data: {
        imageSeries: ImageSeriesResult[];
        channelMetas: ChannelMeta[];
        images: ImageObject[];
        planes: Plane[];
        channelData: ChannelResult[];
      };
    };
export type PipelineCancelResult = {
  success: false;
  reason: "cancelled";
  warning: string;
};
export type PipelineResult =
  | {
      success: boolean;
      cancelled: boolean;
      data: PipelineDataResult[];
      errors: TaskError[];
      warnings: string[];
      stats: {
        totalFiles: number;
        successCount: number;
        failedCount: number;
        totalBytes: number;
        preparationTimeMs: number;
      };
    }
  | { success: false; cancelled: true };

// ============================================================
// File Interperetation Results
// ============================================================

export type FileInterpretationResult = {
  imageType: FileType;
  fileResults: Record<
    string,
    {
      fileName: string;
      fileSize: number;
      mimeType: MimeType;
      imageType: FileType;
    }
  >;
};

// ============================================================
// File Analysis Results
// ============================================================

export type TiffAnalysisResult = {
  fileName: string;
  frameCount: number;
  isMultiFrame: boolean;
  suggestedType: "timeSeries" | "zStack" | "channels" | "unknown";
  confidence: number;
  OMEDims?: Partial<OMEDims>;
  metadata: Record<string, unknown>;
};
// ============================================================
// File Analysis Results
// ============================================================

export type FileAnalysisResult = {
  fileName: string;
  fileSize: number;
  mimeType: MimeType;
  imageType: FileType;

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
  analyzeTiffs(files: FileList): Promise<TiffAnalysisResult[]>;

  // Progress and cancellation
  onProgress(callback: (progress: Progress) => void): () => void;
  storeData(
    channelData: ChannelResult[],
  ): Promise<
    | { success: false; error: Error }
    | { success: true; references: StoredItemReference[] }
  >;
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
  analysisResults: TiffAnalysisResult[],
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

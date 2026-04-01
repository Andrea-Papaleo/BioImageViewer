export type AnalyzeTiffOutput = {
  frameCount: number;
  isMultiFrame: boolean;
  suggestedType: "timeSeries" | "zStack" | "channels" | "unknown";
  confidence: number;
  OMEDims?: Partial<OMEDims>;
  metadata: Record<string, string | number | undefined | string[]>;
  // metadata: {
  //   imageDescription?: string;
  //   dateTime?: string[];
  //   frameInterval?: number;
  //   zSpacing?: number;
  // };
};

export const DimensionOrder = [
  "xyczt",
  "xyctz",
  "xyzct",
  "xyztc",
  "xytcz",
  "xytzc",
] as const;
export type OMEDims = {
  name: string | undefined;
  sizex: number;
  sizey: number;
  sizez: number;
  sizec: number;
  sizet: number;
  unit: string;
  pixeltype: string;
  dimensionorder: (typeof DimensionOrder)[number];
  pixelsizex: number;
  pixelsizey: number;
  pixelsizez: number;
  channelnames: string[];
};

/**
 * Interface for TiffAnalyzerService.
 * Defines the contract for TIFF header analysis.
 * Used for dependency injection and mocking in tests.
 */
export interface ITiffReader {
  analyze(buffer: ArrayBuffer): void;
}

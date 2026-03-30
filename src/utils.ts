import type { ColorMap } from "./state/types";
import type { BitDepth } from "./types";

export const parseError = (error: unknown) => {
  return error instanceof Error ? error : new Error(String(error));
};
export const devError = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.error(...args);
};

// Takes a buffer and dtype and returns a typed array view of its buffer
// based on the dtype field ("float32" | "int32" | "uint8").
export function toTypedArray(
  buffer: ArrayBuffer,
  dtype: "float32" | "int32" | "uint8",
): Float32Array | Int32Array | Uint8Array {
  switch (dtype) {
    case "float32":
      return new Float32Array(buffer);
    case "int32":
      return new Int32Array(buffer);
    case "uint8":
      return new Uint8Array(buffer);
  }
}
//the default colors assigned to a loaded image
export const DEFAULT_COLORS: Array<[number, number, number]> = [
  [1, 0, 0], // red
  [0, 1, 0], // green
  [0, 0, 1], // blue
  [1, 1, 0], // yellow
  [0, 1, 1], // cyan
  [1, 0, 1], // magneta
  [1, 1, 1], // white
];

/**
 * Conver number between 0 and 1 into the haxidecimal value
 * @param c - number between 0 and 1
 * @returns Hexidecimal value
 *
 */
const componentToHex = (c: number) => {
  const hex = (c * 255).toString(16);
  return hex.length === 1 ? "0" + hex : hex;
};

/**
 * Convert an array of RGB values into a hexidecimal color
 * @param rgb - Array of RGB values normalized between 0 and 1 [R, G, B]
 * @returns Hexidecimal Color
 *
 */
export const rgbToHex = (rgb: [number, number, number]) => {
  return (
    "#" +
    componentToHex(rgb[0]) +
    componentToHex(rgb[1]) +
    componentToHex(rgb[2])
  );
};

export const createLUT = (params: {
  bitDepth: BitDepth;
  colorMap: ColorMap;
  min?: number;
  max?: number;
}): number[][] => {
  const { bitDepth, colorMap, min, max } = params;
  const maxIntensity = 2 ** bitDepth - 1;
  const scaledMin = min ? min : 0;
  const scaledMax = max ? max : maxIntensity;

  const range = scaledMax - scaledMin;

  const lut = colorMap.map((w) =>
    Array.from({ length: maxIntensity + 1 }, (_, v) => {
      const leveled = Math.max(
        0,
        Math.min(maxIntensity, ((v - scaledMin) / range) * maxIntensity),
      );
      return Math.min(255, Math.round((leveled / maxIntensity) * 255 * w));
    }),
  );
  return lut;
};

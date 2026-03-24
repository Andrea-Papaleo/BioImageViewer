import { Stack as IJSStack } from "image-js";
import {
  scalar,
  tensor1d,
  tensor5d,
  tidy,
  type Tensor3D,
  type Tensor4D,
  type Tensor5D,
} from "@tensorflow/tfjs";
import type { DimensionOrder } from "./TiffReader/types";
import type { BitDepth, Colors } from "@/types";

/**
 * Converts an ImageJS image stack into an array of `Tensor4D`, one per timepoint,
 * each of shape `[Z, H, W, C]`.
 *
 * Handles arbitrary TIFF dimension orderings (e.g. `"xyczt"`, `"xyztc"`) by
 * reshaping into a 5D tensor matching the source layout, then transposing to
 * the canonical `[T, Z, H, W, C]` order before unstacking along the time axis.
 *
 * If the source data is not already float, values are normalized to `[0, 1]`
 * by dividing by `2^bitDepth - 1`.
 *
 * @param imageStack - ImageJS stack of all frames across slices, channels, and timepoints.
 * @param numSlices - Number of Z-slices.
 * @param numChannels - Number of channels per slice.
 * @param numTimepoints - Number of timepoints. Defaults to `1`.
 * @param dimensionOrder - TIFF dimension ordering string (e.g. `"xyczt"`).
 * @returns An array of `Tensor4D` (one per timepoint), each of shape `[Z, H, W, C]`.
 */
export const imageStackToShapedTensors = (
  imageStack: IJSStack,
  numSlices: number,
  numChannels: number,
  numTimepoints: number = 1,
  dimensionOrder: (typeof DimensionOrder)[number],
): Array<Tensor4D> => {
  const { bitDepth, width, height } = imageStack.getImage(0);

  const numPixels = height * width;

  // create empty array of expected size
  const imageData = new Float32Array(
    numSlices * numChannels * numTimepoints * numPixels,
  );

  // copy image stack data into imageData array beginning at the appropriate index
  for (let i = 0; i < imageStack.size; i++) {
    imageData.set(
      Float32Array.from(imageStack.getImage(i).getRawImage().data),
      i * numPixels,
    );
  }
  // TIFF dimension order strings like "xyczt" describe axis ordering from
  // fastest-varying (x) to slowest-varying (t). Since x and y are always the
  // two fastest axes (pixel data), the remaining 3 letters after "xy" tell us
  // the order of the outer dimensions in the flat buffer.
  //
  // `shape` tells tensor5d how the flat buffer is actually laid out.
  // `dimCorrection` is a transpose permutation that reorders to our canonical
  // [T, Z, H, W, C] so we can unstack along axis 0 to get per-timepoint tensors.
  let shape: [number, number, number, number, number];
  let dimCorrection: [number, number, number, number, number];
  switch (dimensionOrder) {
    case "xyctz":
      shape = [numChannels, numTimepoints, numSlices, height, width];
      dimCorrection = [1, 2, 3, 4, 0];
      break;
    case "xyczt":
      shape = [numChannels, numSlices, numTimepoints, height, width];
      dimCorrection = [2, 1, 3, 4, 0];
      break;
    case "xytcz":
      shape = [numTimepoints, numChannels, numSlices, height, width];
      dimCorrection = [0, 2, 3, 4, 1];
      break;
    case "xytzc":
      shape = [numTimepoints, numSlices, numChannels, height, width];
      dimCorrection = [0, 1, 3, 4, 2];
      break;
    case "xyzct":
      shape = [numSlices, numChannels, numTimepoints, height, width];
      dimCorrection = [2, 0, 3, 4, 1];
      break;
    case "xyztc":
      shape = [numSlices, numTimepoints, numChannels, height, width];
      dimCorrection = [1, 0, 3, 4, 2];
      break;
  }

  const reorderedTensors: Array<Tensor4D> = tidy("stackToTensor", () => {
    // Reshape flat buffer into the 5D layout matching the source dimension order,
    // then transpose to canonical [T, Z, H, W, C].
    let imageTensor: Tensor5D = tensor5d(imageData, shape).transpose(
      dimCorrection,
    );

    // Float32Array source data is already in [0, 1] (e.g. 32-bit TIFF).
    // Integer data (uint8, uint16) needs normalization to [0, 1].
    if (!(imageStack.getImage(0).getRawImage().data instanceof Float32Array)) {
      const normScalar = scalar(2 ** bitDepth - 1);
      imageTensor = imageTensor.div(normScalar);
    }

    // Unstack along axis 0 (T) → one Tensor4D [Z, H, W, C] per timepoint.
    return imageTensor.unstack(0);
  });
  return reorderedTensors;
};

/**
 * Extracts a tensor's raw data as a cloned `ArrayBuffer`.
 *
 * Reads data synchronously via `dataSync()`, determines the dtype from the
 * underlying typed array, and returns a cloned buffer (safe to transfer or
 * store independently of the tensor's lifecycle).
 *
 * @param tensor - A `Tensor4D` to extract data from.
 * @returns An object with the cloned `buffer` and the corresponding `dtype`.
 */
export function tensorToBuffer(tensor: Tensor4D): {
  buffer: ArrayBuffer;
  dtype: "float32" | "int32" | "uint8";
} {
  const data = tensor.dataSync();

  let dtype: "float32" | "int32" | "uint8";
  if (data instanceof Float32Array) {
    dtype = "float32";
  } else if (data instanceof Int32Array) {
    dtype = "int32";
  } else {
    dtype = "uint8";
  }

  const buffer = data.buffer as ArrayBuffer;

  return { buffer, dtype };
}

/**
 * Computes the per-channel min and max values of an image tensor.
 *
 * Reduces over all spatial (and Z-stack) dimensions, returning one min and one
 * max per channel. For a `[Z, H, W, C]` input, the min/max for channel `i`
 * spans every `[z, h, w, i]` index.
 *
 * @param imageTensor - Image tensor of shape `[H, W, C]` or `[Z, H, W, C]`.
 * @param opts - If `disposeImageTensor` is `true`, the input tensor is disposed after computation.
 * @returns A tuple `[mins, maxes]` where each is a `number[]` of length `C`.
 */
export const findMinsAndMaxes = <T extends Tensor3D | Tensor4D>(
  imageTensor: T,
  opts: { disposeImageTensor: boolean } = { disposeImageTensor: false },
): [number[], number[]] => {
  // Reduce over all non-channel axes to get one min/max per channel.
  // For [H, W, C]: reduce axes [0, 1] (H, W) → result shape [C].
  // For [Z, H, W, C]: reduce axes [0, 1, 2] (Z, H, W) → result shape [C].
  const [mins, maxes] = tidy(() => {
    if (imageTensor.rank === 3) {
      return [
        (imageTensor as Tensor3D).min([0, 1]).arraySync() as number[],
        (imageTensor as Tensor3D).max([0, 1]).arraySync() as number[],
      ];
    } else {
      return [
        (imageTensor as Tensor4D).min([0, 1, 2]).arraySync() as number[],
        (imageTensor as Tensor4D).max([0, 1, 2]).arraySync() as number[],
      ];
    }
  });

  if (opts.disposeImageTensor) imageTensor.dispose();
  return [mins, maxes];
};
/**
 * Denormalizes a tensor from float range `[0, 1]` back to the integer range
 * `[0, 2^bitDepth - 1]`, rounding to whole values.
 *
 * The returned tensor remains `float32` dtype — only the value range changes,
 * not the underlying typed array format.
 *
 * Always disposes the input `normalTensor`.
 *
 * @param normalTensor - A normalized tensor with values in `[0, 1]`.
 * @param bitDepth - The target bit depth (e.g. `8`, `16`).
 * @returns A tensor of the same shape with values in `[0, 2^bitDepth - 1]`.
 */
export const denormalizeTensor = <T extends Tensor3D | Tensor4D>(
  normalTensor: T,
  bitDepth: BitDepth,
) => {
  const denormalizedTensor = tidy(() =>
    normalTensor.mul(2 ** bitDepth - 1).round(),
  ) as T;

  normalTensor.dispose();

  return denormalizedTensor;
};
/**
 * Extracts a single Z-slice from a 4D image tensor.
 *
 * @param imageTensor - Image tensor of shape `[Z, H, W, C]`.
 * @param sliceIdx - Zero-based index of the Z-slice to extract.
 * @param opts - If `disposeImageTensor` is `true`, the input tensor is disposed after slicing.
 * @returns A `Tensor3D` of shape `[H, W, C]` for the requested slice.
 */
export const getImageSlice = (
  imageTensor: Tensor4D,
  sliceIdx: number,
  opts: { disposeImageTensor: boolean } = { disposeImageTensor: false },
): Tensor3D => {
  const [_, height, width, numChannels] = imageTensor.shape;

  const slice = tidy("getImageSlice", () => {
    // .slice() returns shape [1, H, W, C] — the leading dim is the single
    // Z-slice we selected. Reshape drops it to get a proper [H, W, C] Tensor3D.
    return imageTensor
      .slice([sliceIdx], [1, height, width, numChannels])
      .reshape([height, width, numChannels]) as Tensor3D;
  });

  if (opts.disposeImageTensor) imageTensor.dispose();
  return slice;
};

/**
 * Scales an image tensor's values per-channel using the ranges defined in `Colors`.
 *
 * For each channel `i`, applies: `(value - min_i) / (max_i - min_i)`.
 * If a channel's range is zero (constant value), a range of `1` is used to avoid
 * division by zero.
 *
 * @param imageTensor - Image tensor of shape `[H, W, C]` or `[Z, H, W, C]`.
 * @param colors - A `Colors` object whose `range` maps each channel index to `[min, max]`.
 * @param opts - If `disposeImageTensor` is `true` (default), the input tensor is disposed.
 * @returns A scaled tensor of the same shape as the input.
 */
export const scaleImageTensor = <T extends Tensor3D | Tensor4D>(
  imageTensor: T,
  colors: Colors,
  opts: { disposeImageTensor: boolean } = { disposeImageTensor: true },
): T => {
  const numChannels = imageTensor.shape[imageTensor.rank - 1];

  const mins: number[] = [];
  const ranges: number[] = [];
  for (let i = 0; i < numChannels; i++) {
    const [min, max] = colors.range[i];
    const range = max - min;
    mins.push(min);
    ranges.push(range === 0 ? 1 : range);
  }

  // tensor1d broadcasts across all spatial dims automatically:
  // a [H, W, C] tensor minus a [C] tensor subtracts per-channel.
  // This works because TF.js broadcasts trailing dimensions.
  const scaledImageTensor: T = tidy(() =>
    imageTensor.sub(tensor1d(mins)).div(tensor1d(ranges)),
  );

  if (opts.disposeImageTensor) imageTensor.dispose();

  return scaledImageTensor;
};

/**
 * Filters an image tensor to include only the specified channels.
 *
 * Gathers channels along the innermost axis using the provided index array,
 * preserving all spatial (and Z-stack) dimensions.
 *
 * - `[H, W, C]` input → `[H, W, VC]` output
 * - `[Z, H, W, C]` input → `[Z, H, W, VC]` output
 *
 * where `VC = filter.length` (number of visible channels).
 *
 * @param imageSlice - Image tensor of shape `[H, W, C]` or `[Z, H, W, C]`.
 * @param filter - Array of channel indices to keep (e.g. `[0, 2]` for channels 0 and 2).
 * @param opts - If `disposeImageSlice` is `true` (default), the input tensor is disposed.
 * @returns A tensor of the same rank with only the selected channels.
 */
export const sliceVisibleChannels = <T extends Tensor3D | Tensor4D>(
  imageSlice: T,
  filter: Array<number>,
  opts: { disposeImageSlice: boolean } = { disposeImageSlice: true },
): T => {
  // channel axis is innermost
  const channelAxis = imageSlice.rank - 1;

  const slice = tidy("sliceVisibleChannels", () => {
    const indices = tensor1d(filter, "int32");

    // form a new 3D/4D tensor, gathering only channels in the indices matching the filter
    // channel axis is innermost, 2
    const res = (imageSlice as T).gather(indices, channelAxis);

    return res;
  });
  // gc input tensor
  if (opts.disposeImageSlice) imageSlice.dispose();
  return slice;
};

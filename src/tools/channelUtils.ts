import type { DataArray, BitDepth, ColorsRaw, Colors } from "@/types";
import {
  bincount,
  booleanMaskAsync,
  dispose,
  fill,
  tensor1d,
  tensor2d,
  tidy,
  type Tensor1D,
  type Tensor2D,
  type Tensor3D,
  type Tensor4D,
} from "@tensorflow/tfjs";
import { findMinsAndMaxes } from "./tensorUtils";
import { DEFAULT_COLORS } from "@/utils";

/**
 * Returns indices of channels that have visibility set to true.
 */
export const filterVisibleChannels = (colors: Colors): Array<number> => {
  return Object.entries(colors.visible)
    .filter(([, v]) => v)
    .map(([k]) => Number(k));
};
/**
 * Filters a color matrix to only include channels specified by `filter`.
 *
 * @param colors - Image colors containing a color matrix of shape [C, 3].
 * @param filter - Array of channel indices to include in the result.
 * @returns Tensor2D of shape [VC, 3] where VC = filter.length.
 */
export const sliceVisibleColors = (
  colors: Colors,
  filter: Array<number>,
): Tensor2D => {
  // channel axis is outermost
  const channelAxis = 0;

  return tidy("sliceVisibleColors", () => {
    const indices = tensor1d(filter, "int32");

    // form a new 2D tensor, gathering only triples in indices matching filter
    return colors.color.gather(indices, channelAxis);
  });
};
/**
 * Generates default color configuration for an image's channels.
 *
 * When given a channel count, uses range [0, 1] for all channels.
 * When given a tensor, computes actual per-channel min/max from the data.
 *
 * Color assignment: multi-channel images get R, G, B, Y, C, M from
 * {@link DEFAULT_COLORS} for the first 6 channels; single-channel
 * images get white [1, 1, 1]. Images with >3 channels default to
 * showing only the first channel as visible.
 *
 * @param imageTensorOrChannel - Channel count, or a normalized [0, 1] image tensor.
 * @returns Raw (non-tensor) color configuration with range, visibility, and RGB triples.
 * @throws If channel count is <= 0, or if min/max arrays don't match channel count.
 */
export function generateDefaultColors(channels: number): ColorsRaw;
export function generateDefaultColors<T extends Tensor3D | Tensor4D>(
  imageTensor: T,
): ColorsRaw;
export function generateDefaultColors<T extends Tensor3D | Tensor4D>(
  imageTensorOrChannel: T | number,
): ColorsRaw {
  const range: { [channel: number]: [number, number] } = {};
  const visible: { [channel: number]: boolean } = {};
  const color: Array<[number, number, number]> = [];
  let mins: number[], maxs: number[], numChannels: number;

  if (typeof imageTensorOrChannel === "number") {
    numChannels = imageTensorOrChannel;
    if (numChannels <= 0) {
      throw new Error(
        `Expected positive number of channels, got ${numChannels}`,
      );
    }
    mins = new Array(imageTensorOrChannel).fill(0);
    maxs = new Array(imageTensorOrChannel).fill(1);
  } else {
    numChannels =
      imageTensorOrChannel.rank === 3
        ? (imageTensorOrChannel as Tensor3D).shape[2]
        : (imageTensorOrChannel as Tensor4D).shape[3];

    const ranges = findMinsAndMaxes(imageTensorOrChannel);
    mins = ranges[0];
    maxs = ranges[1];
  }

  if (mins.length !== numChannels || maxs.length !== numChannels) {
    throw Error(
      `Expected num channels, min values, and max values to all be ${numChannels}`,
    );
  }

  for (let i = 0; i < numChannels; i++) {
    // Multi-channel: assign distinct R/G/B/Y/C/M from DEFAULT_COLORS.
    // Single-channel: use white so the grayscale image renders as-is.
    // Channels beyond DEFAULT_COLORS.length also fall back to white.
    color.push(
      numChannels > 1 && i < DEFAULT_COLORS.length
        ? DEFAULT_COLORS[i]
        : [1, 1, 1],
    );

    range[i] = [mins[i], maxs[i]];

    // For >3 channels (e.g. fluorescence microscopy), default to only showing
    // channel 0 to avoid an overwhelming composite. The user can toggle others.
    visible[i] = !(numChannels > 3 && i > 0);
  }

  return {
    range,
    visible,
    color,
  };
}

/**
 * Extracts per-channel pixel arrays and histograms from a normalized Tensor4D.
 *
 * Transposes the tensor to channels-first layout, unstacks into per-channel
 * Tensor1D slices, then extracts data and computes histograms. If a decoded
 * mask is provided, applies it via {@link booleanMaskAsync} before extraction.
 *
 * Tensor values are expected to be normalized to [0, 1]; the histogram function
 * scales values back to integer bin indices using (2^bitDepth) bins.
 *
 * All intermediate tensors are cleaned up via try/finally, even on error.
 *
 * @param data - Normalized [0, 1] image tensor of shape [Z, H, W, C].
 * @param bitDepth - Original bit depth; histograms skipped for bitDepth >= 32.
 * @param decodedMask - Optional binary mask of shape [H * W].
 * @returns Per-channel pixel arrays (normalized values) and per-channel histograms.
 */
export const prepareChannelsFromTensor = async (
  data: Tensor4D,
  bitDepth: BitDepth,
  decodedMask?: DataArray,
) => {
  const [planes, height, width, channels] = data.shape;
  let channelTensors: Tensor1D[];
  if (decodedMask) {
    // booleanMaskAsync applies a spatial mask along axis 1 (H dimension),
    // keeping only rows/pixels where mask is true. The mask is 2D [H, W]
    // so it filters out masked pixels, reducing the spatial dimensions.
    const spatialMask = tensor2d(
      Array.from(decodedMask),
      [height, width],
      "bool",
    );
    let maskedData;
    try {
      maskedData = await booleanMaskAsync(data, spatialMask, 1);
    } finally {
      spatialMask.dispose();
    }

    try {
      // After masking, reorder to channels-first so unstack() yields one
      // Tensor1D per channel, each containing all masked pixel values
      // flattened across planes.
      channelTensors = tidy(() => {
        const channelsFirst = maskedData.transpose([2, 0, 1]);
        const maskedPixels = channelsFirst.shape[2]!;
        const reshaped = channelsFirst.reshape([
          channels,
          planes * maskedPixels,
        ]);
        return reshaped.unstack();
      });
    } finally {
      maskedData.dispose();
    }
  } else {
    // Transpose from [Z, H, W, C] → [C, Z, H, W], then flatten spatial dims
    // so unstack() along axis 0 gives one 1D tensor per channel.
    channelTensors = tidy(() => {
      return data
        .transpose([3, 0, 1, 2])
        .reshape([channels, planes * height * width])
        .unstack();
    });
  }

  const channelData: number[][] = [];
  const channelHists: number[][] = [];

  try {
    for (let i = 0; i < channels; i++) {
      channelData.push(channelTensors[i].arraySync());
      let histogram: number[];
      if (bitDepth < 32) {
        histogram = computeHistogramFromTensor(
          channelTensors[i],
          2 ** bitDepth,
          {
            disposeTensor: true,
          },
        );
      } else {
        histogram = [];
      }
      channelHists.push(histogram);
    }
  } finally {
    dispose(channelTensors);
  }

  return { data: channelData, histograms: channelHists };
};

/**
 * Computes a histogram from a normalized [0, 1] Tensor1D.
 *
 * Scales values to [0, numBins-1], casts to int32, and uses tf.bincount.
 * All intermediate tensors are managed by tidy.
 *
 * @param tensor - 1D tensor of normalized float values.
 * @param numBins - Number of histogram bins (typically 2^bitDepth).
 * @param opts.disposeTensor - Whether to dispose the input tensor after use.
 * @returns Array of bin counts with length numBins.
 */
function computeHistogramFromTensor(
  tensor: Tensor1D,
  numBins: number,
  opts: { disposeTensor: boolean },
): Array<number> {
  const histogram = tidy(() => {
    // Input values are normalized [0, 1]. Scale to integer bin indices [0, numBins-1].
    // Multiply by numBins (not numBins-1) so that a value of exactly 1.0 maps to
    // numBins, which clipByValue then caps to numBins-1. This avoids an off-by-one
    // where 1.0 would otherwise map to numBins-1 and share a bin with ~1.0 values.
    const int32Tensor = tensor
      .mul(numBins)
      .clipByValue(0, numBins - 1)
      .asType("int32") as Tensor1D;
    const bin = bincount(int32Tensor, [], numBins);

    return bin.arraySync();
  });
  if (opts.disposeTensor) tensor.dispose();
  return histogram;
}

/**
 * Converts a raw color configuration to a tensor-backed {@link Colors} object.
 *
 * @param colors - Raw color config with plain arrays.
 * @param channels - Number of channels (used for tensor shape [channels, 3]).
 * @returns Colors object with a Tensor2D color matrix. Caller owns the tensor.
 */
export const createColorsTensorFromRaw = (
  colors: ColorsRaw,
  channels: number,
): Colors => {
  return {
    color: tensor2d(colors.color, [channels, 3], "float32"),
    range: colors.range,
    visible: colors.visible,
  };
};

/**
 * Applies per-channel RGB colors to a multi-channel image via matrix multiplication.
 *
 * For a Tensor3D input of shape [H, W, VC]:
 *   - Reshes to [pixels, VC], multiplies by colors [VC, 3], reshapes to [H, W, 3].
 *
 * For a Tensor4D input of shape [Z, H, W, VC]:
 *   - Same operation, but the leading Z dimension is preserved via broadcasting.
 *   - Result shape: [Z, H, W, 3].
 *
 * If no visible channels (VC = 0), returns a zero-filled tensor of the output shape.
 *
 * All intermediate tensors are managed by `tidy`. Input tensors are disposed
 * by default (controlled via `opts`), even if an error is thrown.
 *
 * @param imageSlice - Normalized [0, 1] image tensor with visible channels only.
 * @param colors - Color matrix of shape [VC, 3], with RGB values in [0, 1].
 * @param opts.disposeImageSlice - Dispose `imageSlice` after use (default: true).
 * @param opts.disposeColors - Dispose `colors` after use (default: true).
 * @returns Tensor of same rank as input, with last dimension = 3 (RGB).
 */
export const generateColoredTensor = <T extends Tensor3D | Tensor4D>(
  imageSlice: T,
  colors: Tensor2D,
  opts: {
    disposeImageSlice?: boolean;
    disposeColors?: boolean;
  } = {},
): T => {
  const { disposeImageSlice = true, disposeColors = true } = opts;

  // Handle both 3D [H, W, VC] and 4D [Z, H, W, VC] inputs generically:
  // - leadingDims captures the optional Z dimension for reshaping
  // - spatial dims are extracted from the tail of the shape array so the
  //   same logic works regardless of rank
  const leadingDims: [] | [number] =
    imageSlice.rank === 3 ? [] : [imageSlice.shape[0]];
  const shape = imageSlice.shape;
  const height = shape[shape.length - 3];
  const width = shape[shape.length - 2];
  const numVisibleChannels = shape[shape.length - 1];

  let tensor;
  try {
    tensor = tidy("generateColoredTensor", () => {
      const res: T =
        numVisibleChannels > 0
          ? imageSlice
              // Flatten spatial dims: [(Z), H, W, VC] → [(Z), pixels, VC]
              .reshape([...leadingDims, height * width, numVisibleChannels])
              // Matrix multiply each pixel's channel values by the color weights:
              // [(Z), pixels, VC] × [VC, 3] = [(Z), pixels, 3]
              // For 4D, TF.js broadcasts [VC, 3] across the Z dimension automatically
              .matMul(colors)
              .clipByValue(0, 1)
              // Restore spatial dimensions: [(Z), pixels, 3] → [(Z), H, W, 3]
              .reshape([...leadingDims, height, width, 3])
          : (fill([...leadingDims, height, width, 3], 0) as T);

      return res;
    });
  } finally {
    if (disposeImageSlice) imageSlice.dispose();
    if (disposeColors) colors.dispose();
  }
  return tensor;
};

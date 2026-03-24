import type { BitDepth, ColorsRaw } from "@/types";
import { dispose, tidy, type Tensor3D, type Tensor4D } from "@tensorflow/tfjs";
import { Image as IJSImage, Stack as IJSStack, encodeDataURL } from "image-js";
import {
  denormalizeTensor,
  getImageSlice,
  scaleImageTensor,
  sliceVisibleChannels,
} from "./tensorUtils";
import {
  createColorsTensorFromRaw,
  filterVisibleChannels,
  generateColoredTensor,
  sliceVisibleColors,
} from "./channelUtils";
/**
 * Converts an RGB image tensor to a base64-encoded PNG data URL.
 *
 * Denormalizes the tensor to the target bit depth, then uses image-js
 * to produce a PNG data URL without relying on `tf.browser.toPixels`
 * (which forces 8-bit output and inserts unwanted alpha values).
 *
 * @param compositeTensor - Image tensor of shape `[H, W, 3]` or `[Z, H, W, 3]`.
 * @param bitDepth - Target bit depth for the output image (e.g. 8 or 16).
 * @param opts - Optional settings.
 * @param opts.useCanvas - Whether to use an HTML canvas for encoding (default `true`).
 *   Set to `false` for worker / off-screen contexts.
 * @returns A single data URL string for a 3D tensor, or an array of data URL
 *   strings (one per Z-slice) for a 4D tensor.
 */
export async function renderTensor<T extends Tensor3D | Tensor4D>(
  compositeTensor: T,
  bitDepth: BitDepth,
): Promise<T extends Tensor3D ? string : string[]>;
export async function renderTensor(
  compositeTensor: Tensor3D | Tensor4D,
  bitDepth: BitDepth,
): Promise<string | string[]> {
  /*
    tf.browser.toPixels has 2 quirks:
    - it will convert the tensor to the range 0-255,
      which is what we usually want (bc less memory),
      but we can't override it to return 16 bit instead
    - it will insert alpha values (255) when the C dim is 3

    leaving here as reminder of why we're not using it
   */
  // const imageData = await browser.toPixels(compositeTensor);
  const denormalizedImageTensor = denormalizeTensor(compositeTensor, bitDepth);
  const imageData = await denormalizedImageTensor.data();
  denormalizedImageTensor.dispose();

  /*
   DO NOT USE "imageData instanceof Float32Array" here
   tensorflow sublcasses typed arrays, so it will always return false
   Symbol.toStringTag is a getter defined on each typed array prototype
   per the spec (Float32Array.prototype[@@toStringTag] returns "Float32Array").
   Subclasses inherit it, so it works even with tf.js's subclassing.
   And unlike constructor.name, it's a runtime property — not a source-code
   identifier that minifiers can mangle.
  */
  if (imageData[Symbol.toStringTag] !== "Float32Array") {
    throw Error("Tensor data should be stored as Float32Array");
  }

  const shape = compositeTensor.shape as number[];
  const components = shape[shape.length - 1];
  const height = shape[shape.length - 2];
  const width = shape[shape.length - 3];
  const slices = compositeTensor.rank === 4 ? shape[0] : 1;

  const strideLength = height * width * components;
  const imageURLs: string[] = [];
  for (let i = 0; i < slices; i++) {
    const dataArray =
      slices === 1
        ? Uint8Array.from(imageData)
        : Uint8Array.from(
            imageData.slice(i * strideLength, (i + 1) * strideLength),
          );
    const image = new IJSImage(width, height, {
      data: dataArray,
      colorModel: "RGB",
      bitDepth,
    });
    imageURLs.push(encodeDataURL(image, { format: "png" }));
  }
  return slices === 1 ? imageURLs[0] : imageURLs;
}
/**
 * Renders a multi-channel image tensor to a composite RGB data URL.
 *
 * Applies per-channel color mapping and visibility filtering to produce
 * an RGB composite, then delegates to {@link renderTensor} for PNG encoding.
 *
 * @param imageTensor - Raw image tensor of shape `[Z, H, W, C]`.
 * @param colors - Per-channel color, range, and visibility settings.
 * @param channels - Total number of channels in the image.
 * @param bitDepth - Bit depth of the source image data.
 * @param plane - Z-plane index to render. Pass `undefined` to render all planes.
 * @param opts - Optional settings forwarded to {@link renderTensor}.
 * @param opts.useCanvas - Whether to use an HTML canvas for encoding.
 * @returns A single data URL string when `plane` is a number, or an array of
 *   data URL strings (one per Z-plane) when `plane` is `undefined`.
 */
export async function renderImageFromTensor<T extends number | undefined>(
  imageTensor: Tensor4D,
  colors: ColorsRaw,
  channels: number,
  bitDepth: BitDepth,
  plane: T,
): Promise<T extends number ? string : string[]>;
export async function renderImageFromTensor(
  imageTensor: Tensor4D,
  colors: ColorsRaw,
  channels: number,
  bitDepth: BitDepth,
  plane: number | undefined,
) {
  const compositeImage = tidy(() => {
    let operandTensor: Tensor4D | Tensor3D;
    let disposeOperandTensor: boolean;

    if (plane === undefined) {
      operandTensor = imageTensor;
      disposeOperandTensor = false;
    } else {
      // image slice := get z idx 0 of image with dims: [H, W, C]
      operandTensor = getImageSlice(imageTensor, plane);
      disposeOperandTensor = true;
    }

    const colorTensor = createColorsTensorFromRaw(colors, channels);

    // scale each channel by its range
    const scaledImageSlice = scaleImageTensor(operandTensor, colorTensor, {
      disposeImageTensor: disposeOperandTensor,
    });

    // get indices of visible channels, VC
    const visibleChannels = filterVisibleChannels(colorTensor);

    // image slice filtered by visible channels: [H, W, VC] or [Z, H, W, VC]
    const filteredSlice = sliceVisibleChannels(
      scaledImageSlice,
      visibleChannels,
    );

    // color matrix filtered by visible channels: [VC, 3]
    const filteredColors = sliceVisibleColors(colorTensor, visibleChannels);

    // composite image slice: [H, W, 3] or [Z, H, W, 3]
    const compositeImage = generateColoredTensor(filteredSlice, filteredColors);

    return compositeImage;
  });
  const src = await renderTensor(compositeImage, bitDepth);

  dispose(compositeImage);

  return src;
}

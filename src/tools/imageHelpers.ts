import { decodeStack, Stack as IJSStack, Image as IJSImage } from "image-js";
import { ImageShapeEnum, type ImageShapeInfo } from "./types";
import type { TiffImportConfig } from "@/services/DataPipelineService/types";
import { devError } from "@/utils";

// ============================================================
// Image Loading
// ============================================================
export const forceStack = (image: IJSImage | IJSStack): IJSStack => {
  if (image instanceof IJSStack) {
    return image;
  }
  const splitImage = image.split();
  if (image.alpha) {
    return new IJSStack(splitImage.slice(0, splitImage.length - 1));
  }
  return new IJSStack(splitImage);
};

export const getImageInformation = (
  image: IJSImage | IJSStack,
): ImageShapeInfo => {
  if (image instanceof IJSImage) {
    // a "proper" RGB will be an IJSImage object with 3 components
    if (image.components === 3) {
      return {
        shape: ImageShapeEnum.SingleRGBImage,
        components: image.components,
        bitDepth: image.bitDepth,
        alpha: image.alpha,
      };
    }

    // 1 channel (greyscale) image will also be an IJSImage object
    if (image.components === 1) {
      return {
        shape: ImageShapeEnum.GreyScale,
        components: image.components,
        bitDepth: image.bitDepth,
        alpha: image.alpha,
      };
    }
    // should not happen
    devError("Unrecognized Image.JS.Image type, channels not in [1,3]");
    return {
      shape: ImageShapeEnum.InvalidImage,
    };
  } else {
    // else RGBstack, or multi-channel, or multi-z-stack image as an IJSStack object
    if (image.size === 0) {
      devError("Empty image stack");
      return {
        shape: ImageShapeEnum.InvalidImage,
      };
    }

    return {
      shape: ImageShapeEnum.HyperStackImage,
      components: image.size,
      bitDepth: image.bitDepth,
      alpha: image.alpha,
    };
  }
};

/**
 * Load image from ArrayBuffer
 * Returns an image-js Stack (even for single images)
 */
export async function loadImageFromBuffer(
  buffer: ArrayBuffer,
): Promise<ImageShapeInfo & { stack: IJSStack }> {
  const dataArray = new Uint8Array(buffer);

  const image = decodeStack(dataArray);

  const imageInfo = getImageInformation(image);
  console.log(imageInfo);
  const stack = forceStack(image);
  return {
    ...imageInfo,
    stack,
  };
}

export const extractImageDimensionsFromStack = (
  imageStack: IJSStack,
  dimensonSpec: TiffImportConfig,
) => {
  const { dimensionOrder, channels, slices, frames } = dimensonSpec;

  const images: Map<number, Map<number, Map<number, IJSImage>>> = new Map();

  const addToStructure = (t: number, z: number, c: number, data: IJSImage) => {
    if (images.has(t)) {
      const planes = images.get(t)!;
      if (planes.has(z)) {
        const channels = planes.get(z)!;
        if (channels.has(c)) {
          throw new Error("duplicate Channel");
        }
        channels.set(c, data);
      } else {
        planes.set(z, new Map([[c, data]]));
      }
    } else {
      images.set(t, new Map([[z, new Map([[c, data]])]]));
    }
  };
  switch (dimensionOrder) {
    case "xyctz":
      for (let c = 0; c < channels; c++) {
        const cOffset = c * frames * slices;
        for (let t = 0; t < frames; t++) {
          const tOffset = t * slices;
          for (let z = 0; z < slices; z++) {
            // create empty array of expected size
            const index = tOffset + cOffset + z;
            const image = imageStack.getImage(index);
            addToStructure(t, z, c, image);
          }
        }
      }
      break;
    case "xyczt":
      for (let c = 0; c < channels; c++) {
        const cOffset = c * frames * slices;
        for (let z = 0; z < slices; z++) {
          const zOffset = z * frames;
          for (let t = 0; t < frames; t++) {
            // create empty array of expected size
            const index = t + cOffset + zOffset;
            const image = imageStack.getImage(index);
            addToStructure(t, z, c, image);
          }
        }
      }
      break;
    case "xytcz":
      for (let t = 0; t < frames; t++) {
        const tOffset = t * slices * channels;
        for (let c = 0; c < channels; c++) {
          const cOffset = c * slices;
          for (let z = 0; z < slices; z++) {
            // create empty array of expected size
            const index = tOffset + cOffset + z;
            const image = imageStack.getImage(index);
            addToStructure(t, z, c, image);
          }
        }
      }
      break;
    case "xytzc":
      for (let t = 0; t < frames; t++) {
        const tOffset = t * slices * channels;
        for (let z = 0; z < slices; z++) {
          const zOffset = z * channels;
          for (let c = 0; c < channels; c++) {
            // create empty array of expected size
            const index = tOffset + zOffset + c;
            const image = imageStack.getImage(index);
            addToStructure(t, z, c, image);
          }
        }
      }
      break;
    case "xyzct":
      for (let z = 0; z < slices; z++) {
        const zOffset = z * frames * channels;
        for (let c = 0; c < channels; c++) {
          const cOffset = c * frames;
          for (let t = 0; t < frames; t++) {
            // create empty array of expected size
            const index = t + zOffset + cOffset;
            const image = imageStack.getImage(index);
            addToStructure(t, z, c, image);
          }
        }
      }
      break;
    case "xyztc":
      for (let z = 0; z < slices; z++) {
        const zOffset = z * frames * channels;
        for (let t = 0; t < frames; t++) {
          const tOffset = t * channels;
          for (let c = 0; c < channels; c++) {
            // create empty array of expected size
            const index = tOffset + zOffset + c;
            const image = imageStack.getImage(index);
            addToStructure(t, z, c, image);
          }
        }
      }
      break;
  }

  return images;
};

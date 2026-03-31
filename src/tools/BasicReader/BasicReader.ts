import {
  decodeJpeg,
  decodePng,
  Image as IJSImage,
  Stack as IJSStack,
} from "image-js";
import { MIME, type MimeType } from "@/services/DataPipelineService/types";
import type { Shape } from "@/types";

export class BasicReader {
  static async extract(
    fileData: ArrayBuffer,
    mimeType: MimeType,
  ): Promise<{ stack: IJSStack; shape: Shape }> {
    let image: IJSImage;
    const imageData = new Uint8Array(fileData);
    if (mimeType === MIME.JPEG) {
      image = decodeJpeg(imageData);
    } else {
      image = decodePng(imageData);
    }
    return {
      stack: new IJSStack([...image.split()]),
      shape: {
        planes: 1,
        channels: image.channels,
        width: image.width,
        height: image.height,
      },
    };
  }
}

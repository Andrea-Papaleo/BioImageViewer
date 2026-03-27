import { useEffect, useState } from "react";
import { Image as IJSImage, encodeDataURL } from "image-js";
import { StorageService } from "@/services/StorageService";

import { createLUT } from "@/utils";
import type { Channel, ColorMap } from "@/state/types";

export type ChannelWithColors = Channel & {
  colorMap: ColorMap;
  rampMin: number;
  rampMax: number;
};

/**
 * Returns the rendered preview src for an entity.
 *
 * - Legacy path: returns entity.src directly
 * - New pipeline: loads renderedSrc from IndexedDB StoredTensorData
 */
export function useRenderedSrc(channels: ChannelWithColors[]): {
  src: string;
  loading: boolean;
} {
  const [indexedDBSrc, setIndexedDBSrc] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (channels.length === 0) {
      setIndexedDBSrc("");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const storage = StorageService.getInstance();
        const result = await storage.retrieveBatch(
          channels.map((e) => ({
            id: e.storageReference.storageId,
            storeName: e.storageReference.storeName,
          })),
        );
        if (!cancelled && result.success) {
          const { width, height, bitDepth } = result.data.get(
            channels[0].storageReference.storageId,
          )!;

          const pixelCount = width * height;
          const rgbBuffer = new Uint8Array(pixelCount * 3);

          const luts = [...result.data.values()].map(({ buffer }, idx) => {
            const { rampMin, rampMax, colorMap } = channels[idx];
            const lut = createLUT({
              bitDepth,
              colorMap,
              min: rampMin,
              max: rampMax,
            });
            return {
              buffer:
                bitDepth === 8
                  ? new Uint8Array(buffer)
                  : new Uint16Array(buffer),
              lut,
            };
          });
          for (let i = 0; i < pixelCount; i++) {
            let r = 0,
              g = 0,
              b = 0;

            for (const { buffer, lut } of luts) {
              const v = buffer[i];

              r += lut[0][v];
              g += lut[1][v];
              b += lut[2][v];
            }

            rgbBuffer[i * 3 + 0] = Math.min(255, r);
            rgbBuffer[i * 3 + 1] = Math.min(255, g);
            rgbBuffer[i * 3 + 2] = Math.min(255, b);
          }
          const colorImage = new IJSImage(width, height, {
            data: rgbBuffer,
          });
          const url = encodeDataURL(colorImage);
          setIndexedDBSrc(url);
        }
      } catch (error) {
        // Fall back to empty src
        console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [channels]);

  return { src: indexedDBSrc, loading };
}

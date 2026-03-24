import { useEffect, useState } from "react";
import { Image as IJSImage, encodeDataURL } from "image-js";
import { StorageService } from "@/services/StorageService";
import type { StoredItemReference } from "@/services/StorageService";
import type { ChannelColor } from "@/state/types";

type EntityWithOptionalRef = {
  id: string;
  storageReference: StoredItemReference;
  color: ChannelColor;
};

/**
 * Returns the rendered preview src for an entity.
 *
 * - Legacy path: returns entity.src directly
 * - New pipeline: loads renderedSrc from IndexedDB StoredTensorData
 */
export function useRenderedSrc(entity: EntityWithOptionalRef[]): {
  src: string;
  loading: boolean;
} {
  const [indexedDBSrc, setIndexedDBSrc] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (entity.length === 0) {
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
          entity.map((e) => ({
            id: e.storageReference.storageId,
            storeName: e.storageReference.storeName,
          })),
        );
        if (!cancelled && result.success) {
          const { width, height, bitDepth } = result.data.get(
            entity[0].storageReference.storageId,
          )!;
          const maxIntensity = 2 ** bitDepth;
          const pixelCount = width * height;
          const rgbBuffer = new Uint8Array(pixelCount * 3);

          const luts = [...result.data.values()].map(({ buffer }, idx) => {
            const color = entity[idx].color;
            return {
              buffer: new Uint8Array(buffer),
              lut: color.map.map((w) =>
                Uint8Array.from({ length: maxIntensity }, (_, v) => {
                  const min = color.min * maxIntensity;
                  const max = color.max * maxIntensity;
                  const ramped = Math.max(
                    0,
                    Math.min(
                      maxIntensity,
                      ((v - min) / (max - min)) * maxIntensity,
                    ),
                  );
                  return Math.min(maxIntensity, Math.round(ramped * w));
                }),
              ),
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
            bitDepth,
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
  }, [entity]);

  return { src: indexedDBSrc, loading };
}

import { StorageService } from "@/services/StorageService/StorageService";
import type { PreparedChannelData } from "@/services/StorageService/types";
import { STORES, type StoreName } from "@/types";
import { parseError } from "@/utils";
import { useState, useEffect } from "react";

type UsePreparedChannelsResult = {
  channels: PreparedChannelData | null;
  loading: boolean;
  error: Error | null;
};

/**
 * Hook to load prepared channel data from IndexedDB
 *
 * This returns the pre-computed channel data used for measurements,
 * without loading the full tensor.
 *
 * Usage:
 * ```typescript
 * const { channels, loading } = usePreparedChannels(imageId);
 *
 * if (channels) {
 *   / Access channels.data[channelIndex] for pixel values
 *   / Access channels.histograms[channelIndex] for histogram
 * }
 * ```
 */
export function usePreparedChannels(
  id: string | null,
  storeName: StoreName = STORES.IMAGE_DATA,
): UsePreparedChannelsResult {
  const [channels, setChannels] = useState<PreparedChannelData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!id) {
      setChannels(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const loadChannels = async () => {
      setLoading(true);
      setError(null);

      try {
        const storage = StorageService.getInstance();
        const result = await storage.retrievePreparedChannels(id, storeName);

        if (!cancelled) {
          setChannels(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(parseError(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadChannels();

    return () => {
      cancelled = true;
    };
  }, [id, storeName]);

  return { channels, loading, error };
}

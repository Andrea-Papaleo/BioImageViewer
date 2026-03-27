import { StorageService } from "@/services/StorageService";
import { STORES } from "@/types";
import React, { useEffect, useState } from "react";

export const useHistogram = (channelId: string) => {
  const [channelHistogram, setChannelHistogram] = useState<
    { histogram: ArrayBuffer; numPixels: number } | undefined
  >();

  useEffect(() => {
    const load = async (channelId: string) => {
      const storage = StorageService.getInstance();

      const result = await storage.retrieve(channelId, STORES.CHANNEL_DATA);
      if (result.success) {
        const { histogram, width, height } = result.data;
        setChannelHistogram({ histogram, numPixels: width * height });
      }
    };
    load(channelId);
  }, [channelId]);

  return channelHistogram;
};

import { useRenderedSrc } from "@/hooks";
import type { ChannelWithColors } from "@/hooks/useRenderedSrc";
import { selectActiveChannels, selectChannelMetas } from "@/state/selectors";
import { useMemo } from "react";
import { useSelector } from "react-redux";

const ImageViewer = () => {
  const channelMetas = useSelector(selectChannelMetas);
  const activeChannels = useSelector(selectActiveChannels);

  const displayImages = useMemo(() => {
    const displayChannels: ChannelWithColors[] = [];
    activeChannels.forEach((ch) => {
      const chMeta = channelMetas[ch.channelMetaId];
      if (chMeta.visible)
        displayChannels.push({
          ...ch,
          colorMap: chMeta.colorMap,
          rampMin: chMeta.rampMin,
          rampMax: chMeta.rampMax,
        });
    });
    return displayChannels;
  }, [activeChannels, channelMetas]);

  const { src, loading } = useRenderedSrc(displayImages);

  return (
    <div className="w-full flex-1 flex justify-center items-center">
      {!src ? null : loading ? "Loading..." : <img src={src} />}
    </div>
  );
};

export default ImageViewer;

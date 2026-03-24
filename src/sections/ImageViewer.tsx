import { useRenderedSrc } from "@/hooks";
import { selectChannels, selectPlanes } from "@/state/selectors";
import { useMemo } from "react";
import { useSelector } from "react-redux";

const ImageViewer = ({ activeId }: { activeId: string | undefined }) => {
  const channels = useSelector(selectChannels);
  const planes = useSelector(selectPlanes);

  const displayImages = useMemo(() => {
    if (!activeId) return [];
    return planes[activeId].channelIds
      .map((id) => channels[id])
      .filter((ch) => ch.visible);
  }, [channels, planes, activeId]);

  const { src, loading } = useRenderedSrc(displayImages);

  return (
    <div className="w-full flex-1 flex justify-center items-center">
      {!src ? null : loading ? "Loading..." : <img src={src} />}
    </div>
  );
};

export default ImageViewer;

import { ChannelConfig } from "@/components/ChannelConfig";
import { appSlice } from "@/state/appSlice";
import { selectActiveChannels } from "@/state/selectors";

import { DEFAULT_COLORS, rgbToHex } from "@/utils";
import React, { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

export const ChannelConfigurator = () => {
  const activeChannels = useSelector(selectActiveChannels);
  const dispatch = useDispatch();

  const channelColorRef = useRef<{
    el: HTMLDivElement;
    cb: (map: [number, number, number]) => void;
  } | null>(null);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const handleOpenColorPicker = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    channelId: string,
  ) => {
    channelColorRef.current = {
      el: event.currentTarget,
      cb: (map: [number, number, number]) => {
        dispatch(
          appSlice.actions.updateChannelMeta({
            id: channelId,
            changes: { colorMap: map },
          }),
        );
        handleCloseColorPicker();
      },
    };
    setShowColorPicker(true);
  };
  const handleCloseColorPicker = () => {
    channelColorRef.current = null;
    setShowColorPicker(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      <div className="py-2 border-b relative border-slate-700">
        <h3 className="text-md font-bold">Channels</h3>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeChannels.map((channel) => (
          <ChannelConfig
            channel={channel}
            openColorPicker={handleOpenColorPicker}
          />
        ))}
      </div>
      {showColorPicker && channelColorRef.current && (
        <div
          className="absolute  left-0 top-0 w-screen h-screen"
          onClick={handleCloseColorPicker}
        >
          <div
            style={{
              left: channelColorRef.current
                ? channelColorRef.current!.el.offsetLeft + "px"
                : undefined,
              top: channelColorRef.current
                ? channelColorRef.current!.el.offsetTop + "px"
                : undefined,
            }}
            className="absolute bg-slate-800 w-33 flex flex-wrap gap-2 p-2 border border-slate-700 rounded-2xl hover:cursor-pointer"
          >
            {DEFAULT_COLORS.map((c) => (
              <div
                onClick={(e) => {
                  e.stopPropagation();

                  channelColorRef.current!.cb(c);
                }}
                style={{ backgroundColor: rgbToHex(c) }}
                className={` w-8 h-8 border border-white rounded-md`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

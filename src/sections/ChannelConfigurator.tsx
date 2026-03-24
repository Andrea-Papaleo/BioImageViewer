import { appSlice } from "@/state/appSlice";
import { selectChannels, selectPlanes } from "@/state/selectors";
import { DEFAULT_COLORS, rgbToHex } from "@/utils";
import React, { useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

export const ChannelConfigurator = ({
  planeId,
}: {
  planeId: string | undefined;
}) => {
  const dispatch = useDispatch();
  const planes = useSelector(selectPlanes);
  const channels = useSelector(selectChannels);

  const activeChannels = useMemo(() => {
    if (!planeId) return [];
    return planes[planeId].channelIds.map((id) => channels[id]);
  }, [planes, channels, planeId]);
  const channelColorRef = useRef<{
    el: HTMLDivElement;
    cb: (map: [number, number, number]) => void;
  } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const handleCloseColorPicker = () => {
    channelColorRef.current = null;
    setShowColorPicker(false);
  };
  const handleOpenColorPicker = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    channelId: string,
  ) => {
    channelColorRef.current = {
      el: event.currentTarget,
      cb: (map: [number, number, number]) => {
        dispatch(appSlice.actions.setChannelColorMap({ id: channelId, map }));
        handleCloseColorPicker();
      },
    };
    setShowColorPicker(true);
  };
  const handleSetVisibility = (channelId: string, visible: boolean) => {
    dispatch(appSlice.actions.setChannelVisibility({ id: channelId, visible }));
  };

  const handleMinSliderChange = (
    event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>,
    channelId: string,
    max: number,
  ) => {
    console.log(max);
    const newValue = +event.target.value;
    if (newValue >= max) {
      const newMaxValue = newValue + 0.01;
      if (newMaxValue > 1) return;
      dispatch(
        appSlice.actions.setChannelColorRange({
          id: channelId,
          range: { min: newValue, max: newMaxValue },
        }),
      );
      return;
    }
    dispatch(
      appSlice.actions.setChannelColorRange({
        id: channelId,
        range: { min: newValue, max },
      }),
    );
  };
  const handleMaxSliderChange = (
    event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>,
    channelId: string,
    min: number,
  ) => {
    const newValue = +event.target.value;
    if (newValue <= min) {
      const newMinValue = newValue - 0.01;
      if (newMinValue < 0) return;
      dispatch(
        appSlice.actions.setChannelColorRange({
          id: channelId,
          range: { min: newMinValue, max: newValue },
        }),
      );
      return;
    }
    dispatch(
      appSlice.actions.setChannelColorRange({
        id: channelId,
        range: { min, max: newValue },
      }),
    );
  };
  console.log(channelColorRef);
  console.log(showColorPicker);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-md font-bold mb-4">Channels</h3>
      {activeChannels.map((channel) => (
        <div
          key={channel.id}
          className="flex flex-col gap-2 border-b border-slate-700 pb-4 px-4"
        >
          <div className="flex gap-2 items-center">
            <input
              type="checkbox"
              checked={channel.visible}
              onChange={(event) => {
                console.log(event.target.checked);
                const visible = event.target.checked;
                handleSetVisibility(channel.id, visible);
              }}
            ></input>
            <div
              onClick={(e) => handleOpenColorPicker(e, channel.id)}
              style={{ backgroundColor: rgbToHex(channel.color.map) }}
              className={` w-4 h-4 border border-white rounded-md hover:cursor-pointer`}
            />
            {channel.name}
          </div>
          <p className="text-sm font-bold">Min</p>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={channel.color.min}
            onChange={(e) =>
              handleMinSliderChange(e, channel.id, channel.color.max)
            }
          />
          <p className="text-sm font-bold">Max</p>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={channel.color.max}
            onChange={(e) =>
              handleMaxSliderChange(e, channel.id, channel.color.min)
            }
          />
        </div>
      ))}
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

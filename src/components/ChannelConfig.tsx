import { useHistogram } from "@/hooks/useHistogram";
import { appSlice } from "@/state/appSlice";
import { useParamSelector } from "@/state/hooks";
import { selectMetaByChannel } from "@/state/selectors";
import type { Channel } from "@/state/types";
import {
  findAutoIJBins,
  findBestFitBins,
  findBinOfPercentile,
} from "@/tools/histogram/stolen";
import { rgbToHex } from "@/utils";
import { useMemo, useRef, type ChangeEvent } from "react";
import { useDispatch } from "react-redux";

const RANGE_PRESETS = {
  DEFAULT: "Default (50%-90%)",
  IMAGEJ: "ImageJ",
  AUTO1: "0%-100%",
  AUTO2: "10%-90%",
} as const;

type ChannelConfigProps = {
  channel: Channel;
  openColorPicker: (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    channelId: string,
  ) => void;
};
export const ChannelConfig = ({
  channel,
  openColorPicker,
}: ChannelConfigProps) => {
  const dispatch = useDispatch();
  const meta = useParamSelector(selectMetaByChannel, channel.id);
  const previousRampLimits = useRef({
    min: meta.rampMinLimit,
    max: meta.rampMaxLimit,
  });
  const histogram = useHistogram(channel.id);

  const fullRange = useMemo(() => {
    return (
      meta.rampMaxLimit === 2 ** meta.bitDepth - 1 && meta.rampMinLimit === 0
    );
  }, [meta.rampMinLimit, meta.rampMaxLimit, meta.bitDepth]);

  const handleOpenColorPicker = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    openColorPicker(event, meta.id);
  };
  const handleSetVisibility = (visible: boolean) => {
    dispatch(
      appSlice.actions.updateChannelMeta({
        id: meta.id,
        changes: { visible },
      }),
    );
  };

  const handleMinSliderChange = (
    event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>,
  ) => {
    const newValue = +event.target.value;
    let max = meta.rampMax;
    if (newValue >= max) {
      max = newValue + 1;
      if (max > meta.rampMaxLimit) return;
    }

    dispatch(
      appSlice.actions.updateChannelMeta({
        id: meta.id,
        changes: { rampMin: newValue, rampMax: max },
      }),
    );
  };
  const handleMaxSliderChange = (
    event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>,
  ) => {
    const newValue = +event.target.value;
    let min = meta.rampMin;
    if (newValue <= min) {
      min = newValue - 1;
      if (min < meta.rampMinLimit) return;
    }

    dispatch(
      appSlice.actions.updateChannelMeta({
        id: meta.id,
        changes: { rampMax: newValue, rampMin: min },
      }),
    );
  };

  const handleChangeMinLimit = (
    event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>,
  ) => {
    const newMinLim = +event.currentTarget.value;
    dispatch(
      appSlice.actions.updateChannelMeta({
        id: meta.id,
        changes: { rampMinLimit: newMinLim },
      }),
    );
  };
  const handleChangeMaxLimit = (
    event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>,
  ) => {
    const newMaxLim = +event.currentTarget.value;
    dispatch(
      appSlice.actions.updateChannelMeta({
        id: meta.id,
        changes: { rampMaxLimit: newMaxLim },
      }),
    );
  };

  const handleFullRangeToggle = (
    event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>,
  ) => {
    const useMaxLimit = event.currentTarget.checked;
    let newRampMinLimit: number;
    let newRampMaxLimit: number;
    if (useMaxLimit) {
      previousRampLimits.current = {
        min: meta.rampMinLimit,
        max: meta.rampMaxLimit,
      };
      newRampMinLimit = 0;
      newRampMaxLimit = 2 ** channel.bitDepth - 1;
    } else {
      if (previousRampLimits.current) {
        newRampMinLimit = previousRampLimits.current.min;
        newRampMaxLimit = previousRampLimits.current.max;
      } else {
        const [min, max] = findBestFitBins(
          histogram!.histogram,
          histogram!.numPixels,
        );
        newRampMinLimit = min;
        newRampMaxLimit = max;
      }
    }
    dispatch(
      appSlice.actions.updateChannelMeta({
        id: meta.id,
        changes: {
          rampMinLimit: newRampMinLimit,
          rampMaxLimit: newRampMaxLimit,
        },
      }),
    );
  };

  const handleApplyPreset = (event: ChangeEvent<HTMLSelectElement>) => {
    if (!histogram) return;
    const preset = event.currentTarget.value as keyof typeof RANGE_PRESETS;
    let rampMin: number;
    let rampMax: number;
    switch (preset) {
      case "DEFAULT":
        rampMin = findBinOfPercentile(
          histogram.histogram,
          histogram.numPixels,
          0.5,
        );
        rampMax = findBinOfPercentile(
          histogram.histogram,
          histogram.numPixels,
          0.98,
        );
        break;
      case "IMAGEJ":
        const [imjMin, imjMax] = findAutoIJBins(
          histogram.histogram,
          histogram.numPixels,
        );
        rampMin = imjMin;
        rampMax = imjMax;
        break;
      case "AUTO1":
        rampMin = meta.minValue;
        rampMax = meta.maxValue;
        break;
      case "AUTO2":
        const [aMin, aMax] = findBestFitBins(
          histogram.histogram,
          histogram.numPixels,
        );
        rampMin = aMin;
        rampMax = aMax;
    }
    dispatch(
      appSlice.actions.updateChannelMeta({
        id: meta.id,
        changes: { rampMin, rampMax },
      }),
    );
  };
  return (
    <div
      key={meta.id}
      className="flex flex-col gap-2 border-b border-slate-700 pb-4 mb-4 px-4"
    >
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <p className="text-md font-bold text-left ">{meta.name}</p>
        <div className="flex justify-end ">
          <div
            onClick={(e) => handleOpenColorPicker(e)}
            style={{ backgroundColor: rgbToHex(meta.colorMap) }}
            className={` w-4 h-4 border border-white rounded-md hover:cursor-pointer`}
          />
        </div>
        <p className="text-sm font-bold text-left border-b border-dashed border-slate-700 pb-1">
          Visible
        </p>
        <div className="flex  justify-end border-b border-dashed border-slate-700 pb-1">
          <input
            type="checkbox"
            checked={meta.visible}
            onChange={(event) => {
              const visible = event.target.checked;
              handleSetVisibility(visible);
            }}
          />
        </div>
        <p className="text-sm font-bold text-left">Slider Limits</p>
        <div className="flex gap-2 justify-end items-center">
          <div className="flex gap-1">
            <input
              type="number"
              min={meta.minValue}
              max={meta.rampMaxLimit}
              value={meta.rampMinLimit}
              onChange={handleChangeMinLimit}
              className="bg-slate-800 rounded-md pl-1"
            />
            <input
              type="number"
              min={meta.rampMinLimit}
              max={meta.maxValue}
              value={meta.rampMaxLimit}
              onChange={handleChangeMaxLimit}
              className="bg-slate-800 rounded-md pl-1"
            />
          </div>
        </div>
        <p className="text-sm font-bold text-left ">Full Range</p>
        <div className="flex  justify-end ">
          <input
            type="checkbox"
            checked={fullRange}
            onChange={handleFullRangeToggle}
          />
        </div>
        <p className="text-sm font-bold text-left ">Apply Preset</p>
        <div className="flex  justify-end ">
          <select
            value={""}
            onChange={handleApplyPreset}
            className=" bg-slate-800 rounded-md flex items-center"
          >
            <option value="" disabled>
              Presets
            </option>
            {Object.keys(RANGE_PRESETS).map((preset) => (
              <option key={preset} value={preset}>
                {RANGE_PRESETS[preset as keyof typeof RANGE_PRESETS]}
              </option>
            ))}
          </select>
        </div>

        <p className="text-sm font-bold text-left">Min</p>
        <input
          type="range"
          min={meta.rampMinLimit}
          max={meta.rampMaxLimit}
          step={1}
          value={meta.rampMin}
          onChange={(e) => handleMinSliderChange(e)}
          className="flex-1"
        />

        <p className="text-sm font-bold text-left">Max</p>
        <input
          type="range"
          min={meta.rampMinLimit}
          max={meta.rampMaxLimit}
          step={1}
          value={meta.rampMax}
          onChange={(e) => handleMaxSliderChange(e)}
          className="flex-1"
        />
      </div>
    </div>
  );
};

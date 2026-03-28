import type {
  TiffAnalysisResult,
  TiffImportConfig,
} from "@/services/DataPipelineService/types";
import { DimensionOrder } from "@/tools/TiffReader/types";
import { useEffect, useMemo, useState } from "react";

export const TiffConfigurator = ({
  tiffAnalysis,
  updateConfigs,
  updateError,
  index,
  key,
}: {
  tiffAnalysis: TiffAnalysisResult;
  updateConfigs: (config: TiffImportConfig) => void;
  updateError: (error: boolean) => void;
  index: number;
  key: string;
}) => {
  const tiffInfo = tiffAnalysis;

  const [selectedChannels, setSelectedChannels] = useState<
    TiffImportConfig["channels"]
  >(tiffInfo?.OMEDims?.sizec ?? 1);
  const [selectedSlices, setSelectedSlices] = useState<
    TiffImportConfig["slices"]
  >(tiffInfo?.OMEDims?.sizez ?? 1);
  const [selectedFrames, setSelectedFrames] = useState<
    TiffImportConfig["frames"]
  >(tiffInfo?.OMEDims?.sizet ?? 1);
  const [selectedDimensionOrder, setSelectedDimensionOrder] = useState<
    TiffImportConfig["dimensionOrder"]
  >(tiffInfo?.OMEDims?.dimensionorder ?? "xyczt");
  const [overrideTiff, setOverrideTiff] = useState(false);

  const [inputError, setInputError] = useState<string>();

  const containsTiffValues = useMemo(
    () =>
      !!tiffInfo?.OMEDims?.sizec ||
      !!tiffInfo?.OMEDims?.sizet ||
      !!tiffInfo?.OMEDims?.sizez,
    [tiffInfo],
  );

  useEffect(() => {
    if (tiffInfo?.frameCount) {
      if (
        selectedChannels * selectedSlices * selectedFrames !==
        tiffInfo.frameCount
      ) {
        setInputError(
          `C \u00D7 Z \u00D7 T must equal ${tiffInfo.frameCount} frames
          (currently ${selectedChannels} \u00D7 ${selectedSlices} \u00D7 ${selectedFrames} =
           ${selectedChannels * selectedSlices * selectedFrames})`,
        );
        updateError(true);
      } else {
        setInputError(undefined);
        updateError(false);
      }
    }
  }, [selectedChannels, selectedFrames, selectedSlices]);

  useEffect(() => {
    updateConfigs({
      slices: selectedSlices,
      frames: selectedFrames,
      channels: selectedChannels,
      dimensionOrder: selectedDimensionOrder,
    });
  }, [
    selectedChannels,
    selectedDimensionOrder,
    selectedFrames,
    selectedSlices,
  ]);
  return (
    <div key={key} className="p-4 pt-6">
      <details open={index === 0} className="group border-b bg-black/25">
        <summary
          className={`cursor-pointer list-none p-3 font-medium open:border-b flex justify-between ${inputError ? "text-red-500" : ""}`}
        >
          <em>{tiffAnalysis.fileName}</em>
          <span className="group-open:rotate-90 inline-block transition-transform mr-2">
            ▶
          </span>
        </summary>
        <div className="py-3 px-6">
          <div className="mb-2 flex justify-between items-center">
            <p className="mb-4 text-sm">
              Detected <strong>{tiffInfo?.frameCount ?? 0} frames</strong>
            </p>

            <OverrideOption
              disabled={!containsTiffValues}
              canOverride={overrideTiff}
              onChange={() => {
                setOverrideTiff((override) => !override);
                if (overrideTiff) {
                  console.log(tiffInfo?.OMEDims);
                  if (tiffInfo?.OMEDims?.sizet)
                    setSelectedFrames(tiffInfo!.OMEDims!.sizet!);
                  if (tiffInfo?.OMEDims?.sizez)
                    setSelectedSlices(tiffInfo!.OMEDims!.sizez!);
                  if (tiffInfo?.OMEDims?.sizec)
                    setSelectedChannels(tiffInfo!.OMEDims!.sizec!);
                  if (tiffInfo?.OMEDims?.dimensionorder)
                    setSelectedDimensionOrder(
                      tiffInfo!.OMEDims!.dimensionorder!,
                    );
                }
              }}
            />
          </div>

          <hr className="mb-4 border-gray-200 dark:border-gray-700" />

          <div className="grid grid-cols-12 gap-y-4 mb-4">
            {/* Dimension Order */}
            <div className="col-span-12 flex items-center">
              <span className="mr-2 text-sm">Dimension Order:</span>
              <select
                value={selectedDimensionOrder}
                onChange={(e) =>
                  setSelectedDimensionOrder(
                    e.target.value as TiffImportConfig["dimensionOrder"],
                  )
                }
                disabled={!!tiffInfo?.OMEDims?.dimensionorder && !overrideTiff}
                className="min-h-4 rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800"
              >
                {DimensionOrder.map(
                  (order: (typeof DimensionOrder)[number]) => (
                    <option key={`tiff-dimension-order-${order}`} value={order}>
                      {order.toUpperCase()}
                    </option>
                  ),
                )}
              </select>
            </div>

            {/* Channels */}
            <div className="col-span-4 flex items-center">
              <span className="mr-2 text-sm">Channels:</span>
              <input
                type="text"
                value={selectedChannels}
                disabled={
                  tiffInfo?.OMEDims?.sizec !== undefined && !overrideTiff
                }
                onChange={(e) => {
                  if (!Number.isNaN(Number(e.target.value)))
                    setSelectedChannels(Number(e.target.value));
                }}
                className={`w-[7ch] min-h-4 rounded border px-2 py-1 text-sm disabled:opacity-50 dark:bg-gray-800 ${
                  inputError
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              />
            </div>

            {/* Slices */}
            <div className="col-span-4 flex items-center">
              <span className="mr-2 text-sm">Slices:</span>
              <input
                type="text"
                value={selectedSlices}
                disabled={
                  tiffInfo?.OMEDims?.sizez !== undefined && !overrideTiff
                }
                onChange={(e) => {
                  if (!Number.isNaN(Number(e.target.value)))
                    setSelectedSlices(Number(e.target.value));
                }}
                className={`w-[7ch] min-h-4 rounded border px-2 py-1 text-sm disabled:opacity-50 dark:bg-gray-800 ${
                  inputError
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              />
            </div>

            {/* Timepoints */}
            <div className="col-span-4 flex items-center">
              <span className="mr-2 text-sm">Timepoints:</span>
              <input
                type="text"
                value={selectedFrames}
                disabled={
                  tiffInfo?.OMEDims?.sizet !== undefined && !overrideTiff
                }
                onChange={(e) => {
                  if (!Number.isNaN(Number(e.target.value)))
                    setSelectedFrames(Number(e.target.value));
                }}
                className={`w-[7ch] min-h-4 rounded border px-2 py-1 text-sm disabled:opacity-50 dark:bg-gray-800 ${
                  inputError
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              />
            </div>
          </div>
          {inputError && <p className="text-sm text-red-500">{inputError}</p>}
        </div>
      </details>
    </div>
  );
};

const OverrideOption = ({
  disabled,
  canOverride,
  onChange,
}: {
  disabled: boolean;
  canOverride: boolean;
  onChange: () => void;
}) => {
  return (
    <label
      className={`flex items-center gap-2 text-sm ${disabled ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}
    >
      <span>Override tiff defined values?</span>
      <input
        type="checkbox"
        checked={canOverride}
        onChange={onChange}
        disabled={disabled}
        className="h-4 w-4 accent-blue-600"
      />
    </label>
  );
};

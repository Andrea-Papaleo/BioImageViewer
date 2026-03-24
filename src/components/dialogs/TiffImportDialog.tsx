import { useEffect, useMemo, useState } from "react";

import type {
  FileAnalysisResult,
  TiffDialogCallbackResult,
  TiffImportConfig,
} from "@/services/DataPipelineService/types";
import { DimensionOrder } from "@/tools/TiffReader/types";

type TiffImportDialogProps = {
  open: boolean;
  analysisResult: FileAnalysisResult[];
  onConfirm: (config: TiffDialogCallbackResult) => void;
  onCancel: () => void;
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

const TiffConfigurator = ({
  tiffAnalysis,
  updateConfigs,
  updateError,
}: {
  tiffAnalysis: FileAnalysisResult;
  updateConfigs: (config: TiffImportConfig) => void;
  updateError: (error: boolean) => void;
}) => {
  const tiffInfo = tiffAnalysis.tiffInfo;

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
      } else {
        setInputError(undefined);
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
    <div className="p-4 pt-6">
      <details className="group border-b bg-black/25">
        <summary className="cursor-pointer list-none p-3 font-medium open:border-b flex justify-between">
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

export const TiffImportDialog = ({
  open,
  analysisResult,
  onConfirm,
  onCancel,
}: TiffImportDialogProps) => {
  const [configs, setConfigs] = useState<TiffDialogCallbackResult>({});
  const [errors, setErrors] = useState<Record<string, boolean>>(
    analysisResult.reduce((errors: Record<string, boolean>, analysis) => {
      errors[analysis.fileName] = false;
      return errors;
    }, {}),
  );

  const updateTiffConfig = (fileName: string) => {
    return (config: TiffImportConfig) => {
      setConfigs((configs) => Object.assign(configs, { [fileName]: config }));
    };
  };

  const updateTiffConfigErrors = (fileName: string) => {
    return (error: boolean) => {
      setErrors((errors) => ({ ...errors, [fileName]: error }));
    };
  };

  const [inputError, setInputError] = useState<boolean>();

  const handleConfirm = () => {
    onConfirm(configs);
  };

  useEffect(() => {
    if (Object.values(errors).some((error) => error)) {
      setInputError(true);
      return;
    }
    setInputError(false);
  }, [errors]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-150 rounded bg-white shadow-xl dark:bg-gray-900">
        {/* Title */}
        <div className="relative border-b border-gray-200 p-4 dark:border-gray-700">
          <h2 className="text-lg font-medium">Import TIFF Stack</h2>
          <button
            aria-label="Close"
            className="absolute right-2 top-2 p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            onClick={onCancel}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <p className="text-sm">How should these frames be interpreted?</p>
        {analysisResult.map((analysis) => (
          <TiffConfigurator
            tiffAnalysis={analysis}
            updateConfigs={updateTiffConfig(analysis.fileName)}
            updateError={updateTiffConfigErrors(analysis.fileName)}
          />
        ))}

        {/* Actions */}
        <div className="relative flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="rounded px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={inputError}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
};

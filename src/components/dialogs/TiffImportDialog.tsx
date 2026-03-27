import { useEffect, useState } from "react";

import type {
  FileAnalysisResult,
  TiffDialogCallbackResult,
  TiffImportConfig,
} from "@/services/DataPipelineService/types";
import { TiffConfigurator } from "./TiffConfigurator";

type TiffImportDialogProps = {
  open: boolean;
  analysisResult: FileAnalysisResult[];
  onConfirm: (config: TiffDialogCallbackResult) => void;
  onCancel: () => void;
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
        {analysisResult.map((analysis, idx) => (
          <TiffConfigurator
            key={`config-${idx}`}
            tiffAnalysis={analysis}
            updateConfigs={updateTiffConfig(analysis.fileName)}
            updateError={updateTiffConfigErrors(analysis.fileName)}
            index={idx}
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

import { TiffImportDialog } from "@/components/dialogs";
import { useUploadPipeline } from "@/hooks";
import type {
  TiffAnalysisResult,
  TiffDialogCallbackResult,
} from "@/services/DataPipelineService/types";

import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { ImageSelect } from "./ImageSelect";

export const Header = () => {
  const [tiffDialogOpen, setTiffDialogOpen] = useState(false);
  const [pendingTiffAnalysis, setPendingTiffAnalysis] = useState<
    TiffAnalysisResult[] | null
  >(null);
  const tiffResolverRef = useRef<
    ((config: TiffDialogCallbackResult | null) => void) | null
  >(null);
  const handleTiffDialog = useCallback(
    async (
      analysis: TiffAnalysisResult[],
    ): Promise<TiffDialogCallbackResult | null> => {
      return new Promise((resolve) => {
        setPendingTiffAnalysis(analysis);
        tiffResolverRef.current = resolve;
        setTiffDialogOpen(true);
      });
    },
    [],
  );
  const handleConfirmTiffConfig = useCallback(
    (config: TiffDialogCallbackResult) => {
      tiffResolverRef.current?.(config);
      setTiffDialogOpen(false);
      setPendingTiffAnalysis(null);
    },
    [],
  );
  const handleCancelTiffConfig = useCallback(() => {
    tiffResolverRef.current?.(null);
    setTiffDialogOpen(false);
    setPendingTiffAnalysis(null);
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload } = useUploadPipeline();
  const onOpenImage = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.currentTarget.files) return;
    const files: FileList = Object.assign([], event.currentTarget.files);
    event.currentTarget.value = "";

    await upload(files, {
      timeSeries: false,
      timeSeriesDelimiter: "_",
      onTiffDialog: handleTiffDialog,
    });
  };
  return (
    <>
      <div className="w-full h-20 flex justify-between items-center px-2 border-b border-slate-700">
        <button
          className="rounded-2xl p-2 h-8 bg-gray-100 text-gray-800 flex items-center"
          onClick={() => fileInputRef.current?.click()}
        >
          Import
        </button>
        <input
          ref={fileInputRef}
          accept="image/*,.dcm"
          multiple
          id="open-image"
          onChange={onOpenImage}
          type="file"
          hidden
        />
        <div className="w-3/10 flex items-center justify-center">
          <ImageSelect />
        </div>
      </div>
      {pendingTiffAnalysis !== null && (
        <TiffImportDialog
          open={tiffDialogOpen}
          analysisResult={pendingTiffAnalysis}
          onConfirm={handleConfirmTiffConfig}
          onCancel={handleCancelTiffConfig}
        />
      )}
    </>
  );
};

import {
  useGetChunkHighlights,
  useGetDocumentUrl,
} from '@/hooks/use-document-request';
import { usePreviewWatermark } from '@/hooks/use-watermark-request';
import { IModalProps } from '@/interfaces/common';
import { IReferenceChunk } from '@/interfaces/database/chat';
import { IChunk } from '@/interfaces/database/dataset';
import { cn } from '@/lib/utils';
import PdfPreview from '../document-preview/pdf-preview';
import { PreviewWatermark } from '../preview-watermark';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';

interface IProps extends IModalProps<any> {
  documentId: string;
  chunk: IChunk | IReferenceChunk;
  width?: string | number;
  height?: string | number;
}

export const PdfSheet = ({
  hideModal,
  documentId,
  chunk,
  width = '50vw',
  height,
}: IProps) => {
  const getDocumentUrl = useGetDocumentUrl(documentId);
  const url = getDocumentUrl(documentId);
  const { highlights, setWidthAndHeight } = useGetChunkHighlights(chunk);
  const { active, text } = usePreviewWatermark();
  return (
    <Sheet open onOpenChange={hideModal}>
      <SheetContent
        className={cn(`max-w-full`)}
        style={{
          width: width,
          height: height ? height : undefined,
        }}
      >
        <SheetHeader>
          <SheetTitle>Document Previewer</SheetTitle>
        </SheetHeader>
        {url && documentId && (
          <PreviewWatermark active={active} text={text}>
            <PdfPreview
              className={'p-0 !h-[calc(100vh-80px)] w-full'}
              highlights={highlights}
              setWidthAndHeight={setWidthAndHeight}
              url={url}
            ></PdfPreview>
          </PreviewWatermark>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default PdfSheet;

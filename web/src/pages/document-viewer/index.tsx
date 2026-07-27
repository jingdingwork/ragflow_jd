import { Images } from '@/constants/common';
import api, { restAPIv1 } from '@/utils/api';
import request from '@/utils/request';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
// import Docx from './docx';
// import Excel from './excel';
// import Image from './image';
// import Md from './md';
// import Pdf from './pdf';
// import Text from './text';

import { DocPreviewer } from '@/components/document-preview/doc-preview';
import { ExcelCsvPreviewer } from '@/components/document-preview/excel-preview';
import { ImagePreviewer } from '@/components/document-preview/image-preview';
import Md from '@/components/document-preview/md';
import PdfPreview from '@/components/document-preview/pdf-preview';
import { PptPreviewer } from '@/components/document-preview/ppt-preview';
import { TxtPreviewer } from '@/components/document-preview/txt-preview';
import { PreviewWatermark } from '@/components/preview-watermark';
import { usePreviewWatermark } from '@/hooks/use-watermark-request';
import { previewHtmlFile } from '@/utils/file-util';
import { NoSaveGuard } from './no-save-guard';
// import styles from './index.less';

// TODO: The interface returns an incorrect content-type for the SVG.

const DocumentViewer = () => {
  const { id: documentId } = useParams();
  const [currentQueryParameters] = useSearchParams();
  const ext = currentQueryParameters.get('ext');
  const resource =
    currentQueryParameters.get('resource') === 'files' ? 'files' : 'document';
  const previewUrl =
    resource === 'files'
      ? `${restAPIv1}/files/${documentId}`
      : `${restAPIv1}/documents/${documentId}/preview`;
  // request.head

  // Download-restricted KB documents render view-only (no save-as). Files
  // (personal file manager) are never restricted here.
  const { data: downloadDisabled } = useQuery({
    queryKey: ['documentDownloadAllowed', documentId],
    enabled: resource === 'document' && !!documentId,
    queryFn: async () => {
      const { data } = await request.get(
        api.getDocumentDownloadAllowed(documentId!),
      );
      return Boolean(data?.data?.download_disabled);
    },
  });

  const { active: watermarkActive, text: watermarkText } =
    usePreviewWatermark();

  if (ext === 'html' && documentId) {
    previewHtmlFile(documentId, resource);
    return;
  }

  return (
    <NoSaveGuard active={!!downloadDisabled}>
      <PreviewWatermark
        active={watermarkActive}
        text={watermarkText}
        className="w-full h-full"
      >
        <section className="w-full h-full">
          {Images.includes(ext!) && (
            <div className="flex w-full h-full items-center justify-center">
              <ImagePreviewer className="w-full !h-dvh p-5" url={previewUrl} />
            </div>
          )}
          {(ext === 'md' || ext === 'mdx') && (
            <Md url={previewUrl} className="!h-dvh p-5"></Md>
          )}
          {ext === 'txt' && <TxtPreviewer url={previewUrl}></TxtPreviewer>}

          {ext === 'pdf' && (
            <PdfPreview url={previewUrl} className="!h-dvh p-5"></PdfPreview>
          )}
          {(ext === 'xlsx' || ext === 'xls') && (
            <ExcelCsvPreviewer url={previewUrl}></ExcelCsvPreviewer>
          )}

          {ext === 'docx' && <DocPreviewer url={previewUrl}></DocPreviewer>}

          {(ext === 'ppt' || ext === 'pptx') && (
            <PptPreviewer
              url={previewUrl}
              className="!h-dvh p-5"
            ></PptPreviewer>
          )}
        </section>
      </PreviewWatermark>
    </NoSaveGuard>
  );
};

export default DocumentViewer;

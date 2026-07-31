import { UploadFormSchemaType } from '@/components/file-upload-dialog';
import { useSetModalState } from '@/hooks/common-hooks';
import {
  useRunDocument,
  useUploadNextDocument,
} from '@/hooks/use-document-request';
import { useCallback } from 'react';

export const useHandleUploadDocument = () => {
  const {
    visible: documentUploadVisible,
    hideModal: hideDocumentUploadModal,
    showModal: showDocumentUploadModal,
  } = useSetModalState();
  const { uploadDocument, loading, progress, fileErrors } =
    useUploadNextDocument();
  const { runDocumentByIds } = useRunDocument();

  const onDocumentUploadOk = useCallback(
    async ({ fileList, parseOnCreation }: UploadFormSchemaType) => {
      if (fileList.length > 0) {
        const ret = await uploadDocument(fileList);

        // Check for success (code === 0) or partial success (code === 500 with some files)
        const isSuccess = ret?.code === 0;
        const isPartialSuccess = ret?.code === 500 && ret?.message;

        if (!isSuccess && !isPartialSuccess) {
          return;
        }

        if (isSuccess && parseOnCreation) {
          runDocumentByIds({
            documentIds: ret.data.map((x: any) => x.id),
            run: 1,
            shouldDelete: false,
          });
        }

        if (isSuccess) {
          hideDocumentUploadModal();
          return 0;
        }

        // Any failure (code 500): keep the dialog open so the per-file error
        // annotations (e.g. sensitive-word hits) stay visible. Succeeded files
        // are already persisted and pruned from the list by the dialog, so a
        // re-submit only retries the flagged ones.
        return ret?.code;
      }
    },
    [uploadDocument, runDocumentByIds, hideDocumentUploadModal],
  );

  return {
    documentUploadLoading: loading,
    documentUploadProgress: progress,
    documentUploadFileErrors: fileErrors,
    onDocumentUploadOk,
    documentUploadVisible,
    hideDocumentUploadModal,
    showDocumentUploadModal,
  };
};

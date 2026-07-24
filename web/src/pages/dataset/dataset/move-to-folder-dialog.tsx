import { SelectWithSearch } from '@/components/originui/select-with-search';
import { ButtonLoading } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IFolderNode, useMoveDocuments } from '@/hooks/use-folder-request';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type MoveToFolderDialogProps = {
  docIds: string[];
  folders: IFolderNode[];
  hideModal: () => void;
  onMoved?: () => void;
};

export function MoveToFolderDialog({
  docIds,
  folders,
  hideModal,
  onMoved,
}: MoveToFolderDialogProps) {
  const { t } = useTranslation();
  const { moveDocuments, loading } = useMoveDocuments();
  const [target, setTarget] = useState<string>('');

  const options = useMemo(
    () => [
      { label: t('knowledgeDetails.folder.root'), value: '' },
      ...folders
        .map((f) => ({ label: f.path, value: f.path }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [folders, t],
  );

  const onOk = async () => {
    const code = await moveDocuments({ docIds, targetPath: target });
    if (code === 0) {
      onMoved?.();
      hideModal();
    }
  };

  return (
    <Dialog open onOpenChange={hideModal}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('knowledgeDetails.folder.moveTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <span className="text-sm text-text-secondary">
            {t('knowledgeDetails.folder.selectTarget')}
          </span>
          <SelectWithSearch
            value={target}
            onChange={(v: string) => setTarget(v)}
            options={options}
          />
        </div>
        <DialogFooter>
          <ButtonLoading loading={loading} onClick={onOk}>
            {t('common.save')}
          </ButtonLoading>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

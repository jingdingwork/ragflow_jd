import { SelectWithSearch } from '@/components/originui/select-with-search';
import { ButtonLoading } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  IFolderChild,
  parentOfPath,
  useFetchFolders,
  useRenameFolder,
} from '@/hooks/use-folder-request';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type MoveFolderDialogProps = {
  folder: IFolderChild;
  hideModal: () => void;
  onMoved?: () => void;
};

/** Move a whole folder subtree under a different parent. Implemented as a
 * folder rename to `<target>/<name>` (backend rewrites the subtree + docs). */
export function MoveFolderDialog({
  folder,
  hideModal,
  onMoved,
}: MoveFolderDialogProps) {
  const { t } = useTranslation();
  const { folders } = useFetchFolders();
  const { renameFolder, loading } = useRenameFolder();
  const [target, setTarget] = useState<string>('');

  const currentParent = parentOfPath(folder.path);

  // Valid targets: root + every folder that is neither the folder itself, nor
  // one of its descendants (would create a cycle), nor its current parent.
  const options = useMemo(() => {
    const targets = folders
      .filter(
        (f) =>
          f.path !== folder.path &&
          !f.path.startsWith(`${folder.path}/`) &&
          f.path !== currentParent,
      )
      .map((f) => ({ label: f.path, value: f.path }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const root =
      currentParent === ''
        ? []
        : [{ label: t('knowledgeDetails.folder.root'), value: '' }];
    return [...root, ...targets];
  }, [folders, folder.path, currentParent, t]);

  const onOk = async () => {
    const newPath = target ? `${target}/${folder.name}` : folder.name;
    const code = await renameFolder({ oldPath: folder.path, newPath });
    if (code === 0) {
      onMoved?.();
      hideModal();
    }
  };

  return (
    <Dialog open onOpenChange={hideModal}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {t('knowledgeDetails.folder.moveFolderTitle', {
              name: folder.name,
            })}
          </DialogTitle>
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

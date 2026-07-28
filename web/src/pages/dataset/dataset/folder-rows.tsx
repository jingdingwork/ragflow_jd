import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { RenameDialog } from '@/components/rename-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableBody, TableCell, TableRow } from '@/components/ui/table';
import {
  IFolderChild,
  parentOfPath,
  useDeleteFolder,
  useRenameFolder,
} from '@/hooks/use-folder-request';
import { Folder, MoreVertical } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoveFolderDialog } from './move-folder-dialog';

type FolderRowsProps = {
  items: IFolderChild[];
  columnsCount: number;
  onNavigate: (path: string) => void;
  canManage?: boolean;
  // Selecting a folder feeds its files into the batch-operate bar.
  selectedPaths?: string[];
  onToggleSelect?: (path: string, checked: boolean) => void;
};

/** Folder rows rendered as a <TableBody> so they share the document table's
 * header and column frame — Windows-explorer style, folders above files. */
export function FolderRows({
  items,
  columnsCount,
  onNavigate,
  canManage = false,
  selectedPaths = [],
  onToggleSelect,
}: FolderRowsProps) {
  const { t } = useTranslation();
  const { renameFolder, loading: renaming } = useRenameFolder();
  const { deleteFolder } = useDeleteFolder();
  const [renameTarget, setRenameTarget] = useState<IFolderChild | null>(null);
  const [moveTarget, setMoveTarget] = useState<IFolderChild | null>(null);

  if (items.length === 0) return null;

  const onRenameOk = async (name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed || !renameTarget) return;
    const parent = parentOfPath(renameTarget.path);
    const newPath = parent ? `${parent}/${trimmed}` : trimmed;
    const code = await renameFolder({ oldPath: renameTarget.path, newPath });
    if (code === 0) setRenameTarget(null);
  };

  return (
    <>
      <TableBody>
        {items.map((node) => (
          <TableRow
            key={`folder:${node.path}`}
            className="group cursor-pointer"
            onClick={() => onNavigate(node.path)}
            onDoubleClick={() => onNavigate(node.path)}
          >
            <TableCell colSpan={columnsCount}>
              <div className="flex items-center gap-2">
                {canManage && onToggleSelect && (
                  <Checkbox
                    className="shrink-0"
                    checked={selectedPaths.includes(node.path)}
                    disabled={node.total === 0}
                    onCheckedChange={(value) =>
                      onToggleSelect(node.path, !!value)
                    }
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select folder ${node.name}`}
                  />
                )}
                <Folder className="size-4 shrink-0 text-accent-primary" />
                <span
                  className="flex-1 text-sm text-text-primary truncate"
                  title={node.name}
                >
                  {node.name}
                </span>
                <span className="text-xs text-text-secondary shrink-0">
                  {t('knowledgeDetails.folder.itemCount', {
                    count: node.total,
                  })}
                </span>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="shrink-0 opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameTarget(node);
                        }}
                      >
                        {t('knowledgeDetails.folder.rename')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setMoveTarget(node);
                        }}
                      >
                        {t('knowledgeDetails.folder.move')}
                      </DropdownMenuItem>
                      <ConfirmDeleteDialog
                        title={
                          node.total > 0
                            ? t(
                                'knowledgeDetails.folder.deleteWithFilesConfirm',
                                {
                                  count: node.total,
                                },
                              )
                            : t('knowledgeDetails.folder.deleteConfirm')
                        }
                        onOk={() => deleteFolder(node.path)}
                      >
                        <DropdownMenuItem
                          className="text-state-error"
                          onSelect={(e) => e.preventDefault()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t('knowledgeDetails.folder.delete')}
                        </DropdownMenuItem>
                      </ConfirmDeleteDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>

      {renameTarget && (
        <RenameDialog
          hideModal={() => setRenameTarget(null)}
          initialName={renameTarget.name}
          onOk={onRenameOk}
          loading={renaming}
          title={t('knowledgeDetails.folder.rename')}
        />
      )}

      {moveTarget && (
        <MoveFolderDialog
          folder={moveTarget}
          hideModal={() => setMoveTarget(null)}
        />
      )}
    </>
  );
}

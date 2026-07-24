import { RenameDialog } from '@/components/rename-dialog';
import { Button } from '@/components/ui/button';
import { useCreateFolder } from '@/hooks/use-folder-request';
import { cn } from '@/lib/utils';
import { ChevronRight, FolderPlus, Home } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const joinPath = (parent: string, name: string) =>
  parent ? `${parent}/${name}` : name;

type FolderBarProps = {
  currentFolder: string;
  onNavigate: (path: string) => void;
  canManage?: boolean;
};

/** Toolbar above the document table: breadcrumb + new-folder. Subfolders
 * themselves render as rows inside the table (see FolderRows). */
export function FolderBar({
  currentFolder,
  onNavigate,
  canManage = false,
}: FolderBarProps) {
  const { t } = useTranslation();
  const { createFolder, loading: creating } = useCreateFolder();
  const [createOpen, setCreateOpen] = useState(false);

  const crumbs = useMemo(() => {
    if (!currentFolder) return [] as { name: string; path: string }[];
    const parts = currentFolder.split('/');
    return parts.map((name, i) => ({
      name,
      path: parts.slice(0, i + 1).join('/'),
    }));
  }, [currentFolder]);

  const onCreateOk = useCallback(
    async (name: string) => {
      const trimmed = (name || '').trim();
      if (!trimmed) return;
      const code = await createFolder(joinPath(currentFolder, trimmed));
      if (code === 0) setCreateOpen(false);
    },
    [currentFolder, createFolder],
  );

  return (
    <div className="flex items-center justify-between gap-2">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-text-secondary">
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:text-text-primary hover:bg-bg-card',
            !currentFolder && 'text-text-primary',
          )}
          onClick={() => onNavigate('')}
        >
          <Home className="size-3.5" />
          {t('knowledgeDetails.folder.root')}
        </button>
        {crumbs.map((c, i) => (
          <span key={c.path} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3.5 opacity-60" />
            <button
              type="button"
              className={cn(
                'rounded px-1.5 py-0.5 hover:text-text-primary hover:bg-bg-card',
                i === crumbs.length - 1 && 'text-text-primary',
              )}
              onClick={() => onNavigate(c.path)}
            >
              {c.name}
            </button>
          </span>
        ))}
      </nav>

      {canManage && (
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <FolderPlus className="size-4" />
          {t('knowledgeDetails.folder.newFolder')}
        </Button>
      )}

      {createOpen && (
        <RenameDialog
          hideModal={() => setCreateOpen(false)}
          initialName=""
          onOk={onCreateOk}
          loading={creating}
          title={t('knowledgeDetails.folder.newFolder')}
        />
      )}
    </div>
  );
}

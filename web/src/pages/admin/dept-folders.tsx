import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@tanstack/react-query';

import {
  LucideFolderSync,
  LucideHardDriveDownload,
  LucidePlus,
  LucideRefreshCw,
  LucideRotateCw,
  LucideSquarePen,
  LucideTrash2,
} from 'lucide-react';

import Spotlight from '@/components/spotlight';
import { TableEmpty } from '@/components/table-skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import message from '@/components/ui/message';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import {
  DeptFolder,
  deleteDeptFolder,
  listDeptFolders,
  rebuildDeptFolder,
  syncDeptFolder,
} from '@/services/admin-service';

import { DeptFolderFormDialog } from './components/dept-folder-form-dialog';

// TaskStatus (common/constants.py): 0 unstart, 1 running, 2 cancel, 3 done, 4 fail, 5 schedule
const SYNC_STATUS: Record<
  string,
  { key: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  '0': { key: 'admin.syncStatusUnstart', variant: 'outline' },
  '1': { key: 'admin.syncStatusRunning', variant: 'secondary' },
  '2': { key: 'admin.syncStatusCancel', variant: 'destructive' },
  '3': { key: 'admin.syncStatusDone', variant: 'default' },
  '4': { key: 'admin.syncStatusFail', variant: 'destructive' },
  '5': { key: 'admin.syncStatusSchedule', variant: 'secondary' },
};

function AdminDeptFolders() {
  const { t } = useTranslation();
  const [formFolder, setFormFolder] = useState<DeptFolder | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['admin/dept-folders'],
    queryFn: async () => (await listDeptFolders())?.data?.data ?? [],
    // Auto-refresh while any folder is queued ('5') or syncing ('1') so the
    // admin can watch the status and document count progress live.
    refetchInterval: (query) => {
      const list = (query.state.data ?? []) as DeptFolder[];
      const active = list.some(
        (f) => f?.last_sync?.status === '1' || f?.last_sync?.status === '5',
      );
      return active ? 4000 : false;
    },
  });

  const folders = useMemo(() => data ?? [], [data]);

  const deleteMutation = useMutation({
    mutationKey: ['admin/dept-folders/delete'],
    mutationFn: async (id: string) => (await deleteDeptFolder(id))?.data,
    retry: false,
    onSuccess: (res) => {
      if (res?.code === 0) {
        message.success(t('admin.deleteSuccess'));
        refetch();
      }
    },
  });

  const syncMutation = useMutation({
    mutationKey: ['admin/dept-folders/sync'],
    mutationFn: async (id: string) => (await syncDeptFolder(id))?.data,
    retry: false,
    onSuccess: (res) => {
      if (res?.code === 0) {
        message.success(t('admin.deptFolderSyncQueued'));
        refetch();
      }
    },
  });

  const rebuildMutation = useMutation({
    mutationKey: ['admin/dept-folders/rebuild'],
    mutationFn: async (id: string) => (await rebuildDeptFolder(id))?.data,
    retry: false,
    onSuccess: (res) => {
      if (res?.code === 0) {
        message.success(t('admin.deptFolderRebuildQueued'));
        refetch();
      }
    },
  });

  const openCreate = () => {
    setFormFolder(null);
    setFormOpen(true);
  };

  const openEdit = (f: DeptFolder) => {
    setFormFolder(f);
    setFormOpen(true);
  };

  const renderRow = (f: DeptFolder) => {
    const busy =
      (syncMutation.isPending && syncMutation.variables === f.id) ||
      (rebuildMutation.isPending && rebuildMutation.variables === f.id);
    return (
      <TableRow key={f.id}>
        <TableCell className="font-medium">{f.name}</TableCell>
        <TableCell>
          {f.department_name ? (
            <Badge variant="secondary">{f.department_name}</Badge>
          ) : (
            <span className="text-text-secondary">-</span>
          )}
        </TableCell>
        <TableCell className="text-sm">{f.kb_name || '-'}</TableCell>
        <TableCell className="text-xs font-mono text-text-secondary">
          <span className="line-clamp-1 max-w-[16rem]">{f.root_path}</span>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-1">
            {f.last_sync?.status && SYNC_STATUS[f.last_sync.status] ? (
              <Badge variant={SYNC_STATUS[f.last_sync.status].variant}>
                {t(SYNC_STATUS[f.last_sync.status].key)}
              </Badge>
            ) : (
              <Badge variant="outline">
                {t('admin.deptFolderNeverSynced')}
              </Badge>
            )}
            <span className="text-xs text-text-secondary">
              {t('admin.deptFolderDocCount', {
                count: f.last_sync?.total_docs_indexed ?? f.kb_doc_num ?? 0,
              })}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => syncMutation.mutate(f.id)}
              title={t('admin.deptFolderSync')}
            >
              <LucideFolderSync className="size-3.5 mr-1" />
              {t('admin.deptFolderSync')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => rebuildMutation.mutate(f.id)}
              title={t('admin.deptFolderRebuild')}
            >
              <LucideHardDriveDownload className="size-3.5 mr-1" />
              {t('admin.deptFolderRebuild')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => openEdit(f)}>
              <LucideSquarePen className="size-3.5 mr-1" />
              {t('admin.edit')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-500 hover:text-red-600"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(f.id)}
            >
              <LucideTrash2 className="size-3.5 mr-1" />
              {t('admin.delete')}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Card className="!shadow-none relative h-full bg-transparent rounded-xl overflow-hidden">
      <Spotlight />

      <ScrollArea className="size-full">
        <CardHeader className="space-y-0 flex flex-row justify-between items-center">
          <CardTitle>{t('admin.deptFolderManagement')}</CardTitle>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="highlighted" onClick={openCreate}>
              <LucidePlus className="size-4 mr-1" />
              {t('admin.newDeptFolder')}
            </Button>
            <Button
              size="icon-lg"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <LucideRefreshCw
                className={cn('size-4', isFetching && 'animate-spin')}
              />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <p className="text-xs text-text-secondary mb-3 flex items-center gap-1">
            <LucideRotateCw className="size-3.5" />
            {t('admin.deptFolderPageHint')}
          </p>
          <div className="border border-border-default rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.deptFolderName')}</TableHead>
                  <TableHead>{t('admin.deptFolderDepartment')}</TableHead>
                  <TableHead>{t('admin.deptFolderKb')}</TableHead>
                  <TableHead>{t('admin.deptFolderPath')}</TableHead>
                  <TableHead>{t('admin.deptFolderSyncState')}</TableHead>
                  <TableHead className="text-right">
                    {t('admin.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {folders.length > 0 ? (
                  folders.map(renderRow)
                ) : (
                  <TableEmpty columnsLength={6} />
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </ScrollArea>

      <DeptFolderFormDialog
        folder={formFolder}
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setFormFolder(null);
        }}
        onSaved={() => refetch()}
      />
    </Card>
  );
}

export default AdminDeptFolders;

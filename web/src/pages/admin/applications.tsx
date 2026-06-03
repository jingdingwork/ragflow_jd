import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@tanstack/react-query';

import {
  LucideAppWindow,
  LucidePackage,
  LucidePlus,
  LucideRefreshCw,
  LucideSettings2,
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
  Application,
  deleteApplication,
  listApplications,
} from '@/services/admin-service';

import { ApplicationFormDialog } from './components/application-form-dialog';
import { ApplicationVersionDialog } from './components/application-version-dialog';

function AdminApplications() {
  const { t } = useTranslation();
  const [formApp, setFormApp] = useState<Application | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [versionApp, setVersionApp] = useState<Application | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['admin/applications'],
    queryFn: async () => {
      const res = await listApplications();
      return res?.data?.data ?? [];
    },
  });

  const apps = useMemo(() => data ?? [], [data]);
  const webApps = useMemo(
    () => apps.filter((a) => a.app_type === 'web'),
    [apps],
  );
  const exeApps = useMemo(
    () => apps.filter((a) => a.app_type === 'exe'),
    [apps],
  );

  const deleteMutation = useMutation({
    mutationKey: ['admin/applications/delete'],
    mutationFn: async (id: string) => {
      const res = await deleteApplication(id);
      return res?.data;
    },
    retry: false,
    onSuccess: (res) => {
      if (res?.code === 0) {
        message.success(t('admin.deleteSuccess'));
        refetch();
      }
    },
  });

  const openCreate = () => {
    setFormApp(null);
    setFormOpen(true);
  };

  const openEdit = (app: Application) => {
    setFormApp(app);
    setFormOpen(true);
  };

  const openVersions = (app: Application) => {
    setVersionApp(app);
    setVersionOpen(true);
  };

  const renderRow = (app: Application) => (
    <TableRow key={app.id}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {app.app_type === 'exe' ? (
            <LucidePackage className="size-4 opacity-70" />
          ) : (
            <LucideAppWindow className="size-4 opacity-70" />
          )}
          <span>{app.name}</span>
        </div>
        {app.description && (
          <div className="text-xs text-text-secondary mt-0.5 truncate max-w-xs">
            {app.description}
          </div>
        )}
      </TableCell>
      <TableCell>
        {app.visibility === 'all'
          ? t('admin.appVisibilityAll')
          : t('admin.appVisibilityDept')}
      </TableCell>
      <TableCell className="text-sm text-text-secondary">
        {app.app_type === 'web' ? (
          <span className="truncate max-w-xs inline-block align-bottom">
            {app.url || '-'}
          </span>
        ) : (
          <span>
            {t('admin.appVersionSummary', {
              count: app.version_count,
              latest: app.latest_version || '-',
            })}
          </span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={app.status === '1' ? 'default' : 'secondary'}>
          {app.status === '1' ? t('admin.appOnShelf') : t('admin.appOffShelf')}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {app.app_type === 'exe' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openVersions(app)}
            >
              <LucideSettings2 className="size-3.5 mr-1" />
              {t('admin.versionManagement')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => openEdit(app)}>
            <LucideSquarePen className="size-3.5 mr-1" />
            {t('admin.edit')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-500 hover:text-red-600"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(app.id)}
          >
            <LucideTrash2 className="size-3.5 mr-1" />
            {t('admin.delete')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  const renderSection = (
    title: string,
    Icon: typeof LucideAppWindow,
    list: Application[],
  ) => (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="size-5 text-accent-primary" />
        <h2 className="text-base font-semibold">{title}</h2>
        <Badge variant="secondary">{list.length}</Badge>
      </div>
      <div className="border border-border-default rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.appName')}</TableHead>
              <TableHead>{t('admin.appVisibility')}</TableHead>
              <TableHead>{t('admin.appWebOrVersion')}</TableHead>
              <TableHead>{t('admin.status')}</TableHead>
              <TableHead className="text-right">{t('admin.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length > 0 ? (
              list.map(renderRow)
            ) : (
              <TableEmpty columnsLength={5} />
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <Card className="!shadow-none relative h-full bg-transparent rounded-xl overflow-hidden">
      <Spotlight />

      <ScrollArea className="size-full">
        <CardHeader className="space-y-0 flex flex-row justify-between items-center">
          <CardTitle>{t('admin.applications')}</CardTitle>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="highlighted" onClick={openCreate}>
              <LucidePlus className="size-4 mr-1" />
              {t('admin.newApplication')}
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

        <CardContent className="space-y-6">
          {renderSection(t('admin.webApps'), LucideAppWindow, webApps)}
          {renderSection(t('admin.exeApps'), LucidePackage, exeApps)}
        </CardContent>
      </ScrollArea>

      <ApplicationFormDialog
        application={formApp}
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setFormApp(null);
        }}
        onSaved={() => refetch()}
      />

      <ApplicationVersionDialog
        applicationId={versionApp?.id ?? null}
        applicationName={versionApp?.name ?? ''}
        open={versionOpen}
        onOpenChange={(o) => {
          setVersionOpen(o);
          if (!o) setVersionApp(null);
        }}
        onSaved={() => refetch()}
      />
    </Card>
  );
}

export default AdminApplications;

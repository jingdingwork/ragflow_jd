import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useQuery } from '@tanstack/react-query';

import { LucideAppWindow, LucideDownload, LucidePackage } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import message from '@/components/ui/message';
import { Routes } from '@/routes';

import {
  UserApplication,
  downloadApplicationPackage,
  getMyApplications,
} from '@/services/application-service';

function ApplicationsPortal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['my-applications'],
    queryFn: async () => {
      const res = await getMyApplications();
      return (res?.data?.data ?? []) as UserApplication[];
    },
  });

  const apps = useMemo(() => data ?? [], [data]);

  const handleOpen = async (app: UserApplication) => {
    if (app.app_type === 'web') {
      navigate(`${Routes.AppView}/${app.id}`);
      return;
    }
    // exe: download the latest package
    if (!app.latest_version) {
      message.warning(t('applications.noPackage'));
      return;
    }
    try {
      setDownloadingId(app.id);
      await downloadApplicationPackage(
        app.id,
        app.latest_version.file_name ?? `${app.name}.exe`,
        app.latest_version.id,
      );
    } catch {
      message.error(t('applications.downloadFailed'));
    } finally {
      setDownloadingId(null);
    }
  };

  const webApps = useMemo(
    () => apps.filter((a) => a.app_type === 'web'),
    [apps],
  );
  const exeApps = useMemo(
    () => apps.filter((a) => a.app_type === 'exe'),
    [apps],
  );

  const renderCard = (app: UserApplication) => (
    <Card
      key={app.id}
      className="hover:border-accent-primary transition-colors"
    >
      <CardContent className="p-4 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-2">
          {app.icon ? (
            <img
              src={app.icon}
              alt=""
              className="size-8 rounded object-cover"
            />
          ) : app.app_type === 'exe' ? (
            <LucidePackage className="size-8 opacity-70" />
          ) : (
            <LucideAppWindow className="size-8 opacity-70" />
          )}
          <span className="font-medium truncate flex-1">{app.name}</span>
          {app.app_type === 'exe' && app.latest_version && (
            <Badge variant="secondary">{app.latest_version.version}</Badge>
          )}
        </div>
        <p className="text-sm text-text-secondary line-clamp-3 flex-1 min-h-[2.5rem]">
          {app.description || '-'}
        </p>
        <Button
          className="mt-4 w-full"
          variant={app.app_type === 'web' ? 'highlighted' : 'outline'}
          disabled={downloadingId === app.id}
          onClick={() => handleOpen(app)}
        >
          {app.app_type === 'web' ? (
            <>
              <LucideAppWindow className="size-4 mr-1" />
              {t('applications.open')}
            </>
          ) : (
            <>
              <LucideDownload className="size-4 mr-1" />
              {downloadingId === app.id
                ? t('applications.downloading')
                : t('applications.download')}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );

  const renderSection = (
    title: string,
    Icon: typeof LucideAppWindow,
    list: UserApplication[],
  ) => {
    if (list.length === 0) return null;
    return (
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Icon className="size-5 text-accent-primary" />
          <h2 className="text-lg font-semibold">{title}</h2>
          <Badge variant="secondary">{list.length}</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {list.map(renderCard)}
        </div>
      </div>
    );
  };

  return (
    <section className="size-full p-6 overflow-auto">
      <h1 className="text-2xl font-bold mb-6">{t('header.apps')}</h1>

      {isLoading ? (
        <div className="text-text-secondary text-sm">
          {t('applications.loading')}
        </div>
      ) : apps.length === 0 ? (
        <div className="text-text-secondary text-sm">
          {t('applications.empty')}
        </div>
      ) : (
        <>
          {renderSection(
            t('applications.webSection'),
            LucideAppWindow,
            webApps,
          )}
          {renderSection(t('applications.exeSection'), LucidePackage, exeApps)}
        </>
      )}
    </section>
  );
}

export default ApplicationsPortal;

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { useQuery } from '@tanstack/react-query';

import { LucideArrowLeft, LucideExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Routes } from '@/routes';

import {
  UserApplication,
  getMyApplications,
} from '@/services/application-service';

function AppView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [blocked, setBlocked] = useState(false);
  const loadedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data } = useQuery({
    queryKey: ['my-applications'],
    queryFn: async () => {
      const res = await getMyApplications();
      return (res?.data?.data ?? []) as UserApplication[];
    },
  });

  const app = useMemo(
    () => (data ?? []).find((a) => a.id === id) ?? null,
    [data, id],
  );

  const url = app?.url ?? '';

  // If the iframe doesn't finish loading within a few seconds, assume it was
  // blocked by X-Frame-Options / CSP and offer to open it in a new tab.
  useEffect(() => {
    loadedRef.current = false;
    setBlocked(false);
    if (!url) return;
    timerRef.current = setTimeout(() => {
      if (!loadedRef.current) setBlocked(true);
    }, 4000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [url]);

  const openNewTab = () => {
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <section className="size-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-default">
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(Routes.Apps)}
        >
          <LucideArrowLeft className="size-4 mr-1" />
          {t('applications.back')}
        </Button>
        <span className="font-medium truncate">{app?.name}</span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={openNewTab}
        >
          <LucideExternalLink className="size-4 mr-1" />
          {t('applications.openNewTab')}
        </Button>
      </div>

      <div className="flex-1 min-h-0 relative">
        {blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg-base z-10">
            <p className="text-text-secondary text-sm">
              {t('applications.embedBlocked')}
            </p>
            <Button variant="highlighted" onClick={openNewTab}>
              <LucideExternalLink className="size-4 mr-1" />
              {t('applications.openNewTab')}
            </Button>
          </div>
        )}
        {url && (
          <iframe
            title={app?.name ?? 'application'}
            src={url}
            className="size-full border-0"
            onLoad={() => {
              loadedRef.current = true;
              setBlocked(false);
            }}
          />
        )}
      </div>
    </section>
  );
}

export default AppView;

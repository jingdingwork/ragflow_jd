import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@tanstack/react-query';

import { Button, ButtonLoading } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import message from '@/components/ui/message';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';

import {
  DepartmentLlmModel,
  getUserLlm,
  saveUserLlm,
} from '@/services/admin-service';

type Props = {
  email: string | null;
  nickname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

export function UserLlmDialog({
  email,
  nickname,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [apiBase, setApiBase] = useState('');
  const [hasToken, setHasToken] = useState(true);
  const [models, setModels] = useState<DepartmentLlmModel[]>([]);

  useEffect(() => {
    if (!open || !email) return;
    setApiBase('');
    setHasToken(true);
    setModels([]);
    getUserLlm(email).then((res) => {
      const cfg = res?.data?.data;
      if (cfg) {
        setApiBase(cfg.api_base ?? '');
        setHasToken(!!cfg.has_token);
        setModels(cfg.models ?? []);
      }
    });
  }, [open, email]);

  const saveMutation = useMutation({
    mutationKey: ['admin/users/save-llm'],
    mutationFn: async () => {
      if (!email) return;
      const res = await saveUserLlm(email, { models });
      return res?.data;
    },
    onSuccess: (data) => {
      if (data?.code === 0) {
        message.success(t('admin.saveSuccess'));
        onSaved?.();
        onOpenChange(false);
      }
    },
    retry: false,
  });

  const toggleModel = (name: string, enabled: boolean) =>
    setModels((prev) =>
      prev.map((m) => (m.llm_name === name ? { ...m, enabled } : m)),
    );

  const enabledCount = useMemo(
    () => models.filter((m) => m.enabled).length,
    [models],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t('admin.userLlmConfig')} · {nickname || email}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {!hasToken && (
            <div className="text-text-secondary text-sm bg-bg-card rounded-md px-3 py-2">
              {t('admin.userLlmNoDeptToken')}
            </div>
          )}
          {apiBase && (
            <div className="text-text-secondary text-xs truncate">
              {t('admin.modelApiBase')}: {apiBase}
            </div>
          )}

          <div className="flex items-center justify-end">
            <span className="text-text-secondary text-sm">
              {t('admin.modelsEnabledCount', {
                enabled: enabledCount,
                total: models.length,
              })}
            </span>
          </div>

          <ScrollArea className="h-64 border border-border-default rounded-lg">
            {models.length === 0 ? (
              <div className="text-text-secondary text-sm p-4 text-center">
                {t('admin.noModelsAvailable')}
              </div>
            ) : (
              <ul className="divide-y divide-border-default">
                {models.map((m) => (
                  <li
                    key={m.llm_name}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <span className="truncate mr-3 text-sm">{m.llm_name}</span>
                    <Switch
                      checked={m.enabled}
                      onCheckedChange={(v) => toggleModel(m.llm_name, v)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.cancel')}
          </Button>
          <ButtonLoading
            variant="highlighted"
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t('admin.save')}
          </ButtonLoading>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UserLlmDialog;

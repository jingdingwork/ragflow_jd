import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@tanstack/react-query';

import { LucideDownloadCloud } from 'lucide-react';

import { Button, ButtonLoading } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import message from '@/components/ui/message';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';

import {
  DepartmentLlmModel,
  fetchDepartmentModels,
  getDepartmentLlm,
  saveDepartmentLlm,
} from '@/services/admin-service';

type Props = {
  departmentId: string | null;
  departmentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

export function DepartmentLlmDialog({
  departmentId,
  departmentName,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<DepartmentLlmModel[]>([]);

  // Load saved config whenever the dialog opens for a department
  useEffect(() => {
    if (!open || !departmentId) return;
    setApiBase('');
    setApiKey('');
    setModels([]);
    getDepartmentLlm(departmentId).then((res) => {
      const cfg = res?.data?.data;
      if (cfg) {
        setApiBase(cfg.api_base ?? '');
        setApiKey(cfg.api_key ?? '');
        setModels(cfg.models ?? []);
      }
    });
  }, [open, departmentId]);

  const fetchMutation = useMutation({
    mutationKey: ['admin/departments/fetch-models'],
    mutationFn: async () => {
      const res = await fetchDepartmentModels({
        api_base: apiBase,
        api_key: apiKey,
      });
      return res?.data?.data ?? [];
    },
    onSuccess: (names: string[]) => {
      // Preserve existing enabled flags; new models default to enabled
      const prev = new Map(models.map((m) => [m.llm_name, m.enabled]));
      setModels(
        names.map((name) => ({
          llm_name: name,
          enabled: prev.get(name) ?? true,
        })),
      );
      message.success(t('admin.fetchModelsResult', { count: names.length }));
    },
    retry: false,
  });

  const saveMutation = useMutation({
    mutationKey: ['admin/departments/save-llm'],
    mutationFn: async () => {
      if (!departmentId) return;
      const res = await saveDepartmentLlm(departmentId, {
        api_base: apiBase,
        api_key: apiKey,
        models,
      });
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

  const toggleModel = (name: string, enabled: boolean) => {
    setModels((prev) =>
      prev.map((m) => (m.llm_name === name ? { ...m, enabled } : m)),
    );
  };

  const enabledCount = useMemo(
    () => models.filter((m) => m.enabled).length,
    [models],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('admin.departmentLlmConfig')} · {departmentName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>
              {t('admin.modelApiBase')} <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="https://your-provider.com/v1"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('admin.modelApiKey')}</Label>
            <Input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <ButtonLoading
              variant="outline"
              size="sm"
              loading={fetchMutation.isPending}
              disabled={!apiBase}
              onClick={() => fetchMutation.mutate()}
            >
              <LucideDownloadCloud className="size-4 mr-1" />
              {t('admin.fetchModels')}
            </ButtonLoading>
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
                {t('admin.noModelsFetched')}
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

export default DepartmentLlmDialog;

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@tanstack/react-query';

import { LucideX } from 'lucide-react';

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
import { cn } from '@/lib/utils';

import {
  MODEL_CAPABILITIES,
  MODEL_CAPABILITY_I18N,
  ModelCapability,
  ModelCatalogItem,
  WebSearchTestResult,
  createModelCatalog,
  testModelWebSearch,
  updateModelCatalog,
} from '@/services/admin-service';

type Props = {
  item: ModelCatalogItem | null; // null => create
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

export function ModelCatalogDialog({
  item,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [capabilities, setCapabilities] = useState<ModelCapability[]>([]);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [testResult, setTestResult] = useState<WebSearchTestResult | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    setName(item?.llm_name ?? '');
    setCapabilities(item?.capabilities ?? []);
    setCustomTags(item?.custom_tags ?? []);
    setTagInput('');
    setTestResult(null);
  }, [open, item]);

  const testMutation = useMutation({
    mutationKey: ['admin/model-catalog/web-search-test', name],
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) {
        message.warning(t('admin.modelCatalogName'));
        return null;
      }
      const res = await testModelWebSearch(trimmed);
      return (res?.data?.data ?? null) as WebSearchTestResult | null;
    },
    onSuccess: (data) => {
      if (data) setTestResult(data);
    },
    retry: false,
  });

  const toggleCapability = (cap: ModelCapability) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  };

  const addTag = () => {
    const v = tagInput.trim();
    if (!v) return;
    setCustomTags((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setTagInput('');
  };

  const removeTag = (tag: string) =>
    setCustomTags((prev) => prev.filter((tp) => tp !== tag));

  const saveMutation = useMutation({
    mutationKey: ['admin/model-catalog/save', item?.id],
    mutationFn: async () => {
      const payload = {
        llm_name: name.trim(),
        capabilities,
        custom_tags: customTags,
      };
      const res = item
        ? await updateModelCatalog(item.id, payload)
        : await createModelCatalog(payload);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {item ? t('admin.modelCatalogEdit') : t('admin.modelCatalogAdd')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>
              {t('admin.modelCatalogName')}{' '}
              <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="Qwen3-4B"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('admin.modelCapabilities')}</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {MODEL_CAPABILITIES.map((cap) => {
                const on = capabilities.includes(cap);
                return (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => toggleCapability(cap)}
                    className={cn(
                      'px-2.5 py-1 rounded text-sm border transition-colors',
                      on
                        ? 'border-accent-primary text-accent-primary bg-accent-primary/10'
                        : 'border-border-default text-text-secondary hover:text-text-primary',
                    )}
                  >
                    {t(MODEL_CAPABILITY_I18N[cap])}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testMutation.isPending || !name.trim()}
                onClick={() => testMutation.mutate()}
              >
                {testMutation.isPending
                  ? t('admin.webSearchTesting')
                  : t('admin.webSearchTest')}
              </Button>
              {testResult && (
                <span
                  className={cn(
                    'text-sm font-medium',
                    testResult.supported ? 'text-green-600' : 'text-red-500',
                  )}
                >
                  {testResult.supported
                    ? t('admin.webSearchSupported')
                    : t('admin.webSearchUnsupported')}
                </span>
              )}
            </div>
            {testResult && (
              <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border-default bg-bg-card p-3 text-sm text-text-secondary">
                {testResult.answer}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('admin.modelCustomTags')}</Label>
            <div className="flex gap-2">
              <Input
                placeholder={t('admin.modelCustomTagsPlaceholder')}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addTag}>
                {t('admin.add')}
              </Button>
            </div>
            {customTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {customTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-border-default text-text-primary"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-text-secondary hover:text-text-primary"
                    >
                      <LucideX className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.cancel')}
          </Button>
          <ButtonLoading
            variant="highlighted"
            loading={saveMutation.isPending}
            disabled={!name.trim()}
            onClick={() => saveMutation.mutate()}
          >
            {t('admin.save')}
          </ButtonLoading>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ModelCatalogDialog;

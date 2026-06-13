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
import { RAGFlowSelect } from '@/components/ui/select';

import {
  GlobalModelType,
  fetchGlobalModels,
  getGlobalLlm,
  saveGlobalLlm,
} from '@/services/admin-service';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

// Auxiliary types the global config governs (no chat/LLM). The i18n key resolves
// to a friendly label (Embedding / VLM / ASR / Rerank / TTS).
const GLOBAL_TYPES: { type: GlobalModelType; label: string }[] = [
  { type: 'embedding', label: 'admin.modelTypeEmbedding' },
  { type: 'image2text', label: 'admin.modelTypeImage2text' },
  { type: 'speech2text', label: 'admin.modelTypeSpeech2text' },
  { type: 'rerank', label: 'admin.modelTypeRerank' },
  { type: 'tts', label: 'admin.modelTypeTts' },
];

const emptyModels: Record<GlobalModelType, string> = {
  embedding: '',
  rerank: '',
  image2text: '',
  speech2text: '',
  tts: '',
};

export function GlobalLlmDialog({ open, onOpenChange, onSaved }: Props) {
  const { t } = useTranslation();
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [models, setModels] =
    useState<Record<GlobalModelType, string>>(emptyModels);

  useEffect(() => {
    if (!open) return;
    setApiBase('');
    setApiKey('');
    setNames([]);
    setModels(emptyModels);
    getGlobalLlm().then((res) => {
      const cfg = res?.data?.data;
      if (cfg) {
        setApiBase(cfg.api_base ?? '');
        setApiKey(cfg.api_key ?? '');
        setModels({ ...emptyModels, ...(cfg.models ?? {}) });
      }
    });
  }, [open]);

  const fetchMutation = useMutation({
    mutationKey: ['admin/global-llm/fetch-models'],
    mutationFn: async () => {
      const res = await fetchGlobalModels({
        api_base: apiBase,
        api_key: apiKey,
      });
      return res?.data?.data ?? [];
    },
    onSuccess: (fetched: string[]) => {
      setNames(fetched);
      message.success(t('admin.fetchModelsResult', { count: fetched.length }));
    },
    retry: false,
  });

  const saveMutation = useMutation({
    mutationKey: ['admin/global-llm/save'],
    mutationFn: async () => {
      const res = await saveGlobalLlm({
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

  // Options = fetched names unioned with any already-selected name, so a saved
  // selection stays visible before the list is (re)fetched.
  const optionsFor = useMemo(() => {
    return (selected: string) => {
      const all = new Set(names);
      if (selected) all.add(selected);
      return Array.from(all)
        .sort()
        .map((n) => ({ value: n, label: n }));
    };
  }, [names]);

  const setModel = (type: GlobalModelType, value: string) =>
    setModels((prev) => ({ ...prev, [type]: value || '' }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('admin.globalLlmConfig')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-text-secondary text-sm">
            {t('admin.globalLlmDescription')}
          </p>

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

          <div className="space-y-3 border border-border-default rounded-lg p-4">
            {GLOBAL_TYPES.map(({ type, label }) => (
              <div key={type} className="flex items-center gap-3">
                <Label className="w-24 shrink-0">{t(label)}</Label>
                <RAGFlowSelect
                  value={models[type]}
                  options={optionsFor(models[type])}
                  allowClear
                  onChange={(v) => setModel(type, v ?? '')}
                  placeholder={t('admin.globalLlmSelectPlaceholder')}
                  triggerClassName="flex-1"
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.cancel')}
          </Button>
          <ButtonLoading
            variant="highlighted"
            loading={saveMutation.isPending}
            disabled={!apiBase}
            onClick={() => saveMutation.mutate()}
          >
            {t('admin.save')}
          </ButtonLoading>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default GlobalLlmDialog;

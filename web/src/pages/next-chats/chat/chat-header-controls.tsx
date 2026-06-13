import { SelectWithSearch } from '@/components/originui/select-with-search';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { LlmModelType } from '@/constants/knowledge';
import { useFetchChat, usePatchChat } from '@/hooks/use-chat-request';
import { useFetchKnowledgeList } from '@/hooks/use-knowledge-request';
import { useComposeLlmOptionsByModelTypes } from '@/hooks/use-llm-request';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Library } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

// Knowledge-base scope dropdown. Selections are applied (saved) when the popover
// closes, so toggling several KBs is one save instead of one per click.
function ChatKbSelect({
  value,
  options,
  onApply,
}: {
  value: string[];
  options: { label: string; value: string }[];
  onApply: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<string[]>(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const toggle = useCallback((id: string) => {
    setLocal((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && !sameSet(local, value)) {
        onApply(local);
      }
    },
    [local, value, onApply],
  );

  const label = useMemo(() => {
    if (value.length === 0) return t('chat.noKnowledgeBound');
    if (value.length === 1) {
      return (
        options.find((o) => o.value === value[0])?.label ??
        t('chat.knowledgeCount', { count: 1 })
      );
    }
    return t('chat.knowledgeCount', { count: value.length });
  }, [value, options, t]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 gap-2 px-3 font-normal bg-bg-input border-border-button max-w-[220px]"
        >
          <Library className="size-4 text-accent-primary shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 text-text-secondary shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={t('chat.selectKnowledgeBases')} />
          <CommandList>
            <CommandEmpty>{t('chat.noKnowledgeBase')}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const checked = local.includes(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    onSelect={() => toggle(opt.value)}
                    className="cursor-pointer"
                  >
                    <div
                      className={cn(
                        'mr-2 flex size-4 items-center justify-center rounded-sm border border-accent-primary',
                        checked
                          ? 'bg-accent-primary text-white'
                          : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className="size-3" />
                    </div>
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Quick model + knowledge-base controls shown in the chat header (top-right), so
 * the user can switch the chat model and retrieval scope without opening the
 * settings panel or the multiple-models view. Both persist to the dialog.
 */
export function ChatHeaderControls() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { data } = useFetchChat();
  const { patchChat } = usePatchChat();

  const modelOptions = useComposeLlmOptionsByModelTypes([LlmModelType.Chat]);
  // Only knowledge bases with parsed chunks are bindable for retrieval.
  const { list } = useFetchKnowledgeList(true);
  const kbOptions = useMemo(
    () => list.map((k) => ({ label: k.name, value: k.id })),
    [list],
  );

  const selectedKbIds = useMemo(
    () => data.dataset_ids ?? [],
    [data.dataset_ids],
  );

  const handleModelChange = useCallback(
    (llm_id: string) => {
      if (!id || !llm_id || llm_id === data.llm_id) return;
      patchChat({ chatId: id, params: { llm_id } });
    },
    [id, data.llm_id, patchChat],
  );

  const handleKbApply = useCallback(
    (ids: string[]) => {
      if (!id) return;
      patchChat({ chatId: id, params: { dataset_ids: ids } });
    },
    [id, patchChat],
  );

  return (
    <div className="flex items-center gap-2">
      <SelectWithSearch
        value={data.llm_id}
        onChange={handleModelChange}
        options={modelOptions as any}
        placeholder={t('chat.model')}
        triggerClassName="h-9 w-[200px]"
      />
      <ChatKbSelect
        value={selectedKbIds}
        options={kbOptions}
        onApply={handleKbApply}
      />
    </div>
  );
}

export default ChatHeaderControls;

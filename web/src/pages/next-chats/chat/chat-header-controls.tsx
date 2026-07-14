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
import { AgentCategory } from '@/constants/agent';
import { LlmModelType } from '@/constants/knowledge';
import { useFetchAgentList } from '@/hooks/use-agent-request';
import { useFetchChat, usePatchChat } from '@/hooks/use-chat-request';
import { useFetchKnowledgeList } from '@/hooks/use-knowledge-request';
import {
  MODEL_CAPABILITY_I18N,
  ModelTagEntry,
  useComposeLlmOptionsByModelTypes,
  useFetchModelTags,
} from '@/hooks/use-llm-request';
import { cn } from '@/lib/utils';
import { Bot, Check, ChevronDown, Library } from 'lucide-react';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

type ModelOptionGroup = {
  label: ReactNode;
  options?: { label: ReactNode; value: string; disabled?: boolean }[];
};

// Raw model name from an option value ("llm_name@factory") for tag lookup.
function modelNameFromValue(value: string) {
  const at = value.lastIndexOf('@');
  return at > 0 ? value.slice(0, at) : value;
}

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

// Capability + custom tag chips for a model, shown inside each dropdown option.
function ModelTags({ entry }: { entry?: ModelTagEntry }) {
  const { t } = useTranslation();
  if (!entry) return null;
  const caps = entry.capabilities ?? [];
  const custom = entry.custom_tags ?? [];
  if (caps.length === 0 && custom.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {caps.map((c) => (
        <span
          key={c}
          className="px-1.5 py-0.5 rounded text-[10px] leading-none border border-accent-primary/50 text-accent-primary whitespace-nowrap"
        >
          {t(MODEL_CAPABILITY_I18N[c])}
        </span>
      ))}
      {custom.map((tag) => (
        <span
          key={tag}
          className="px-1.5 py-0.5 rounded text-[10px] leading-none bg-bg-card text-text-secondary whitespace-nowrap"
        >
          {tag}
        </span>
      ))}
    </span>
  );
}

// Chat model dropdown that renders each model with its admin-assigned tags.
function ChatModelSelect({
  value,
  options,
  tagsMap,
  onChange,
}: {
  value: string;
  options: ModelOptionGroup[];
  tagsMap: Record<string, ModelTagEntry>;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const currentLabel = useMemo(() => {
    for (const group of options) {
      const found = group.options?.find((o) => o.value === value);
      if (found) return found.label;
    }
    return null;
  }, [options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 gap-2 px-3 font-normal bg-bg-input border-border-button max-w-[240px]"
        >
          <span className="truncate">{currentLabel ?? t('chat.model')}</span>
          <ChevronDown className="size-3.5 text-text-secondary shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <Command>
          <CommandInput placeholder={t('common.search') + '...'} />
          <CommandList>
            <CommandEmpty>{t('common.noDataFound')}</CommandEmpty>
            {options.map((group, gi) => (
              <CommandGroup
                key={typeof group.label === 'string' ? group.label : gi}
                heading={group.label}
              >
                {group.options?.map((opt) => {
                  const selected = opt.value === value;
                  const name = modelNameFromValue(opt.value);
                  return (
                    <CommandItem
                      key={opt.value}
                      value={opt.value}
                      keywords={[name]}
                      disabled={opt.disabled}
                      onSelect={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={cn(
                        'cursor-pointer flex items-center gap-2',
                        selected && 'bg-bg-card',
                      )}
                    >
                      <span className="flex items-center min-w-0 shrink-0">
                        {opt.label}
                      </span>
                      <ModelTags entry={tagsMap[name]} />
                      {selected && (
                        <Check className="size-4 ml-auto shrink-0 text-accent-primary" />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Agent picker. Selecting a published agent makes this chat route every turn to
// that agent's canvas (seeded with the chat's own history); the built-in model +
// knowledge-base controls no longer apply and are hidden. "" clears it back to
// the normal RAG chat.
function ChatAgentSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const currentLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? t('chat.noAgent'),
    [options, value, t],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 gap-2 px-3 font-normal bg-bg-input border-border-button max-w-[240px]',
            value && 'border-accent-primary text-accent-primary',
          )}
        >
          <Bot className="size-4 shrink-0" />
          <span className="truncate">{currentLabel}</span>
          <ChevronDown className="size-3.5 text-text-secondary shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={t('chat.selectAgent')} />
          <CommandList>
            <CommandEmpty>{t('common.noDataFound')}</CommandEmpty>
            <CommandGroup>
              {[{ label: t('chat.noAgent'), value: '' }, ...options].map(
                (opt) => {
                  const selected = opt.value === value;
                  return (
                    <CommandItem
                      key={opt.value || '__none__'}
                      value={opt.label}
                      onSelect={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={cn(
                        'cursor-pointer flex items-center gap-2',
                        selected && 'bg-bg-card',
                      )}
                    >
                      <span className="truncate">{opt.label}</span>
                      {selected && (
                        <Check className="size-4 ml-auto shrink-0 text-accent-primary" />
                      )}
                    </CommandItem>
                  );
                },
              )}
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
 *
 * An agent picker sits alongside: pick a published agent and the chat is driven
 * by that agent instead of the RAG pipeline (model + KB pickers hidden, since the
 * agent carries its own model and retrieval config).
 */
export function ChatHeaderControls() {
  const { id } = useParams();
  const { data } = useFetchChat();
  const { patchChat } = usePatchChat();

  const agentId = (data as { agent_id?: string })?.agent_id ?? '';

  const modelOptions = useComposeLlmOptionsByModelTypes([LlmModelType.Chat]);
  const tagsMap = useFetchModelTags();
  // Only knowledge bases with parsed chunks are bindable for retrieval.
  const { list } = useFetchKnowledgeList(true);
  const kbOptions = useMemo(
    () => list.map((k) => ({ label: k.name, value: k.id })),
    [list],
  );

  const { data: agentData } = useFetchAgentList({
    canvas_category: AgentCategory.AgentCanvas,
  });
  const agentOptions = useMemo(
    () =>
      (agentData?.canvas ?? []).map((a) => ({
        label: a.title,
        value: a.id,
      })),
    [agentData],
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

  const handleAgentChange = useCallback(
    (nextAgentId: string) => {
      if (!id || nextAgentId === agentId) return;
      patchChat({ chatId: id, params: { agent_id: nextAgentId || null } });
    },
    [id, agentId, patchChat],
  );

  return (
    <div className="flex items-center gap-2" data-tour="chat-controls">
      {!agentId && (
        <>
          <ChatModelSelect
            value={data.llm_id}
            options={modelOptions as unknown as ModelOptionGroup[]}
            tagsMap={tagsMap}
            onChange={handleModelChange}
          />
          <ChatKbSelect
            value={selectedKbIds}
            options={kbOptions}
            onApply={handleKbApply}
          />
        </>
      )}
      <ChatAgentSelect
        value={agentId}
        options={agentOptions}
        onChange={handleAgentChange}
      />
    </div>
  );
}

export default ChatHeaderControls;

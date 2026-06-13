// src/components/ModelProviderCard.tsx
import { LlmIcon } from '@/components/svg-icon';
import { Button } from '@/components/ui/button';
import { useSetModalState, useTranslate } from '@/hooks/common-hooks';
import { LlmItem } from '@/hooks/use-llm-request';
import { getRealModelName } from '@/utils/llm-util';
import { ChevronsDown, ChevronsUp } from 'lucide-react';
import { FC } from 'react';
import { mapModelKey } from './un-add-model';

interface IModelCardProps {
  item: LlmItem;
}

type TagType =
  | 'LLM'
  | 'TEXT EMBEDDING'
  | 'TEXT RE-RANK'
  | 'TTS'
  | 'SPEECH2TEXT'
  | 'IMAGE2TEXT'
  | 'MODERATION';

const sortTags = (tags: string) => {
  const orderMap: Record<TagType, number> = {
    LLM: 1,
    'TEXT EMBEDDING': 2,
    'TEXT RE-RANK': 3,
    TTS: 4,
    SPEECH2TEXT: 5,
    IMAGE2TEXT: 6,
    MODERATION: 7,
  };

  return tags
    .split(',')
    .map((tag) => tag.trim())
    .sort(
      (a, b) =>
        (orderMap[a as TagType] || 999) - (orderMap[b as TagType] || 999),
    );
};

export const ModelProviderCard: FC<IModelCardProps> = ({ item }) => {
  const { visible, switchVisible } = useSetModalState();
  const { t } = useTranslate('setting');

  const handleShowMoreClick = () => {
    switchVisible();
  };

  return (
    <div
      className={`w-full rounded-lg border border-border-button`}
      data-testid="added-model-card"
      data-provider={item.name}
    >
      {/* Header */}
      <div className="flex h-16  items-center justify-between p-4 cursor-pointer transition-colors text-text-secondary">
        <div className="flex items-center space-x-3">
          <LlmIcon name={item.name} width={32} />
          <div>
            <div className="font-medium text-xl text-text-primary">
              {item.name}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              handleShowMoreClick();
            }}
          >
            <span>{visible ? t('hideModels') : t('showMoreModels')}</span>
            {!visible ? <ChevronsDown /> : <ChevronsUp />}
          </Button>
        </div>
      </div>

      {/* Content */}
      {visible && (
        <div className="">
          <div className="px-4 flex flex-wrap gap-1 mt-1">
            {sortTags(item.tags).map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 text-xs bg-bg-card text-text-secondary rounded-md"
              >
                {mapModelKey[tag.trim() as keyof typeof mapModelKey] ||
                  tag.trim()}
              </span>
            ))}
          </div>
          <div className="m-4 bg-bg-card rounded-lg max-h-96 overflow-auto scrollbar-auto">
            <ul>
              {item.llm.map((model) => (
                <li
                  key={model.name}
                  className="flex items-center border-b-[0.5px] border-border-button justify-between p-3 hover:bg-bg-card transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <span className="font-medium">
                      {getRealModelName(model.name)}
                    </span>
                    <span className="px-2 py-1 text-xs bg-bg-card text-text-secondary rounded-md">
                      {model.type}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

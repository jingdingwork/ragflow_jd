import { useSelectLlmList } from '@/hooks/use-llm-request';
import { t } from 'i18next';
import { ModelProviderCard } from './modal-card';

// Admin-managed models (department chat models + global aux models) are all
// provisioned under this factory. Models from other factories are not managed
// here, so the user-side list only shows this one.
const MANAGED_FACTORY = 'OpenAI-API-Compatible';

export const UsedModel = () => {
  const { myLlmList } = useSelectLlmList();
  const llmList = myLlmList.filter((llm) => llm.name === MANAGED_FACTORY);
  return (
    <div
      className="flex flex-col w-full gap-5 mb-4"
      data-testid="added-models-section"
    >
      <div className="text-text-primary text-2xl font-medium mb-2 mt-4">
        {t('setting.addedModels')}
      </div>
      {llmList.map((llm) => {
        return <ModelProviderCard key={llm.name} item={llm} />;
      })}
    </div>
  );
};

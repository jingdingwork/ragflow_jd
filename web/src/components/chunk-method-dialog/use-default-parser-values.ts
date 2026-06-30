import { IParserConfig } from '@/interfaces/database/document';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export function useDefaultParserValues() {
  const { t } = useTranslation();

  const defaultParserValues = useMemo(() => {
    const defaultParserValues = {
      task_page_size: 12,
      // 默认 PDF parser 使用 MinerU（env 自动注册的模型 mineru-from-env-1）
      layout_recognize: 'mineru-from-env-1@MinerU',
      chunk_token_num: 512,
      delimiter: '\n',
      enable_children: false,
      children_delimiter: '\n',
      auto_keywords: 0,
      auto_questions: 0,
      html4excel: false,
      toc_extraction: false,
      image_table_context_window: 0,
      mineru_parse_method: 'auto',
      mineru_formula_enable: true,
      mineru_table_enable: true,
      mineru_lang: 'English',
      raptor: {
        use_raptor: false,
        prompt: t('knowledgeConfiguration.promptText'),
        max_token: 256,
        threshold: 0.1,
        max_cluster: 64,
        random_seed: 0,
        scope: 'file',
        clustering_method: 'gmm',
        tree_builder: 'raptor',
      },
      // graphrag: {
      //   use_graphrag: false,
      // },
      entity_types: [],
      pages: [],
      metadata: [],
      enable_metadata: false,
    };

    return defaultParserValues as IParserConfig;
  }, [t]);

  return defaultParserValues;
}

export function useFillDefaultValueOnMount() {
  const defaultParserValues = useDefaultParserValues();

  const fillDefaultValue = useCallback(
    (parserConfig: IParserConfig) => {
      return Object.entries(defaultParserValues).reduce<Record<string, any>>(
        (pre, [key, value]) => {
          if (key in parserConfig) {
            pre[key] = parserConfig[key as keyof IParserConfig];
          } else {
            pre[key] = value;
          }
          return pre;
        },
        {},
      );
    },
    [defaultParserValues],
  );

  return fillDefaultValue;
}

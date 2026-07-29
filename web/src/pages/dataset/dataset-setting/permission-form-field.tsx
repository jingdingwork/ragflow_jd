import { SelectWithSearch } from '@/components/originui/select-with-search';
import { RAGFlowFormItem } from '@/components/ragflow-form';
import { PermissionRole } from '@/constants/permission';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

type PermissionFormFieldProps = {
  /** Restrict the choice to "me" only (employees may create personal KBs only). */
  personalOnly?: boolean;
};

export function PermissionFormField({
  personalOnly = false,
}: PermissionFormFieldProps) {
  const { t } = useTranslation();
  const { control } = useFormContext();
  const permission = useWatch({ control, name: 'permission' });
  // Company-wide visibility is granted by an administrator in the admin console;
  // the user side can only display it (the backend pins the value on save too).
  const isCompany = permission === PermissionRole.Company;

  const teamOptions = useMemo(() => {
    return (
      Object.values(PermissionRole)
        // "team" is hidden from the UI; only "me" / "department" are offered.
        // "company" is admin-only, so it is never selectable here. When
        // personalOnly is set, "department" is dropped too, leaving just "me".
        .filter(
          (x) =>
            x !== PermissionRole.Team &&
            x !== PermissionRole.Company &&
            (!personalOnly || x === PermissionRole.Me),
        )
        .map((x) => ({
          label: t('knowledgeConfiguration.' + x),
          value: x,
        }))
    );
  }, [t, personalOnly]);

  if (isCompany) {
    return (
      <RAGFlowFormItem
        name="permission"
        label={t('knowledgeConfiguration.permissions')}
        tooltip={t('knowledgeConfiguration.companyTip')}
        horizontal
      >
        {() => (
          <div className="flex h-9 items-center rounded-md border border-border-default bg-bg-card px-3 text-sm text-text-secondary">
            {t('knowledgeConfiguration.company')}
          </div>
        )}
      </RAGFlowFormItem>
    );
  }

  return (
    <RAGFlowFormItem
      name="permission"
      label={t('knowledgeConfiguration.permissions')}
      tooltip={t('knowledgeConfiguration.permissionsTip')}
      horizontal
    >
      <SelectWithSearch
        options={teamOptions}
        triggerClassName="w-full"
        testId="ds-settings-basic-permissions-select"
      ></SelectWithSearch>
    </RAGFlowFormItem>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useFetchMyDepartment,
  useFetchUserInfo,
} from '@/hooks/use-user-setting-request';
import { useTranslation } from 'react-i18next';

import Spotlight from '@/components/spotlight';
import { SearchInput } from '@/components/ui/input';
import { Building2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProfileSettingWrapperCard } from '../components/user-setting-header';
import DepartmentTable from './department-table';

const UserSettingTeam = () => {
  const { data: userInfo } = useFetchUserInfo();
  const { data: myDepartment, loading } = useFetchMyDepartment();
  const { t } = useTranslation();
  const [searchUser, setSearchUser] = useState('');

  const members = myDepartment?.members ?? [];
  const adminCount = useMemo(
    () => members.filter((m) => m.is_dept_admin).length,
    [members],
  );

  return (
    <ProfileSettingWrapperCard
      header={
        <header>
          <h2 className="text-2xl font-medium text-text-primary">
            {userInfo?.nickname + ' ' + t('setting.workspace')}
          </h2>
        </header>
      }
    >
      <Spotlight />

      <div className="h-full overflow-x-hidden overflow-y-auto">
        <Card className="bg-transparent border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-accent-primary" />
              <CardTitle className="text-base">
                {myDepartment?.department?.name || t('setting.myDepartment')}
              </CardTitle>
              <span className="text-sm text-text-secondary">
                {t('setting.memberCount', { count: members.length })}
                {adminCount > 0
                  ? ` · ${t('setting.adminCount', { count: adminCount })}`
                  : ''}
              </span>
            </div>

            <SearchInput
              className="bg-bg-input border-border-default w-32"
              placeholder={t('common.search')}
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
            />
          </CardHeader>

          <CardContent className="p-4 pt-0">
            <DepartmentTable
              members={members}
              loading={!!loading}
              search={searchUser}
            />
          </CardContent>
        </Card>
      </div>
    </ProfileSettingWrapperCard>
  );
};

export default UserSettingTeam;

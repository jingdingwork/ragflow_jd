import { RAGFlowAvatar } from '@/components/ragflow-avatar';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IDepartmentMember } from '@/interfaces/database/user-setting';
import { formatDate } from '@/utils/date';
import { ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const DepartmentTable = ({
  members,
  loading,
  search,
}: {
  members: IDepartmentMember[];
  loading: boolean;
  search: string;
}) => {
  const { t } = useTranslation();

  const filtered = useMemo(() => {
    if (!search) return members;
    const keyword = search.toLowerCase();
    return members.filter(
      (m) =>
        (m.nickname || '').toLowerCase().includes(keyword) ||
        (m.email || '').toLowerCase().includes(keyword) ||
        (m.department_name || '').toLowerCase().includes(keyword),
    );
  }, [members, search]);

  return (
    <div className="rounded-lg bg-bg-input scrollbar-auto overflow-hidden border border-border-default">
      <Table rootClassName="rounded-lg">
        <TableHeader className="bg-bg-title">
          <TableRow className="hover:bg-bg-title">
            <TableHead className="h-12 px-4">{t('common.name')}</TableHead>
            <TableHead className="h-12 px-4">{t('setting.email')}</TableHead>
            <TableHead className="h-12 px-4">
              {t('setting.department')}
            </TableHead>
            <TableHead className="h-12 px-4">{t('setting.role')}</TableHead>
            <TableHead className="h-12 px-4">
              {t('setting.lastLogin')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="bg-bg-base">
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                <div className="flex items-center justify-center">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
                </div>
              </TableCell>
            </TableRow>
          ) : filtered && filtered.length > 0 ? (
            filtered.map((record) => (
              <TableRow key={record.email} className="hover:bg-bg-card">
                <TableCell className="p-4">
                  <div className="flex gap-2 items-center">
                    <RAGFlowAvatar
                      isPerson
                      className="size-5"
                      avatar={record.avatar}
                      name={record.nickname}
                    />
                    <span className="truncate">{record.nickname}</span>
                  </div>
                </TableCell>
                <TableCell className="p-4">{record.email}</TableCell>
                <TableCell className="p-4 text-text-secondary">
                  {record.department_name || '-'}
                </TableCell>
                <TableCell className="p-4">
                  {record.is_dept_admin ? (
                    <Badge className="gap-1 bg-accent-primary-5 text-accent-primary border border-accent-primary/30">
                      <ShieldCheck className="size-3" />
                      {t('setting.deptAdmin')}
                    </Badge>
                  ) : (
                    <Badge className="bg-transparent text-text-secondary border border-border-default">
                      {t('setting.member')}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="p-4 text-text-secondary">
                  {record.last_login_time
                    ? formatDate(record.last_login_time)
                    : '-'}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                {t('common.noData')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default DepartmentTable;

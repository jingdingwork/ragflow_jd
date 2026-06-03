import { useEffect, useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

import { useQuery } from '@tanstack/react-query';

import {
  LucideBuilding2,
  LucideChevronDown,
  LucideChevronRight,
  LucideDownload,
  LucideMessageSquareText,
  LucideRefreshCw,
  LucideUser,
} from 'lucide-react';

import Spotlight from '@/components/spotlight';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePickerWithRange } from '@/components/ui/range-picker';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import {
  ChatHistoryDeptNode,
  getChatHistoryOverview,
  getChatHistoryStats,
} from '@/services/admin-service';

import { ConversationDetailDialog } from './components/conversation-detail-dialog';

type RangeKey = 'today' | 'week' | 'all' | 'custom';

function flattenIds(nodes: ChatHistoryDeptNode[], acc: string[] = []) {
  for (const node of nodes) {
    acc.push(node.id);
    if (node.children?.length) flattenIds(node.children, acc);
  }
  return acc;
}

// Keep only departments/members with activity (sessions or calls > 0).
function filterActive(nodes: ChatHistoryDeptNode[]): ChatHistoryDeptNode[] {
  const result: ChatHistoryDeptNode[] = [];
  for (const node of nodes) {
    if (node.session_count <= 0 && node.round_count <= 0) continue;
    result.push({
      ...node,
      members: node.members.filter(
        (m) => m.session_count > 0 || m.round_count > 0,
      ),
      children: filterActive(node.children ?? []),
    });
  }
  return result;
}

function computeRange(
  key: RangeKey,
  custom?: DateRange,
): { start?: number; end?: number } {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  if (key === 'today') return { start: todayStart, end: now.getTime() };
  if (key === 'week') {
    // Monday as the first day of the week
    const dow = (now.getDay() + 6) % 7;
    const weekStart = todayStart - dow * 24 * 60 * 60 * 1000;
    return { start: weekStart, end: now.getTime() };
  }
  if (key === 'custom' && custom?.from) {
    const f = custom.from;
    const t = custom.to ?? custom.from;
    const start = new Date(
      f.getFullYear(),
      f.getMonth(),
      f.getDate(),
    ).getTime();
    const end = new Date(
      t.getFullYear(),
      t.getMonth(),
      t.getDate(),
      23,
      59,
      59,
      999,
    ).getTime();
    return { start, end };
  }
  return { start: 0, end: undefined };
}

function StatCard({
  label,
  value,
  highlighted,
}: {
  label: string;
  value: number | undefined;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex-1 rounded-xl border border-border-default px-4 py-3',
        highlighted && 'bg-primary/5',
      )}
    >
      <div className="text-text-secondary text-xs">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value ?? '-'}</div>
    </div>
  );
}

type RowProps = {
  nodes: ChatHistoryDeptNode[];
  depth: number;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onSelectMember: (userId: string, nickname: string) => void;
};

function DeptRows({
  nodes,
  depth,
  expanded,
  onToggle,
  onSelectMember,
}: RowProps) {
  const { t } = useTranslation();
  return (
    <>
      {nodes.map((node) => {
        const hasChildren = !!node.children?.length;
        const hasMembers = !!node.members?.length;
        const expandable = hasChildren || hasMembers;
        const isExpanded = expanded[node.id];
        return (
          <div key={node.id}>
            <div
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-bg-card cursor-pointer text-sm"
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => expandable && onToggle(node.id)}
            >
              <button
                type="button"
                className={cn(
                  'flex size-4 items-center justify-center shrink-0',
                  !expandable && 'invisible',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(node.id);
                }}
              >
                {isExpanded ? (
                  <LucideChevronDown className="size-4" />
                ) : (
                  <LucideChevronRight className="size-4" />
                )}
              </button>
              <LucideBuilding2 className="size-4 shrink-0 opacity-70" />
              <span className="truncate flex-1 font-medium">{node.name}</span>
              <Badge variant="secondary" className="shrink-0">
                {node.member_count}
              </Badge>
              <span className="w-20 text-right shrink-0 text-text-secondary tabular-nums">
                {node.session_count}
              </span>
              <span className="w-20 text-right shrink-0 text-text-secondary tabular-nums">
                {node.round_count}
              </span>
            </div>

            {isExpanded && hasChildren && (
              <DeptRows
                nodes={node.children}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onSelectMember={onSelectMember}
              />
            )}

            {isExpanded &&
              node.members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-bg-card cursor-pointer text-sm"
                  style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                  onClick={() =>
                    onSelectMember(m.user_id, m.nickname || m.email)
                  }
                >
                  <span className="size-4 shrink-0" />
                  <LucideUser className="size-4 shrink-0 opacity-60" />
                  <span className="truncate flex-1">
                    {m.nickname || m.email}
                    {m.is_dept_admin && (
                      <Badge
                        variant="default"
                        className="ml-2 bg-[#F39800] hover:bg-[#F39800]"
                      >
                        {t('admin.deptAdmin')}
                      </Badge>
                    )}
                  </span>
                  <span className="w-7 shrink-0 flex justify-center">
                    {m.session_count > 0 && (
                      <LucideMessageSquareText className="size-3.5 text-primary" />
                    )}
                  </span>
                  <span className="w-20 text-right shrink-0 tabular-nums">
                    {m.session_count}
                  </span>
                  <span className="w-20 text-right shrink-0 tabular-nums">
                    {m.round_count}
                  </span>
                </div>
              ))}
          </div>
        );
      })}
    </>
  );
}

function AdminChatHistory() {
  const { t } = useTranslation();
  const [rangeKey, setRangeKey] = useState<RangeKey>('week');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [member, setMember] = useState<{
    userId: string;
    nickname: string;
  } | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);

  const range = useMemo(
    () => computeRange(rangeKey, customRange),
    [rangeKey, customRange],
  );

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['admin/chat-history/stats'],
    queryFn: async () => (await getChatHistoryStats())?.data?.data,
  });

  const {
    data: overview,
    isFetching,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['admin/chat-history/overview', range.start, range.end],
    queryFn: async () => {
      const res = await getChatHistoryOverview({
        start: range.start,
        end: range.end,
      });
      return res?.data?.data ?? [];
    },
  });

  const tree = useMemo(() => overview ?? [], [overview]);
  const visibleTree = useMemo(() => filterActive(tree), [tree]);

  // default-expand all departments when data arrives
  useEffect(() => {
    if (visibleTree.length) {
      setExpanded(
        Object.fromEntries(flattenIds(visibleTree).map((id) => [id, true])),
      );
    }
  }, [visibleTree]);

  const handleToggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const openMember = (userId: string, nickname: string) => {
    setMember({ userId, nickname });
    setMemberOpen(true);
  };

  const handleExport = () => {
    const COL = {
      dept: t('admin.exportDept'),
      type: t('admin.exportType'),
      name: t('admin.exportName'),
      email: t('admin.email'),
      sessions: t('admin.sessionsColumn'),
      rounds: t('admin.roundsColumn'),
    };
    const rows: Record<string, string | number>[] = [];
    const walk = (nodes: ChatHistoryDeptNode[], parentPath: string) => {
      for (const node of nodes) {
        const path = parentPath ? `${parentPath} / ${node.name}` : node.name;
        rows.push({
          [COL.dept]: path,
          [COL.type]: t('admin.exportTypeDept'),
          [COL.name]: node.name,
          [COL.email]: '',
          [COL.sessions]: node.session_count,
          [COL.rounds]: node.round_count,
        });
        for (const m of node.members) {
          rows.push({
            [COL.dept]: path,
            [COL.type]: t('admin.exportTypeMember'),
            [COL.name]: m.nickname || m.email,
            [COL.email]: m.email,
            [COL.sessions]: m.session_count,
            [COL.rounds]: m.round_count,
          });
        }
        if (node.children?.length) walk(node.children, path);
      }
    };
    walk(tree, '');

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ChatHistory');
    const fmt = (ms?: number) =>
      ms ? new Date(ms).toISOString().slice(0, 10) : '';
    const startLabel = fmt(range.start) || 'all';
    const endLabel = fmt(range.end) || fmt(Date.now());
    XLSX.writeFile(workbook, `chat-history_${startLabel}_${endLabel}.xlsx`);
  };

  const rangeButtons: { key: RangeKey; label: string }[] = [
    { key: 'today', label: t('admin.rangeToday') },
    { key: 'week', label: t('admin.rangeWeek') },
    { key: 'all', label: t('admin.rangeAll') },
  ];

  return (
    <Card className="!shadow-none relative h-full bg-transparent rounded-xl overflow-hidden">
      <Spotlight />

      <ScrollArea className="size-full">
        <CardHeader className="space-y-0 flex flex-row justify-between items-center">
          <CardTitle>{t('admin.chatHistory')}</CardTitle>
          <Button
            size="icon-lg"
            variant="outline"
            onClick={() => {
              refetchStats();
              refetchOverview();
            }}
            disabled={isFetching}
          >
            <LucideRefreshCw
              className={cn('size-4', isFetching && 'animate-spin')}
            />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Stat cards */}
          <div className="flex gap-3">
            <StatCard
              label={t('admin.todaySessions')}
              value={stats?.today_sessions}
              highlighted
            />
            <StatCard
              label={t('admin.todayRounds')}
              value={stats?.today_rounds}
              highlighted
            />
            <StatCard
              label={t('admin.weekSessions')}
              value={stats?.week_sessions}
            />
            <StatCard
              label={t('admin.weekRounds')}
              value={stats?.week_rounds}
            />
          </div>

          {/* Range filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-text-secondary text-sm">
              {t('admin.statRange')}:
            </span>
            {rangeButtons.map((b) => (
              <Button
                key={b.key}
                size="sm"
                variant={rangeKey === b.key ? 'default' : 'outline'}
                onClick={() => setRangeKey(b.key)}
              >
                {b.label}
              </Button>
            ))}
            <DatePickerWithRange
              required
              selected={customRange as DateRange}
              onSelect={(r) => {
                setCustomRange(r);
                if (r?.from) setRangeKey('custom');
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={tree.length === 0}
              onClick={handleExport}
            >
              <LucideDownload className="size-4 mr-1" />
              {t('admin.exportExcel')}
            </Button>
          </div>

          {/* Department / member tree */}
          <div className="border border-border-default rounded-lg">
            <div className="flex items-center gap-1.5 px-2 py-2 border-b border-border-default text-xs text-text-secondary font-medium">
              <span className="size-4 shrink-0" />
              <span className="flex-1 pl-5">{t('admin.departmentMember')}</span>
              <span className="w-20 text-right shrink-0">
                {t('admin.sessionsColumn')}
              </span>
              <span className="w-20 text-right shrink-0">
                {t('admin.roundsColumn')}
              </span>
            </div>
            <div className="p-1">
              {visibleTree.length === 0 ? (
                <div className="text-text-secondary text-sm p-6 text-center">
                  {t('admin.noChatData')}
                </div>
              ) : (
                <DeptRows
                  nodes={visibleTree}
                  depth={0}
                  expanded={expanded}
                  onToggle={handleToggle}
                  onSelectMember={openMember}
                />
              )}
            </div>
          </div>
        </CardContent>
      </ScrollArea>

      <ConversationDetailDialog
        userId={member?.userId ?? null}
        nickname={member?.nickname ?? ''}
        range={range}
        open={memberOpen}
        onOpenChange={(o) => {
          setMemberOpen(o);
          if (!o) setMember(null);
        }}
      />
    </Card>
  );
}

export default AdminChatHistory;

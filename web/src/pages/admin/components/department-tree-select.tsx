import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQuery } from '@tanstack/react-query';

import {
  LucideBuilding2,
  LucideChevronDown,
  LucideChevronRight,
} from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { DepartmentNode, listDepartmentTree } from '@/services/admin-service';

function flattenIds(nodes: DepartmentNode[], acc: string[] = []) {
  for (const node of nodes) {
    acc.push(node.id);
    if (node.children?.length) flattenIds(node.children, acc);
  }
  return acc;
}

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
};

type RowProps = {
  nodes: DepartmentNode[];
  depth: number;
  selected: Set<string>;
  expanded: Record<string, boolean>;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
};

function TreeRows({
  nodes,
  depth,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
}: RowProps) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const hasChildren = !!node.children?.length;
        const isExpanded = expanded[node.id];
        return (
          <li key={node.id}>
            <div
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-bg-card"
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
            >
              <button
                type="button"
                className={cn(
                  'flex size-4 items-center justify-center shrink-0',
                  !hasChildren && 'invisible',
                )}
                onClick={() => onToggleExpand(node.id)}
              >
                {isExpanded ? (
                  <LucideChevronDown className="size-4" />
                ) : (
                  <LucideChevronRight className="size-4" />
                )}
              </button>
              <Checkbox
                checked={selected.has(node.id)}
                onCheckedChange={() => onToggleSelect(node.id)}
              />
              <LucideBuilding2 className="size-4 shrink-0 opacity-70" />
              <span className="truncate flex-1">{node.name}</span>
            </div>
            {hasChildren && isExpanded && (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                selected={selected}
                expanded={expanded}
                onToggleSelect={onToggleSelect}
                onToggleExpand={onToggleExpand}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function DepartmentTreeSelect({ value, onChange, className }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: tree = [] } = useQuery({
    queryKey: ['admin/departments/tree'],
    queryFn: async () => {
      const res = await listDepartmentTree();
      return res?.data?.data ?? [];
    },
  });

  // Default-expand the whole tree once loaded.
  const allExpanded = useMemo(() => {
    return Object.fromEntries(flattenIds(tree).map((id) => [id, true]));
  }, [tree]);

  const effectiveExpanded = useMemo(
    () => ({ ...allExpanded, ...expanded }),
    [allExpanded, expanded],
  );

  const selected = useMemo(() => new Set(value), [value]);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? allExpanded[id]),
    }));

  return (
    <div className={className}>
      <p className="text-xs text-text-secondary mb-2">
        {t('admin.appVisibilityHint')}
      </p>
      <ScrollArea className="h-56 border border-border-default rounded-lg p-2">
        {tree.length === 0 ? (
          <div className="text-text-secondary text-sm p-4 text-center">
            {t('admin.noDepartments')}
          </div>
        ) : (
          <TreeRows
            nodes={tree}
            depth={0}
            selected={selected}
            expanded={effectiveExpanded}
            onToggleSelect={toggleSelect}
            onToggleExpand={toggleExpand}
          />
        )}
      </ScrollArea>
    </div>
  );
}

export default DepartmentTreeSelect;

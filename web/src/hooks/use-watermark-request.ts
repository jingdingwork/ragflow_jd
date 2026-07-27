import { useFetchUserInfo } from '@/hooks/use-user-setting-request';
import { IUserInfo } from '@/interfaces/database/user-setting';
import api from '@/utils/api';
import request from '@/utils/request';
import { useQuery } from '@tanstack/react-query';

// Global preview-watermark switch (admin: 文件管理 · 水印预览开关).
// Defaults to enabled to match the backend default.
export function useWatermarkEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['previewWatermarkEnabled'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await request.get(api.getPreviewWatermark);
      return Boolean(data?.data?.enabled);
    },
  });
  // Undefined while loading → treat as enabled so the mark never flashes off.
  return data !== false;
}

// Watermark label: "工号 · 昵称" (employee id · nickname). Falls back to the
// email local-part when the employee id is missing.
export function useWatermarkText(): string {
  const { data } = useFetchUserInfo();
  const info = data as IUserInfo;
  const id = (info?.username || info?.email?.split('@')[0] || '').trim();
  const nickname = (info?.nickname || '').trim();
  return [id, nickname].filter(Boolean).join(' · ');
}

// Convenience: the combined state a previewer needs.
export function usePreviewWatermark(): { active: boolean; text: string } {
  const enabled = useWatermarkEnabled();
  const text = useWatermarkText();
  return { active: enabled && !!text, text };
}

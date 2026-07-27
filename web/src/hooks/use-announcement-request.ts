import announcementService from '@/services/announcement-service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type UserAnnouncement = {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  pop_enabled: boolean;
  view_count: number;
  viewer_count: number;
  acknowledged: boolean;
  create_time: number;
  update_time: number;
};

export const AnnouncementQueryKey = {
  List: 'announcementList',
  Latest: 'announcementLatest',
};

// Home-page list: pinned first then newest, capped server-side at 5.
export const useListAnnouncements = () => {
  const { data, isLoading } = useQuery({
    queryKey: [AnnouncementQueryKey.List],
    queryFn: async () => {
      const { data } = await announcementService.listAnnouncements();
      return (data?.data ?? []) as UserAnnouncement[];
    },
  });
  return { list: data ?? [], loading: isLoading };
};

// The latest popup-enabled announcement (auto-pops on home entry), or null.
export const useLatestAnnouncement = () => {
  const { data, isLoading } = useQuery({
    queryKey: [AnnouncementQueryKey.Latest],
    queryFn: async () => {
      const { data } = await announcementService.latestAnnouncement();
      return (data?.data ?? null) as UserAnnouncement | null;
    },
  });
  return { latest: data ?? null, loading: isLoading };
};

// Record one open (PV always, UV on first open by this user).
export const useViewAnnouncement = () => {
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationKey: ['viewAnnouncement'],
    mutationFn: async (id: string) => {
      const { data } = await announcementService.viewAnnouncement(id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [AnnouncementQueryKey.List] });
    },
  });
  return { viewAnnouncement: mutateAsync };
};

// Mark acknowledged ("I know it") so the latest one no longer auto-pops.
export const useAckAnnouncement = () => {
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationKey: ['ackAnnouncement'],
    mutationFn: async (id: string) => {
      const { data } = await announcementService.ackAnnouncement(id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [AnnouncementQueryKey.Latest],
      });
      queryClient.invalidateQueries({ queryKey: [AnnouncementQueryKey.List] });
    },
  });
  return { ackAnnouncement: mutateAsync };
};

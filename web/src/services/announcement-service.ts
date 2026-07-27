import api from '@/utils/api';
import { registerNextServer } from '@/utils/register-server';

const {
  listAnnouncements,
  latestAnnouncement,
  viewAnnouncement,
  ackAnnouncement,
} = api;

const methods = {
  listAnnouncements: { url: listAnnouncements, method: 'get' },
  latestAnnouncement: { url: latestAnnouncement, method: 'get' },
  viewAnnouncement: { url: viewAnnouncement, method: 'post' },
  ackAnnouncement: { url: ackAnnouncement, method: 'post' },
} as const;

const announcementService = registerNextServer<keyof typeof methods>(methods);

export default announcementService;

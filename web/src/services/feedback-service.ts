import axios from 'axios';

import { Authorization } from '@/constants/authorization';
import api from '@/utils/api';
import { getAuthorization } from '@/utils/authorization-util';

export type FeedbackModule = 'chat' | 'knowledge' | 'app';

export type SubmitFeedbackPayload = {
  content: string;
  modules: FeedbackModule[];
  priority: number;
  images: File[];
};

// multipart/form-data submit (images are files); mirrors the document upload
// pattern — axios directly so the Authorization header is attached.
export const submitFeedback = async (payload: SubmitFeedbackPayload) => {
  const form = new FormData();
  form.append('content', payload.content);
  form.append('modules', JSON.stringify(payload.modules));
  form.append('priority', String(payload.priority));
  payload.images.forEach((img) => form.append('images', img));

  const response = await axios.post(api.submitFeedback, form, {
    headers: { [Authorization]: getAuthorization() },
  });
  return response.data;
};

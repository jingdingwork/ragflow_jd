import {
  SubmitFeedbackPayload,
  submitFeedback,
} from '@/services/feedback-service';
import { useMutation } from '@tanstack/react-query';

export const useSubmitFeedback = () => {
  const { mutateAsync, isPending } = useMutation({
    mutationKey: ['submitFeedback'],
    mutationFn: async (payload: SubmitFeedbackPayload) =>
      await submitFeedback(payload),
  });
  return { submitFeedback: mutateAsync, submitting: isPending };
};

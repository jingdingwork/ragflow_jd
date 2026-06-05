import { RunningStatus } from './constant';

export const isParserRunning = (text: RunningStatus) => {
  const isRunning = text === RunningStatus.RUNNING;
  return isRunning;
};

// Documents synced from a mounted shared folder are read-only on the user side:
// they are managed by the scheduled sync, so hide mutating actions for them.
export const isSharedFolderDocument = (sourceType?: string | null) =>
  (sourceType ?? '').startsWith('local_folder/');

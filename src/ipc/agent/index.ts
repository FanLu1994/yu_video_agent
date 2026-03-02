import {
  cancelJob,
  createJob,
  getJob,
  getJobEvents,
  getJobStageOutputs,
  listJobs,
  queueSummary,
  retryJob,
} from "./handlers";

export const agent = {
  createJob,
  listJobs,
  getJob,
  getJobEvents,
  getJobStageOutputs,
  cancelJob,
  retryJob,
  queueSummary,
};

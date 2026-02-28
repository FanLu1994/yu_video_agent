import {
  cancelJob,
  createJob,
  getJob,
  getJobEvents,
  listJobs,
  queueSummary,
  retryJob,
} from "./handlers";

export const agent = {
  createJob,
  listJobs,
  getJob,
  getJobEvents,
  cancelJob,
  retryJob,
  queueSummary,
};

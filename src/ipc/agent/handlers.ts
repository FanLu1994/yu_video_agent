import { os } from "@orpc/server";
import { services } from "@/services/container";
import { createJobInputSchema, jobByIdInputSchema } from "./schemas";

export const createJob = os
  .input(createJobInputSchema)
  .handler(async ({ input }) => {
    return services.agentJobService.createJob(input);
  });

export const listJobs = os.handler(async () => {
  return services.agentJobService.listJobs();
});

export const getJob = os
  .input(jobByIdInputSchema)
  .handler(async ({ input }) => {
    return services.agentJobService.getJob(input.jobId);
  });

export const getJobEvents = os
  .input(jobByIdInputSchema)
  .handler(async ({ input }) => {
    return services.agentJobService.getJobEvents(input.jobId);
  });

export const cancelJob = os
  .input(jobByIdInputSchema)
  .handler(async ({ input }) => {
    return services.agentJobService.cancelJob(input.jobId);
  });

export const retryJob = os
  .input(jobByIdInputSchema)
  .handler(async ({ input }) => {
    return services.agentJobService.retryJob(input.jobId);
  });

export const queueSummary = os.handler(async () => {
  return services.agentJobService.summarizeQueue();
});

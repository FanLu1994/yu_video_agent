import { os } from "@orpc/server";
import { services } from "@/services/container";
import { runLoggedIpcHandler } from "../logging";
import { createJobInputSchema, jobByIdInputSchema } from "./schemas";

export const createJob = os.input(createJobInputSchema).handler(({ input }) => {
  return runLoggedIpcHandler("agent.createJob", input, () => {
    return services.agentJobService.createJob(input);
  });
});

export const listJobs = os.handler(() => {
  return runLoggedIpcHandler("agent.listJobs", undefined, () => {
    return services.agentJobService.listJobs();
  });
});

export const getJob = os.input(jobByIdInputSchema).handler(({ input }) => {
  return runLoggedIpcHandler("agent.getJob", input, () => {
    return services.agentJobService.getJob(input.jobId);
  });
});

export const getJobEvents = os
  .input(jobByIdInputSchema)
  .handler(({ input }) => {
    return runLoggedIpcHandler("agent.getJobEvents", input, () => {
      return services.agentJobService.getJobEvents(input.jobId);
    });
  });

export const getJobStageOutputs = os
  .input(jobByIdInputSchema)
  .handler(({ input }) => {
    return runLoggedIpcHandler("agent.getJobStageOutputs", input, () => {
      return services.agentJobService.getJobStageOutputs(input.jobId);
    });
  });

export const cancelJob = os.input(jobByIdInputSchema).handler(({ input }) => {
  return runLoggedIpcHandler("agent.cancelJob", input, () => {
    return services.agentJobService.cancelJob(input.jobId);
  });
});

export const retryJob = os.input(jobByIdInputSchema).handler(({ input }) => {
  return runLoggedIpcHandler("agent.retryJob", input, () => {
    return services.agentJobService.retryJob(input.jobId);
  });
});

export const queueSummary = os.handler(() => {
  return runLoggedIpcHandler("agent.queueSummary", undefined, () => {
    return services.agentJobService.summarizeQueue();
  });
});

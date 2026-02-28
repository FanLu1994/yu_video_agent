import { ipc } from "@/ipc/manager";

export function createAgentJob(
  input: Parameters<typeof ipc.client.agent.createJob>[0]
) {
  return ipc.client.agent.createJob(input);
}

export function listAgentJobs() {
  return ipc.client.agent.listJobs();
}

export function getAgentJob(jobId: string) {
  return ipc.client.agent.getJob({ jobId });
}

export function getAgentJobEvents(jobId: string) {
  return ipc.client.agent.getJobEvents({ jobId });
}

export function cancelAgentJob(jobId: string) {
  return ipc.client.agent.cancelJob({ jobId });
}

export function retryAgentJob(jobId: string) {
  return ipc.client.agent.retryJob({ jobId });
}

export function getAgentQueueSummary() {
  return ipc.client.agent.queueSummary();
}

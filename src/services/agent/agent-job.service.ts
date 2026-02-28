import { randomUUID } from "node:crypto";
import type {
  JobEvent,
  JobRecord,
  JobState,
  RunAgentJobRequest,
} from "@/domain/agent/types";
import { JsonFileStore } from "@/services/storage/json-file-store";
import type { AgentRuntimeService } from "./agent-runtime.service";

interface JobsDb {
  jobs: JobRecord[];
  events: JobEvent[];
}

export class AgentJobService {
  private readonly db = new JsonFileStore<JobsDb>("jobs.json", {
    jobs: [],
    events: [],
  });

  private runningJobId: string | undefined;

  constructor(private readonly runtime: AgentRuntimeService) {}

  private async appendEvent(
    jobId: string,
    type: JobEvent["type"],
    message: string,
    extra: Partial<JobEvent> = {}
  ) {
    const event: JobEvent = {
      id: randomUUID(),
      jobId,
      createdAt: new Date().toISOString(),
      type,
      message,
      ...extra,
    };

    await this.db.update((prev) => ({
      ...prev,
      events: [...prev.events, event],
    }));
  }

  private async updateJob(jobId: string, updater: (job: JobRecord) => JobRecord) {
    await this.db.update((prev) => ({
      ...prev,
      jobs: prev.jobs.map((job) => (job.jobId === jobId ? updater(job) : job)),
    }));
  }

  private async renumberQueuePositions() {
    await this.db.update((prev) => {
      let queueIndex = 1;

      return {
        ...prev,
        jobs: prev.jobs.map((job) => {
          if (job.state === "queued") {
            return {
              ...job,
              queuePosition: queueIndex++,
              updatedAt: new Date().toISOString(),
            };
          }

          return {
            ...job,
            queuePosition: 0,
          };
        }),
      };
    });
  }

  async createJob(request: RunAgentJobRequest): Promise<JobRecord> {
    const now = new Date().toISOString();
    const job: JobRecord = {
      jobId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      state: "queued",
      stage: "ingest",
      progress: 0,
      queuePosition: 0,
      retryCount: 0,
      request,
      warnings: [],
      errors: [],
    };

    await this.db.update((prev) => ({
      ...prev,
      jobs: [...prev.jobs, job],
    }));

    await this.renumberQueuePositions();
    await this.appendEvent(job.jobId, "job.created", "Job created and queued.");
    void this.runNext();

    const saved = await this.getJob(job.jobId);
    if (!saved) {
      throw new Error("Failed to create job.");
    }

    return saved;
  }

  async listJobs(): Promise<JobRecord[]> {
    const data = await this.db.read();
    return [...data.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getJob(jobId: string): Promise<JobRecord | undefined> {
    const jobs = await this.listJobs();
    return jobs.find((job) => job.jobId === jobId);
  }

  async getJobEvents(jobId: string): Promise<JobEvent[]> {
    const data = await this.db.read();
    return data.events.filter((event) => event.jobId === jobId);
  }

  async cancelJob(jobId: string) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job '${jobId}' not found.`);
    }

    if (job.state !== "queued" && job.state !== "running") {
      return job;
    }

    await this.updateJob(jobId, (prev) => ({
      ...prev,
      state: "cancelled",
      updatedAt: new Date().toISOString(),
      progress: prev.state === "queued" ? 0 : prev.progress,
    }));

    await this.appendEvent(jobId, "job.cancelled", "Job has been cancelled.");

    if (this.runningJobId === jobId) {
      this.runningJobId = undefined;
    }

    await this.renumberQueuePositions();
    void this.runNext();

    const refreshed = await this.getJob(jobId);
    if (!refreshed) {
      throw new Error(`Job '${jobId}' not found after cancellation.`);
    }

    return refreshed;
  }

  async retryJob(jobId: string) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job '${jobId}' not found.`);
    }

    if (job.state !== "failed" && job.state !== "draft_pending_review") {
      return job;
    }

    await this.updateJob(jobId, (prev) => ({
      ...prev,
      state: "queued",
      stage: "ingest",
      progress: 0,
      queuePosition: 0,
      retryCount: prev.retryCount + 1,
      errors: [],
      updatedAt: new Date().toISOString(),
    }));
    await this.appendEvent(jobId, "job.created", "Job re-queued for retry.");
    await this.renumberQueuePositions();
    void this.runNext();

    const refreshed = await this.getJob(jobId);
    if (!refreshed) {
      throw new Error(`Job '${jobId}' not found after retry.`);
    }

    return refreshed;
  }

  private async runNext() {
    if (this.runningJobId) {
      return;
    }

    const data = await this.db.read();
    const nextJob = data.jobs
      .filter((job) => job.state === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

    if (!nextJob) {
      return;
    }

    this.runningJobId = nextJob.jobId;
    await this.updateJob(nextJob.jobId, (job) => ({
      ...job,
      state: "running",
      queuePosition: 0,
      updatedAt: new Date().toISOString(),
    }));
    await this.renumberQueuePositions();
    await this.appendEvent(nextJob.jobId, "job.started", "Job started.");

    try {
      await this.runtime.runPipeline(async (update) => {
        const currentJob = await this.getJob(nextJob.jobId);
        if (!currentJob || currentJob.state === "cancelled") {
          return;
        }

        await this.updateJob(nextJob.jobId, (job) => ({
          ...job,
          stage: update.stage,
          currentTool: update.currentTool,
          progress: update.progress,
          updatedAt: new Date().toISOString(),
        }));
        await this.appendEvent(nextJob.jobId, "job.progress", "Stage progressed.", {
          stage: update.stage,
          progress: update.progress,
        });
      });

      const refreshed = await this.getJob(nextJob.jobId);
      if (refreshed && refreshed.state !== "cancelled") {
        await this.updateJob(nextJob.jobId, (job) => ({
          ...job,
          state: "completed",
          progress: 100,
          updatedAt: new Date().toISOString(),
        }));
        await this.appendEvent(nextJob.jobId, "job.completed", "Job completed.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await this.updateJob(nextJob.jobId, (job) => ({
        ...job,
        state: "failed",
        errors: [...job.errors, { code: "RUNTIME_ERROR", message }],
        updatedAt: new Date().toISOString(),
      }));
      await this.appendEvent(nextJob.jobId, "job.failed", message);
    } finally {
      this.runningJobId = undefined;
      await this.renumberQueuePositions();
      void this.runNext();
    }
  }

  async summarizeQueue() {
    const jobs = await this.listJobs();
    const counts = jobs.reduce<Record<JobState, number>>(
      (acc, job) => {
        acc[job.state] += 1;
        return acc;
      },
      {
        queued: 0,
        running: 0,
        completed: 0,
        draft_pending_review: 0,
        failed: 0,
        cancelled: 0,
      }
    );

    return {
      counts,
      runningJobId: this.runningJobId,
    };
  }
}

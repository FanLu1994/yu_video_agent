export type JobState =
  | "queued"
  | "running"
  | "completed"
  | "draft_pending_review"
  | "failed"
  | "cancelled";

export type Stage =
  | "ingest"
  | "topic"
  | "research"
  | "script"
  | "voice_clone"
  | "compose"
  | "render"
  | "package";

export interface JobWarning {
  code: string;
  message: string;
}

export interface JobError {
  code: string;
  message: string;
}

export interface VideoSpec {
  aspect: "16:9";
  resolution: "1920x1080";
  durationSecMin: number;
  durationSecMax: number;
}

export interface RunAgentJobRequest {
  localFiles: string[];
  articleUrls: string[];
  providerId: string;
  model: string;
  voiceId?: string;
  videoSpec?: VideoSpec;
}

export interface JobRecord {
  jobId: string;
  createdAt: string;
  updatedAt: string;
  state: JobState;
  stage: Stage;
  progress: number;
  queuePosition: number;
  currentTool?: string;
  retryCount: number;
  request: RunAgentJobRequest;
  warnings: JobWarning[];
  errors: JobError[];
}

export interface JobEvent {
  id: string;
  jobId: string;
  createdAt: string;
  type:
    | "job.created"
    | "job.started"
    | "job.progress"
    | "job.warning"
    | "job.failed"
    | "job.completed"
    | "job.cancelled";
  stage?: Stage;
  progress?: number;
  message: string;
}

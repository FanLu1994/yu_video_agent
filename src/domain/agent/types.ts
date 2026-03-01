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
  durationSecMax: number;
  durationSecMin: number;
  resolution: "1920x1080";
}

export interface RunAgentJobRequest {
  articleUrls: string[];
  localFiles: string[];
  model: string;
  providerId: string;
  videoSpec?: VideoSpec;
  voiceId?: string;
}

export interface JobRecord {
  createdAt: string;
  currentTool?: string;
  errors: JobError[];
  jobId: string;
  progress: number;
  queuePosition: number;
  request: RunAgentJobRequest;
  retryCount: number;
  stage: Stage;
  state: JobState;
  updatedAt: string;
  warnings: JobWarning[];
}

export interface JobEvent {
  createdAt: string;
  id: string;
  jobId: string;
  message: string;
  progress?: number;
  stage?: Stage;
  type:
    | "job.created"
    | "job.started"
    | "job.progress"
    | "job.warning"
    | "job.failed"
    | "job.completed"
    | "job.cancelled";
}

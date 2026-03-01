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

export interface AgentPromptConfig {
  scriptPrompt?: string;
  systemPrompt?: string;
  topicPrompt?: string;
}

export interface AgentRuntimeConfig {
  maxOutputTokens?: number;
  maxResearchSources?: number;
  temperature?: number;
}

export interface AgentRemotionConfig {
  accentColor?: string;
  backgroundEndColor?: string;
  backgroundStartColor?: string;
  fps?: number;
  height?: number;
  theme?: "aurora" | "sunset" | "ocean";
  width?: number;
}

export interface AgentSidebarConfig {
  prompts: {
    scriptPrompt: string;
    systemPrompt: string;
    topicPrompt: string;
  };
  remotionConfig: {
    accentColor?: string;
    backgroundEndColor?: string;
    backgroundStartColor?: string;
    fps: number;
    height: number;
    theme: "aurora" | "sunset" | "ocean";
    width: number;
  };
  runtimeConfig: {
    maxOutputTokens: number;
    maxResearchSources: number;
    temperature: number;
  };
  videoSpec: VideoSpec;
}

export interface RunAgentJobRequest {
  articleUrls: string[];
  localFiles: string[];
  model: string;
  prompts?: AgentPromptConfig;
  providerId: string;
  remotionConfig?: AgentRemotionConfig;
  runtimeConfig?: AgentRuntimeConfig;
  videoSpec?: VideoSpec;
  voiceId?: string;
  voiceModel?: string;
  voiceProviderId?: string;
}

export interface JobArtifacts {
  manifestPath?: string;
  outputDir?: string;
  pipelineLogPath?: string;
  scriptPath?: string;
  timelinePath?: string;
  videoPath?: string;
}

export interface JobRecord {
  artifacts?: JobArtifacts;
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

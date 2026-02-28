# Video Agent 设计文档（V2）

## 1. 目标与范围

### 1.1 目标
1. 以 Electron 桌面应用为运行载体，完成从资料输入到视频产物输出的端到端流程。
2. 以 `@mariozechner/pi-agent-core` + `@mariozechner/pi-ai` 作为 Agent 编排核心依赖。
3. 在应用内实现 MiniMax 音色快速复刻流程（上传复刻音频、可选上传参考音频、调用复刻接口、保存 `voice_id` 与试听资产）。
4. 保留 Remotion 渲染能力，输出可追踪的视频资产包。

### 1.2 非目标（V2 当前阶段不做）
1. 多任务并发调度（V2 固定为单任务串行）。
2. 云端多用户协作与 Web 服务化部署。
3. 多角色配音混音。
4. 严格审核工作流与人工审批系统。

## 2. 已确认的关键决策
1. 执行模式：单任务串行。
2. 音色能力范围：克隆 + 试听 + 持久化（不强制同阶段完成 T2A 旁白合成）。
3. 密钥管理：在 GUI 配置，凭据本地加密持久化。
4. Agent 模型提供方：多 Provider 可选（支持主流国际与国内 LLM 服务），由用户在 GUI 选择。
5. MiniMax 角色：专用于音色克隆链路。

## 3. 系统架构

### 3.1 分层
1. `Renderer`：任务配置、Provider 配置、音色克隆页面、任务状态展示。
2. `Preload`：暴露安全 IPC 能力，隔离主进程能力。
3. `Main`：业务编排层（Agent Runtime、MiniMax API Client、任务调度、文件与日志管理）。
4. `ORPC IPC`：保持现有 `src/ipc/*` 架构，新增 `provider`、`agent`、`voiceClone` 领域路由。

### 3.2 主流程
1. 用户在 GUI 配置 Provider 与凭据。
2. 用户创建任务（资料 + 视频参数 + 可选音色配置）。
3. 主进程 Agent Runtime 串行执行阶段并推送进度。
4. 如开启音色克隆，调用 MiniMax 接口并持久化 `VoiceProfile`。
5. 生成视频资产包与 `manifest`。

## 4. Agent 核心设计（pi-agent-core + pi-ai）

### 4.1 核心服务
- `AgentRuntimeService`（主进程）职责：
1. 初始化 `pi-agent-core` runtime。
2. 注入 `pi-ai` provider 工厂与模型选择策略。
3. 管理 job 生命周期：`create -> queue -> run -> finalize`。
4. 将阶段事件流转为 UI 可消费的 `JobEvent`。

### 4.2 Provider 机制
- 支持多 Provider 的统一配置结构，按任务指定 provider/model。
- Provider 配置分为：
1. 非敏感配置：模型名、baseURL、超时、重试策略。
2. 敏感配置：API Key（加密存储）。

### 4.3 Tool 机制
- 统一工具接口（结构化 JSON I/O）：
1. `ingestTool`
2. `topicTool`
3. `researchTool`
4. `scriptTool`
5. `voiceCloneTool`
6. `composeRenderTool`

## 5. MiniMax 音色快速复刻设计

### 5.1 API 流程（来自 `minimax_api.md`）
1. `POST /v1/files/upload`，`purpose=voice_clone`，上传复刻音频，获取 `file_id`。
2. 可选：`POST /v1/files/upload`，`purpose=prompt_audio`，上传参考音频，获取 `prompt_file_id`。
3. `POST /v1/voice_clone`，携带 `file_id`、`voice_id`、可选 `clone_prompt`、`text`、`model`。

### 5.2 输入约束
1. 复刻音频：`mp3/m4a/wav`，10 秒到 5 分钟，<= 20MB。
2. 参考音频：`mp3/m4a/wav`，< 8 秒，<= 20MB。

### 5.3 业务输出
- 创建并持久化 `VoiceProfile`：
1. `voiceId`
2. `status`
3. `sourceAudioPath`
4. `promptAudioPath?`
5. `previewAudioPath?` 或 `previewAudioUrl?`
6. `rawResponseSnapshot`
7. `createdAt`

### 5.4 错误分类
1. `VALIDATION_ERROR`
2. `AUTH_ERROR`
3. `RATE_LIMIT`
4. `REMOTE_5XX`
5. `NETWORK_ERROR`
6. `UNKNOWN`

## 6. 任务编排与状态机

### 6.1 状态
```ts
type JobState = "queued" | "running" | "completed" | "draft_pending_review" | "failed" | "cancelled";

type Stage =
  | "ingest"
  | "topic"
  | "research"
  | "script"
  | "voice_clone"
  | "compose"
  | "render"
  | "package";
```

### 6.2 串行约束
1. 任意时刻最多一个 `running` job。
2. 新任务进入 `queued`，按 FIFO 取出执行。
3. 支持取消 `queued/running` 任务。

### 6.3 降级策略
1. 音色克隆失败：任务进入 `draft_pending_review`，保留可复跑上下文。
2. 渲染失败：保留脚本、时间轴和中间产物，支持重跑。

## 7. 公共接口与类型（文档级契约）

### 7.1 IPC 路由新增
1. `provider.listProviders`
2. `provider.saveProviderConfig`
3. `provider.testProviderConnection`
4. `voiceClone.create`
5. `voiceClone.list`
6. `voiceClone.get`
7. `agent.createJob`
8. `agent.getJob`
9. `agent.listJobs`
10. `agent.cancelJob`
11. `agent.retryJob`

### 7.2 关键类型（示例）
```ts
type ProviderConfig = {
  id: string;
  kind: "openai-compatible" | "anthropic" | "google" | "domestic-compatible";
  baseUrl?: string;
  model: string;
  enabled: boolean;
  timeoutMs?: number;
  retry?: { maxAttempts: number; backoffMs: number };
};

type CreateVoiceCloneRequest = {
  voiceId: string;
  cloneAudioPath: string;
  promptAudioPath?: string;
  promptText?: string;
  sampleText: string;
  model: string;
  providerId: "minimax";
};

type VoiceProfile = {
  voiceId: string;
  status: "ready" | "failed";
  sourceAudioPath: string;
  promptAudioPath?: string;
  previewAudioPath?: string;
  previewAudioUrl?: string;
  rawResponseSnapshotPath: string;
  createdAt: string;
};

type RunAgentJobRequest = {
  localFiles: string[];
  articleUrls: string[];
  providerId: string;
  model: string;
  voiceId?: string;
  videoSpec?: {
    aspect: "16:9";
    resolution: "1920x1080";
    durationSecMin: 60;
    durationSecMax: 180;
  };
};
```

## 8. 本地存储与安全设计

### 8.1 凭据
1. API Key 不写入普通 JSON 配置。
2. 使用系统密钥存储（例如 `keytar`）或等价加密存储实现。
3. 日志与错误信息统一脱敏，不输出 Authorization 与 Key 原文。

### 8.2 数据与资产目录
- `output/{jobId}/`
1. `final/video.mp4`
2. `audio/narration.wav`（若有）
3. `script/script.md`
4. `subtitle/subtitle.srt`（若有）
5. `research/sources.json`
6. `timeline/timestamps.json`
7. `manifest.json`
8. `logs/pipeline.log`

- `voice/{voiceId}/`
1. `source.*`
2. `prompt.*`（可选）
3. `preview.*`（可选）
4. `raw-response.json`

## 9. UI 设计要求（V2）
1. Provider 管理页：新增/编辑/启用/禁用/连通性测试。
2. 音色克隆页：上传音频、参数设置、提交克隆、查看 `voice_id` 与试听。
3. 任务页：队列状态、阶段进度、错误详情、重试与取消。
4. 任务创建时可选择 Provider、模型、可选音色 `voice_id`。

## 10. 测试与验收

### 10.1 单元测试
1. Provider 配置校验。
2. 凭据存储读写与脱敏日志。
3. MiniMax 请求构造与错误映射。

### 10.2 集成测试
1. mock MiniMax 成功路径：创建 `VoiceProfile` 并保存资产。
2. mock MiniMax 失败路径：正确落地错误分类并进入降级状态。
3. Agent Job 从 `queued` 到终态流转正确。

### 10.3 E2E
1. GUI 配置 Provider -> 创建音色克隆 -> 查看可用 `voice_id`。
2. 使用该 `voice_id` 创建视频任务并完成输出包。

### 10.4 验收标准
1. 单任务串行执行稳定且可观测。
2. 音色克隆全链路可用，`voice_id` 可管理。
3. 凭据加密存储，日志不泄露敏感信息。
4. 输出目录与 `manifest` 完整。

## 11. 实施顺序（建议）
1. 定义 IPC 契约与类型。
2. 完成凭据存储与 Provider 配置管理。
3. 集成 `pi-agent-core` + `pi-ai` 运行时。
4. 实现 MiniMax 音色克隆客户端与 `VoiceProfile` 存储。
5. 打通任务编排、UI 与测试。

## 12. 假设与约束
1. 桌面端具备可用网络访问 Provider 与 MiniMax。
2. V2 以“可运行和可追踪”优先，先保证稳定再扩展并发与高级能力。
3. 若 MiniMax 返回结构与文档示例存在差异，适配层需保存原始响应并优雅降级。

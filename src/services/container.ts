import { AgentConfigService } from "./agent/agent-config.service";
import { AgentJobService } from "./agent/agent-job.service";
import { AgentRuntimeService } from "./agent/agent-runtime.service";
import { ProviderConfigService } from "./provider/provider-config.service";
import { RemotionRenderService } from "./remotion/remotion-render.service";
import { SecretVault } from "./security/secret-vault";
import { VoiceCloneService } from "./voice/voice-clone.service";

const secretVault = new SecretVault();
const providerConfigService = new ProviderConfigService(secretVault);
const agentConfigService = new AgentConfigService();
const remotionRenderService = new RemotionRenderService();
const agentRuntimeService = new AgentRuntimeService(
  providerConfigService,
  remotionRenderService
);
const agentJobService = new AgentJobService(agentRuntimeService);
const voiceCloneService = new VoiceCloneService(providerConfigService);

export const services = {
  providerConfigService,
  agentConfigService,
  remotionRenderService,
  agentRuntimeService,
  agentJobService,
  voiceCloneService,
};

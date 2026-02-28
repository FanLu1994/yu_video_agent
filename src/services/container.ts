import { AgentJobService } from "./agent/agent-job.service";
import { AgentRuntimeService } from "./agent/agent-runtime.service";
import { ProviderConfigService } from "./provider/provider-config.service";
import { SecretVault } from "./security/secret-vault";
import { VoiceCloneService } from "./voice/voice-clone.service";

const secretVault = new SecretVault();
const providerConfigService = new ProviderConfigService(secretVault);
const agentRuntimeService = new AgentRuntimeService();
const agentJobService = new AgentJobService(agentRuntimeService);
const voiceCloneService = new VoiceCloneService(providerConfigService);

export const services = {
  providerConfigService,
  agentRuntimeService,
  agentJobService,
  voiceCloneService,
};

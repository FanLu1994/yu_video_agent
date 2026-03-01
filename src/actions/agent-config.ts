import { ipc } from "@/ipc/manager";

export function getAgentConfig() {
  return ipc.client.agentConfig.getConfig();
}

export function saveAgentConfig(
  input: Parameters<typeof ipc.client.agentConfig.saveConfig>[0]
) {
  return ipc.client.agentConfig.saveConfig(input);
}

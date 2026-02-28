import { ipc } from "@/ipc/manager";

export function listProviders() {
  return ipc.client.provider.listProviders();
}

export function saveProviderConfig(
  input: Parameters<typeof ipc.client.provider.saveProviderConfig>[0]
) {
  return ipc.client.provider.saveProviderConfig(input);
}

export function testProviderConnection(providerId: string) {
  return ipc.client.provider.testProviderConnection({ providerId });
}

export function deleteProviderConfig(providerId: string) {
  return ipc.client.provider.deleteProviderConfig({ providerId });
}

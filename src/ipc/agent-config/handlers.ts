import { os } from "@orpc/server";
import { services } from "@/services/container";
import { runLoggedIpcHandler } from "../logging";
import { saveAgentConfigInputSchema } from "./schemas";

export const getConfig = os.handler(() => {
  return runLoggedIpcHandler("agentConfig.getConfig", undefined, () => {
    return services.agentConfigService.getConfig();
  });
});

export const saveConfig = os.input(saveAgentConfigInputSchema).handler(({ input }) => {
  return runLoggedIpcHandler("agentConfig.saveConfig", input, () => {
    return services.agentConfigService.saveConfig(input);
  });
});

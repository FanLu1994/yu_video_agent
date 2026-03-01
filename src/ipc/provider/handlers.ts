import { os } from "@orpc/server";
import { services } from "@/services/container";
import { runLoggedIpcHandler } from "../logging";
import {
  deleteProviderInputSchema,
  providerByIdInputSchema,
  saveProviderConfigInputSchema,
} from "./schemas";

export const listProviders = os.handler(() => {
  return runLoggedIpcHandler("provider.listProviders", undefined, () => {
    return services.providerConfigService.listProviders();
  });
});

export const saveProviderConfig = os
  .input(saveProviderConfigInputSchema)
  .handler(({ input }) => {
    return runLoggedIpcHandler("provider.saveProviderConfig", input, () => {
      return services.providerConfigService.saveProviderConfig(input);
    });
  });

export const testProviderConnection = os
  .input(providerByIdInputSchema)
  .handler(({ input }) => {
    return runLoggedIpcHandler("provider.testProviderConnection", input, () => {
      return services.providerConfigService.testProviderConnection(
        input.providerId
      );
    });
  });

export const deleteProviderConfig = os
  .input(deleteProviderInputSchema)
  .handler(({ input }) => {
    return runLoggedIpcHandler("provider.deleteProviderConfig", input, () =>
      services.providerConfigService
        .deleteProviderConfig(input.providerId)
        .then(() => {
          return {
            ok: true,
          };
        })
    );
  });

import { os } from "@orpc/server";
import { services } from "@/services/container";
import {
  deleteProviderInputSchema,
  providerByIdInputSchema,
  saveProviderConfigInputSchema,
} from "./schemas";

export const listProviders = os.handler(async () => {
  return services.providerConfigService.listProviders();
});

export const saveProviderConfig = os
  .input(saveProviderConfigInputSchema)
  .handler(async ({ input }) => {
    return services.providerConfigService.saveProviderConfig(input);
  });

export const testProviderConnection = os
  .input(providerByIdInputSchema)
  .handler(async ({ input }) => {
    return services.providerConfigService.testProviderConnection(input.providerId);
  });

export const deleteProviderConfig = os
  .input(deleteProviderInputSchema)
  .handler(async ({ input }) => {
    await services.providerConfigService.deleteProviderConfig(input.providerId);
    return {
      ok: true,
    };
  });

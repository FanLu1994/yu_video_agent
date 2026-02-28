import {
  deleteProviderConfig,
  listProviders,
  saveProviderConfig,
  testProviderConnection,
} from "./handlers";

export const provider = {
  listProviders,
  saveProviderConfig,
  testProviderConnection,
  deleteProviderConfig,
};

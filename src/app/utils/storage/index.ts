import config from "../../config";
import { IStorageAdapter } from "./storage.interface";
import { localStorageAdapter } from "./local.storage";

const resolveStorageAdapter = (): IStorageAdapter => {
  if (config.storage_driver === "s3") {
    // intentionally not implemented — swap this branch in when a real S3 adapter
    // exists; the service layer above only ever talks to the IStorageAdapter interface
    throw new Error("S3 storage adapter is not implemented yet");
  }
  return localStorageAdapter;
};

export const storage = resolveStorageAdapter();
export * from "./storage.interface";

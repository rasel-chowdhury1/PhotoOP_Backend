import config from "../../config";
import { IStorageAdapter } from "./storage.interface";
import { localStorageAdapter } from "./local.storage";
import AppError from "../../error/AppError";
import httpStatus from "http-status";

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

// Thin wrapper around the configured IStorageAdapter (local for now, S3 later —
// see storage/index.ts). Callers never talk to the adapter directly, so swapping
// drivers later doesn't touch gallery.service.ts or anywhere else this is used.
export const deleteFileFromStorage = async (key: string): Promise<void> => {
  try {
    await storage.delete(key); // <-- adjust method name to match IStorageAdapter
  } catch (err: any) {
    // if the file's already gone, don't block the DB update on it
    if (err?.code === "ENOENT") {
      console.warn(`File not found in storage, skipping delete: ${key}`);
      return;
    }
 
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to delete file from storage");
  }
};
 

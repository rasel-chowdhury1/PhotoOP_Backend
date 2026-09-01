import config from "../../config";
import { IStorageAdapter } from "./storage.interface";
import { localStorageAdapter } from "./local.storage";
import { s3StorageAdapter } from "./s3.storage";
import AppError from "../../error/AppError";
import httpStatus from "http-status";

const resolveStorageAdapter = (): IStorageAdapter => {
  if (config.storage_driver === "s3") {
    return s3StorageAdapter;
  }
  return localStorageAdapter;
};

export const storage = resolveStorageAdapter();
export * from "./storage.interface";

// Thin wrapper around the configured IStorageAdapter (local or S3, driven by
// STORAGE_DRIVER — see resolveStorageAdapter above). Callers never talk to the
// adapter directly, so swapping drivers doesn't touch gallery.service.ts or
// anywhere else this is used.
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
 

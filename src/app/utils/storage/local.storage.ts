import fs from "fs/promises";
import path from "path";
import config from "../../config";
import { IStorageAdapter, UploadedFileResult } from "./storage.interface";

const UPLOAD_ROOT = path.resolve(config.upload_root);

// normalize to forward slashes so keys are stable/URL-safe regardless of OS
const toKey = (absolutePath: string): string =>
  path.relative(UPLOAD_ROOT, absolutePath).split(path.sep).join("/");

const toAbsolutePath = (key: string): string => path.join(UPLOAD_ROOT, key);

// key format: deliveries/{bookingId}/attempt-{n}/{filename} — parsed here to build the
// API route that actually serves it (see booking.route.ts's asset-serving endpoint)
const getUrl = (key: string): string => {
  const segments = key.split("/");
  const [, bookingId, ...rest] = segments; // segments[0] === "deliveries"
  return `${config.public_base_url}/api/v1/bookings/${bookingId}/delivery/assets/${rest.join("/")}`;
};

const exists = async (key: string): Promise<boolean> => {
  try {
    await fs.access(toAbsolutePath(key));
    return true;
  } catch {
    return false;
  }
};

// multer's diskStorage already wrote `file` to disk (destination/filename computed the
// same folder this function receives) — this just derives the key and wraps the result,
// it never re-reads or re-writes bytes itself
const save = async (file: Express.Multer.File, folder: string): Promise<UploadedFileResult> => {
  const expectedDir = path.join(UPLOAD_ROOT, folder);
  if (path.dirname(file.path) !== path.resolve(expectedDir)) {
    throw new Error(
      `Uploaded file ${file.path} was not written under the expected folder ${expectedDir}`
    );
  }

  const key = toKey(file.path);
  return {
    url: getUrl(key),
    key,
    size: file.size,
    mimeType: file.mimetype,
    originalName: file.originalname,
  };
};

const saveMany = async (
  files: Express.Multer.File[],
  folder: string
): Promise<UploadedFileResult[]> => Promise.all(files.map((file) => save(file, folder)));

const deleteFile = async (key: string): Promise<void> => {
  try {
    await fs.unlink(toAbsolutePath(key));
  } catch (error) {
    // already gone is fine — delete is idempotent
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};

const deleteMany = async (keys: string[]): Promise<void> => {
  await Promise.all(keys.map((key) => deleteFile(key)));
};

export const localStorageAdapter: IStorageAdapter = {
  save,
  saveMany,
  delete: deleteFile,
  deleteMany,
  getUrl,
  exists,
};

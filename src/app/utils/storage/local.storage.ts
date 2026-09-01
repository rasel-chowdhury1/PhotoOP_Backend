import fs from "fs/promises";
import path from "path";
import config from "../../config";
import { IStorageAdapter, UploadedFileResult } from "./storage.interface";

const UPLOAD_ROOT = path.resolve(config.upload_root);

// normalize to forward slashes so keys are stable/URL-safe regardless of OS
const toKey = (absolutePath: string): string =>
  path.relative(UPLOAD_ROOT, absolutePath).split(path.sep).join("/");

const toAbsolutePath = (key: string): string => path.join(UPLOAD_ROOT, key);

// delivery assets (key format: deliveries/{bookingId}/attempt-{n}/{filename}) are
// access-controlled, so they're parsed here to build the authenticated API route that
// serves them (see booking.route.ts's asset-serving endpoint). Everything else (e.g.
// profile/{filename} from gallery image replacement) has no such gate and is served
// directly by express.static('public') — see app.ts — so it resolves to a plain
// /uploads/{key} URL, the local equivalent of an S3 object URL.
const getUrl = (key: string): string => {
  const segments = key.split("/");
  if (segments[0] === "deliveries") {
    const [, bookingId, ...rest] = segments;
    return `${config.public_base_url}/api/v1/bookings/${bookingId}/delivery/assets/${rest.join("/")}`;
  }
  return `${config.public_base_url}/uploads/${key}`;
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

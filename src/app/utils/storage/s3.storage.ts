import fs from "fs/promises";
import path from "path";
import {
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { s3Client } from "../../constants/aws";
import config from "../../config";
import { IStorageAdapter, UploadedFileResult } from "./storage.interface";

const BUCKET = config.aws.bucket as string;

// S3 keys are always forward-slash, never a leading slash
const toKey = (folder: string, filename: string): string =>
  `${folder}/${filename}`.replace(/^\/+/, "");

// multer only reports whatever Content-Type the client's multipart field declared —
// some clients (curl, misconfigured FormData) send images/videos as generic binary,
// which S3 then serves as application/octet-stream and browsers force-download. Fall
// back to the file extension whenever the reported type is missing or generic.
const EXTENSION_MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".pdf": "application/pdf",
};

const GENERIC_MIME_TYPES = new Set(["application/octet-stream", ""]);

const resolveContentType = (file: Express.Multer.File): string => {
  if (file.mimetype && !GENERIC_MIME_TYPES.has(file.mimetype)) {
    return file.mimetype;
  }
  const byExtension = EXTENSION_MIME_MAP[path.extname(file.originalname).toLowerCase()];
  return byExtension || file.mimetype || "application/octet-stream";
};

// images/video/pdf should render in the browser tab; anything else (docs, generic
// binary) keeps the default download behavior
const resolveContentDisposition = (contentType: string): "inline" | "attachment" =>
  contentType === "application/pdf" || /^(image|video)\//.test(contentType)
    ? "inline"
    : "attachment";

const getUrl = (key: string): string =>
  `https://${BUCKET}.s3.${config.aws.region}.amazonaws.com/${key}`;

const exists = async (key: string): Promise<boolean> => {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") {
      return false;
    }
    throw error;
  }
};

// multer's diskStorage already wrote `file` to a local temp path under UPLOAD_ROOT/folder
// (see deliveryUpload.ts / fileUpload.ts) — this reads those bytes once, pushes them to S3
// under the same folder/filename layout the local adapter uses as its key, then removes
// the local temp copy since S3 is now the source of truth
const save = async (file: Express.Multer.File, folder: string): Promise<UploadedFileResult> => {
  const key = toKey(folder, path.basename(file.path));
  const body = await fs.readFile(file.path);
  const contentType = resolveContentType(file);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentDisposition: resolveContentDisposition(contentType),
    })
  );

  await fs.unlink(file.path).catch(() => {
    // temp file cleanup is best-effort — the upload already succeeded
  });

  return {
    url: getUrl(key),
    key,
    size: file.size,
    mimeType: contentType,
    originalName: file.originalname,
  };
};

const saveMany = async (
  files: Express.Multer.File[],
  folder: string
): Promise<UploadedFileResult[]> => Promise.all(files.map((file) => save(file, folder)));

const deleteFile = async (key: string): Promise<void> => {
  // DeleteObject is idempotent on S3 — it doesn't error when the key is already gone
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
};

const deleteMany = async (keys: string[]): Promise<void> => {
  if (keys.length === 0) return;

  // DeleteObjects caps at 1000 keys per request
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += 1000) {
    chunks.push(keys.slice(i, i + 1000));
  }

  await Promise.all(
    chunks.map((chunk) =>
      s3Client.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        })
      )
    )
  );
};

export const  s3StorageAdapter: IStorageAdapter = {
  save,
  saveMany,
  delete: deleteFile,
  deleteMany,
  getUrl,
  exists,
};

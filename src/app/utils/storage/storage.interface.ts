export interface UploadedFileResult {
  url: string; // client-facing access URL
  key: string; // internal path / future S3 key — used for delete
  size: number;
  mimeType: string;
  originalName: string;
}

export interface IStorageAdapter {
  save(file: Express.Multer.File, folder: string): Promise<UploadedFileResult>;
  saveMany(files: Express.Multer.File[], folder: string): Promise<UploadedFileResult[]>;
  delete(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
  getUrl(key: string): string;
  exists(key: string): Promise<boolean>;
}

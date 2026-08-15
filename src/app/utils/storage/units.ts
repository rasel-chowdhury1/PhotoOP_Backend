// single source of truth for byte<->GB conversion, so storage-limit checks and
// storageUsedGB accounting can never drift apart by using different math
const BYTES_PER_GB = 1024 * 1024 * 1024;

export const bytesToGB = (bytes: number): number => bytes / BYTES_PER_GB;

import crypto from 'crypto';

export interface MagicByteDetection {
  mimeType: string;
  extension: string;
}

/**
 * Supported MIME types and extensions for dispute evidence documents
 */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
] as const;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit per file (PayPal spec)
export const MAX_TOTAL_BATCH_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB batch limit

/**
 * Detects file type strictly from file binary headers (magic bytes),
 * never relying on caller-provided file extensions or MIME headers.
 */
export function detectMagicBytes(buffer: Buffer): MagicByteDetection | null {
  if (!buffer || buffer.length < 8) return null;

  // 1. PDF: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return { mimeType: 'application/pdf', extension: 'pdf' };
  }

  // 2. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  // 3. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  // 4. GIF: GIF87a or GIF89a
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return { mimeType: 'image/gif', extension: 'gif' };
  }

  return null;
}

/**
 * Computes hexadecimal SHA-256 hash of a file buffer
 */
export function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

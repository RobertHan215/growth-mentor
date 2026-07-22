import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getStorageProvider, StorageType } from '@/lib/storage';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('Upload API');

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      log.error('Invalid Content-Type for file upload:', contentType);
      return apiError(
        'INVALID_REQUEST',
        400,
        `Invalid Content-Type: expected multipart/form-data, got "${contentType}"`,
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const type = (formData.get('type') as StorageType) || 'media';

    if (!file) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'No file provided in field "file"');
    }

    // Convert file to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Compute MD5 hash for filename/dedup
    const hash = crypto.createHash('md5').update(buffer).digest('hex');

    // Call storage provider to upload the file
    const provider = getStorageProvider();
    log.info(`Uploading file ${file.name} (size: ${file.size}, type: ${type}, hash: ${hash})`);
    
    const url = await provider.upload(hash, buffer, type, file.type);
    log.info(`File uploaded successfully. Public URL: ${url}`);

    return apiSuccess({ url });
  } catch (error) {
    log.error('File upload error:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Unknown upload error',
    );
  }
}

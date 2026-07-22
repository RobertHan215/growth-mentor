/**
 * Image Storage Utilities
 *
 * Store PDF images in IndexedDB with async MySQL sync.
 * Images are stored as Blob for browser compatibility.
 */

import { nanoid } from 'nanoid';
import { createLogger } from '@/lib/logger';
import { saveImageFile, getImageFile, deleteImageFile } from '@/lib/hybrid-storage';
import { db as indexedDB } from './database';

const log = createLogger('ImageStorage');

function base64ToBlob(base64DataUrl: string): { blob: Blob; mimeType: string } {
  const parts = base64DataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const base64Data = parts[1];
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return { blob, mimeType };
}

async function blobToBase64(blob: Blob, mimeType: string): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

export async function storeImages(
  images: Array<{ id: string; src: string; pageNumber?: number }>,
): Promise<string[]> {
  const sessionId = nanoid(10);
  const storedIds: string[] = [];

  for (const img of images) {
    try {
      const { blob, mimeType } = base64ToBlob(img.src);
      const storageId = `session_${sessionId}_${img.id}`;

      await saveImageFile({
        id: storageId,
        blob,
        filename: `${img.id}.png`,
        mimeType,
        size: blob.size,
        createdAt: Date.now(),
      });
      storedIds.push(storageId);
    } catch (error) {
      log.error(`Failed to store image ${img.id}:`, error);
    }
  }

  return storedIds;
}

export async function loadImageMapping(imageIds: string[]): Promise<Record<string, string>> {
  const mapping: Record<string, string> = {};

  for (const storageId of imageIds) {
    try {
      const record = await getImageFile(storageId);
      if (record) {
        const base64 = await blobToBase64(record.blob, record.mimeType);
        const originalId = storageId.replace(/^session_[^_]+_/, '');
        mapping[originalId] = base64;
      }
    } catch (error) {
      log.error(`Failed to load image ${storageId}:`, error);
    }
  }

  return mapping;
}

export async function cleanupSessionImages(sessionId: string): Promise<void> {
  try {
    const prefix = `session_${sessionId}_`;
    const allImages = await indexedDB.imageFiles.toArray();

    for (const img of allImages) {
      if (img.id.startsWith(prefix)) {
        await deleteImageFile(img.id);
      }
    }

    log.info(`Cleaned up images for session ${sessionId}`);
  } catch (error) {
    log.error('Failed to cleanup session images:', error);
  }
}

export async function cleanupOldImages(hoursOld: number = 24): Promise<void> {
  try {
    const cutoff = Date.now() - hoursOld * 60 * 60 * 1000;
    const allImages = await indexedDB.imageFiles.toArray();

    for (const img of allImages) {
      if (img.createdAt < cutoff) {
        await deleteImageFile(img.id);
      }
    }

    log.info(`Cleaned up images older than ${hoursOld} hours`);
  } catch (error) {
    log.error('Failed to cleanup old images:', error);
  }
}

export async function getImageStorageSize(): Promise<number> {
  try {
    const allImages = await indexedDB.imageFiles.toArray();
    return allImages.reduce((sum, img) => sum + img.size, 0);
  } catch {
    return 0;
  }
}

export async function storePdfBlob(file: File): Promise<string> {
  const storageKey = `pdf_${nanoid(10)}`;
  const blob = file;

  await saveImageFile({
    id: storageKey,
    blob,
    filename: file.name,
    mimeType: file.type || 'application/pdf',
    size: file.size,
    createdAt: Date.now(),
  });
  return storageKey;
}

export async function loadPdfBlob(key: string): Promise<Blob | null> {
  const record = await getImageFile(key);
  if (!record) return null;
  return record.blob;
}

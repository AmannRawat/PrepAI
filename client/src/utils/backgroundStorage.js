/**
 * PrepAI Background Storage & Validation Utility
 *
 * Provides isolated IndexedDB persistence for user-uploaded custom background images
 * and in-depth client-side image validation (magic bytes, decode, resolution, size).
 * No server uploads, no external dependencies, zero base64 in localStorage.
 */

const DB_NAME = 'prepai_appearance_db';
const DB_VERSION = 1;
const STORE_NAME = 'custom_backgrounds';
const RECORD_KEY = 'current_custom_bg';

export const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MIN_WIDTH = 800;
export const MIN_HEIGHT = 450;
export const MAX_WIDTH = 7680;
export const MAX_HEIGHT = 4320;

/**
 * Open the IndexedDB database instance safely
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported or accessible in this browser environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open appearance database.'));
    };

    request.onblocked = () => {
      reject(new Error('IndexedDB upgrade blocked by another open tab.'));
    };
  });
}

/**
 * Resolve IndexedDB record key partitioned by user account
 * @param {string} accountScope - Clerk userId or 'guest'
 * @returns {string} Partitioned record key
 */
export function getStorageRecordKey(accountScope = 'guest') {
  if (!accountScope || accountScope === 'guest') {
    return 'guest_custom_bg';
  }
  return `custom_bg_${accountScope}`;
}

/**
 * Save custom background image blob and its metadata into IndexedDB
 * @param {Blob|File} blob - Raw image binary
 * @param {object} metadata - File metadata (fileName, mimeType, width, height)
 * @param {string} accountScope - User account ID or 'guest'
 * @returns {Promise<object>} Stored record summary
 */
export async function saveCustomBackground(blob, metadata = {}, accountScope = 'guest') {
  const db = await openDatabase();
  const recordKey = getStorageRecordKey(accountScope);

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const record = {
        id: recordKey,
        blob,
        fileName: metadata.fileName || 'custom-background',
        mimeType: metadata.mimeType || blob.type || 'image/jpeg',
        width: metadata.width || 0,
        height: metadata.height || 0,
        sizeBytes: blob.size,
        updatedAt: Date.now(),
      };

      const putRequest = store.put(record);

      putRequest.onsuccess = () => {
        resolve({
          id: record.id,
          fileName: record.fileName,
          mimeType: record.mimeType,
          width: record.width,
          height: record.height,
          sizeBytes: record.sizeBytes,
          updatedAt: record.updatedAt,
        });
      };

      putRequest.onerror = () => {
        reject(putRequest.error || new Error('Failed to save custom background to IndexedDB.'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Retrieve the active custom background image from IndexedDB for the given account
 * @param {string} accountScope - User account ID or 'guest'
 * @returns {Promise<{ blob: Blob, metadata: object }|null>}
 */
export async function getCustomBackground(accountScope = 'guest') {
  const db = await openDatabase();
  const recordKey = getStorageRecordKey(accountScope);

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(recordKey);

      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (!record || !record.blob) {
          // If guest, check legacy 'current_custom_bg' as fallback migration
          if (!accountScope || accountScope === 'guest') {
            const legacyReq = store.get('current_custom_bg');
            legacyReq.onsuccess = () => {
              const legacyRecord = legacyReq.result;
              if (legacyRecord && legacyRecord.blob) {
                resolve({
                  blob: legacyRecord.blob,
                  metadata: {
                    id: legacyRecord.id,
                    fileName: legacyRecord.fileName,
                    mimeType: legacyRecord.mimeType,
                    width: legacyRecord.width,
                    height: legacyRecord.height,
                    sizeBytes: legacyRecord.sizeBytes,
                    updatedAt: legacyRecord.updatedAt,
                  },
                });
              } else {
                resolve(null);
              }
            };
            legacyReq.onerror = () => resolve(null);
            return;
          }
          resolve(null);
        } else {
          resolve({
            blob: record.blob,
            metadata: {
              id: record.id,
              fileName: record.fileName,
              mimeType: record.mimeType,
              width: record.width,
              height: record.height,
              sizeBytes: record.sizeBytes,
              updatedAt: record.updatedAt,
            },
          });
        }
      };

      getRequest.onerror = () => {
        reject(getRequest.error || new Error('Failed to retrieve custom background from IndexedDB.'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Delete custom background image from IndexedDB for the given account
 * @param {string} accountScope - User account ID or 'guest'
 */
export async function deleteCustomBackground(accountScope = 'guest') {
  const db = await openDatabase();
  const recordKey = getStorageRecordKey(accountScope);

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const deleteRequest = store.delete(recordKey);

      deleteRequest.onsuccess = () => {
        // Also remove legacy key if guest deletes
        if (!accountScope || accountScope === 'guest') {
          try {
            store.delete('current_custom_bg');
          } catch (e) {}
        }
        resolve(true);
      };

      deleteRequest.onerror = () => {
        reject(deleteRequest.error || new Error('Failed to delete custom background from IndexedDB.'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Validate image file binary headers (magic bytes) to prevent disguised files
 * @param {ArrayBuffer} buffer - First 12+ bytes of file
 * @returns {string|null} Detected MIME type or null if unrecognized
 */
export function detectImageMimeType(buffer) {
  if (!buffer || buffer.byteLength < 4) return null;
  const bytes = new Uint8Array(buffer);

  // JPEG / JPG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Full client-side validation of uploaded background file
 * Inspects: size, header magic bytes, browser decode capability, dimensions, aspect ratio.
 *
 * @param {File} file
 * @returns {Promise<{
 *   valid: boolean,
 *   error?: string,
 *   warning?: string,
 *   width?: number,
 *   height?: number,
 *   mimeType?: string,
 *   aspectRatio?: number
 * }>}
 */
export async function validateImageFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  // 1. Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File is too large (${sizeMb} MB). Maximum allowed background size is 8 MB.`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: 'The selected file is empty (0 bytes).' };
  }

  // 2. Check binary magic bytes
  let detectedMime = null;
  try {
    const slice = file.slice(0, 16);
    const arrayBuffer = await slice.arrayBuffer();
    detectedMime = detectImageMimeType(arrayBuffer);
  } catch (err) {
    return { valid: false, error: 'Failed to inspect file contents: ' + (err.message || 'Read error') };
  }

  if (!detectedMime) {
    return {
      valid: false,
      error: 'Unsupported image format. Please upload a genuine JPEG, PNG, or WebP image.',
    };
  }

  // 3. Attempt actual browser image decode
  let dimensions = null;
  const objectUrl = URL.createObjectURL(file);

  try {
    dimensions = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
      };
      img.onerror = () => {
        reject(new Error('Corrupted image data. The browser was unable to decode this image.'));
      };
      img.src = objectUrl;
    });
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    return { valid: false, error: err.message };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const { width, height } = dimensions;

  // 4. Dimension boundary enforcement
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return {
      valid: false,
      error: `Image resolution (${width}×${height}px) is too small. Minimum required size is ${MIN_WIDTH}×${MIN_HEIGHT}px.`,
    };
  }

  if (width > MAX_WIDTH || height > MAX_HEIGHT) {
    return {
      valid: false,
      error: `Image dimensions (${width}×${height}px) exceed 8K boundary (maximum ${MAX_WIDTH}×${MAX_HEIGHT}px).`,
    };
  }

  // 5. Friendly warnings (non-fatal advice)
  const warnings = [];
  const aspectRatio = width / height;

  if (width < 1920 || height < 1080) {
    warnings.push(`Resolution is below recommended 1920×1080px; it will be scaled to cover the screen.`);
  }

  if (aspectRatio < 1.2 || aspectRatio > 2.6) {
    warnings.push(`Aspect ratio (${aspectRatio.toFixed(2)}:1) differs from typical 16:9 widescreen; image will be centered and cropped.`);
  }

  return {
    valid: true,
    warning: warnings.length > 0 ? warnings.join(' ') : null,
    width,
    height,
    mimeType: detectedMime,
    aspectRatio,
  };
}

/**
 * Format raw byte size into human-readable string
 * @param {number} bytes
 * @param {number} decimals
 * @returns {string} e.g. "2.4 MB"
 */
export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

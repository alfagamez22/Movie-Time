'use client';

export async function compressAnnouncementImage(file: File, signal?: AbortSignal, onProgress?: (percent: number) => void) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
  const { default: compression } = await import('browser-image-compression');
  const compressed = await compression(file, { maxSizeMB: 0.8, maxWidthOrHeight: 1600, initialQuality: 0.82, fileType: 'image/webp', useWebWorker: false, maxIteration: 15, signal, onProgress });
  if (compressed.size > 1024 * 1024) throw new Error('Could not reduce this image below 1 MB. Choose a smaller image.');
  return { data: await compression.getDataUrlFromFile(compressed), originalBytes: file.size, compressedBytes: compressed.size };
}

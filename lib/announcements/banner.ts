import sharp from 'sharp';

export async function processAnnouncementBanner(data: string) {
  const bytes = Buffer.from(data.split(',')[1] ?? '', 'base64');
  if (bytes.length > 2 * 1024 * 1024) throw new Error('Banner must be smaller than 2 MB.');
  try {
    const image = sharp(bytes, { limitInputPixels: 20000000, animated: false });
    const meta = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) throw new Error('Unsupported image.');
    const processed = await image.rotate().resize({ width: 1600, height: 900, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    if (processed.length > 1024 * 1024) throw new Error('Image too large.');
    return `data:image/webp;base64,${processed.toString('base64')}`;
  } catch { throw new Error('Could not process banner. Choose a static JPEG, PNG or WebP image under 2 MB.'); }
}

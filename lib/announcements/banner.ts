import sharp from 'sharp';

export async function processAnnouncementBanner(data: string) {
  const bytes = Buffer.from(data.split(',')[1] ?? '', 'base64');
  if (bytes.length > 2 * 1024 * 1024) throw new Error('Banner must be smaller than 2 MB.');
  try {
    // Reject other formats before Sharp probes their native decoders; MIME labels are untrusted.
    const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const webp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!jpeg && !png && !webp) throw new Error('Unsupported image signature.');
    const image = sharp(bytes, { limitInputPixels: 20000000, animated: false });
    const meta = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) throw new Error('Unsupported image.');
    for (const [width, quality] of [[1600, 82], [1400, 70], [1200, 60], [1000, 50]]) {
      const processed = await image.clone().rotate().resize({ width, height: Math.round(width * 9 / 16), fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
      if (processed.length <= 1024 * 1024) return `data:image/webp;base64,${processed.toString('base64')}`;
    }
    throw new Error('Image too large.');
  } catch { throw new Error('Could not process banner. Choose a static JPEG, PNG or WebP image under 2 MB.'); }
}

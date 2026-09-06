import sharp from 'sharp';
import { centeredCrops, coverCropsSchema, type CoverCrops } from '../packages/core/src/publication-protocol';
import { PublicationError } from './publication-errors';

export const COVER_UPLOAD_BYTES = 8 * 1024 * 1024;
export interface ProcessedCover { master: Buffer; thumbnail: Buffer; reading: Buffer; width: number; height: number; crops: CoverCrops; bytes: number }
export async function processCover(input: Buffer, requested?: CoverCrops): Promise<ProcessedCover> {
  try {
    if (!input.length || input.length > COVER_UPLOAD_BYTES) throw new Error('size');
    const source = sharp(input, { limitInputPixels: 40_000_000, animated: false, failOn: 'warning' });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new Error('format');
    const normalized = await source.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#fbf9f8' }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
    const { width, height } = normalized.info;
    const crops = coverCropsSchema.parse(requested ?? centeredCrops(width, height), { jitless: true });
    const render = async (crop: CoverCrops['thumbnail'], w: number, h: number) => {
      // Round both edges consistently and reject crops with the wrong display ratio.
      const left = Math.round(crop.x * width), top = Math.round(crop.y * height);
      const cw = Math.min(width - left, Math.round(crop.width * width));
      const ch = Math.min(height - top, Math.round(crop.height * height));
      if (cw < 1 || ch < 1 || Math.abs(cw / ch - w / h) > Math.max(.025, 2 / ch)) throw new Error('ratio');
      return sharp(normalized.data).extract({ left, top, width: cw, height: ch }).resize(w, h).jpeg({ quality: 85 }).toBuffer();
    };
    const [thumbnail, reading] = await Promise.all([render(crops.thumbnail, 400, 400), render(crops.reading, 1000, 800)]);
    return { master: normalized.data, thumbnail, reading, width, height, crops, bytes: normalized.data.length + thumbnail.length + reading.length };
  } catch {
    throw new PublicationError(400, 'invalid_cover', '这张封面无法处理，请选择 8MB 以内的 JPG、PNG 或 WebP 图片并重新裁切。');
  }
}

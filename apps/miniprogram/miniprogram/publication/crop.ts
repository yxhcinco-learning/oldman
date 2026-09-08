import { centeredCrops, type CoverCrops } from '../domain/core';
export type Crop = CoverCrops['thumbnail'];
export function validCrop(crop: Crop | null | undefined): crop is Crop {
  return Boolean(crop && [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) &&
    crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 &&
    crop.x + crop.width <= 1.000001 && crop.y + crop.height <= 1.000001);
}
/** The square is the central portion of the same 5:4 composition. */
export function compositionCrops(reading: Crop): CoverCrops {
  if (!validCrop(reading)) throw new Error('封面调整数据无效，请重新调整。');
  return { reading: { ...reading }, thumbnail: { x: reading.x + reading.width / 10, y: reading.y,
    width: reading.width * .8, height: reading.height } };
}
export function cropGeometry(crop: Crop | null | undefined, width: number, ratio: number) {
  if (!validCrop(crop) || !Number.isFinite(width) || width <= 0 || !Number.isFinite(ratio) || ratio <= 0) return null;
  const height = width / ratio;
  const geometry = { frameWidth: width, frameHeight: height, drawWidth: width / crop.width, drawHeight: height / crop.height,
    left: -crop.x * width / crop.width, top: -crop.y * height / crop.height };
  return Object.values(geometry).every(Number.isFinite) ? geometry : null;
}
export function fitCrop(width: number, height: number, ratio: number, zoom = 1, center = { x: .5, y: .5 }): Crop {
  const initial = centeredCrops(width, height)[ratio === 1 ? 'thumbnail' : 'reading'];
  const w = initial.width / Math.max(1, Math.min(4, zoom)), h = initial.height / Math.max(1, Math.min(4, zoom));
  return { x: Math.max(0, Math.min(1 - w, center.x - w / 2)), y: Math.max(0, Math.min(1 - h, center.y - h / 2)), width: w, height: h };
}
export function moveCrop(crop: Crop, dx: number, dy: number, viewportWidth: number, ratio: number): Crop {
  return { ...crop, x: Math.max(0, Math.min(1 - crop.width, crop.x - dx * crop.width / viewportWidth)),
    y: Math.max(0, Math.min(1 - crop.height, crop.y - dy * crop.height / (viewportWidth / ratio))) };
}

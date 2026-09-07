import { centeredCrops, type CoverCrops } from '../domain/core';
export type Crop = CoverCrops['thumbnail'];
export function fitCrop(width: number, height: number, ratio: number, zoom = 1, center = { x: .5, y: .5 }): Crop {
  const initial = centeredCrops(width, height)[ratio === 1 ? 'thumbnail' : 'reading'];
  const w = initial.width / Math.max(1, Math.min(4, zoom)), h = initial.height / Math.max(1, Math.min(4, zoom));
  return { x: Math.max(0, Math.min(1 - w, center.x - w / 2)), y: Math.max(0, Math.min(1 - h, center.y - h / 2)), width: w, height: h };
}
export function moveCrop(crop: Crop, dx: number, dy: number, viewportWidth: number, ratio: number): Crop {
  return { ...crop, x: Math.max(0, Math.min(1 - crop.width, crop.x - dx * crop.width / viewportWidth)),
    y: Math.max(0, Math.min(1 - crop.height, crop.y - dy * crop.height / (viewportWidth / ratio))) };
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { centeredCrops } from '../miniprogram/domain/core';
import { compositionCrops, cropGeometry, fitCrop, type Crop } from '../miniprogram/publication/crop';

type Definition = { data: Record<string, unknown>; methods: Record<string, (...args: never[]) => unknown>;
  observers: Record<string, (this: unknown) => void> };
type Model = { data: Record<string, unknown>; properties: Record<string, unknown>; setData(values: object, callback?: () => void): void;
  triggerEvent: ReturnType<typeof vi.fn>; observe(): void };
type ImageModel = Model & { imageLoaded(): void; imageFailed(): void; retry(): void };
type CropModel = Model & { data: Model['data'] & { rect: Crop; zoom: number }; reset(): void; enlarge(): void; end(): void;
  begin(event: { touches: { clientX: number; clientY: number }[] }): void;
  move(event: { touches: { clientX: number; clientY: number }[] }): void;
  zoomChanging(event: { detail: { value: number } }): void; zoomChanged(event: { detail: { value: number } }): void };
afterEach(() => vi.unstubAllGlobals());
async function mount(kind: 'image' | 'cropper', properties: Record<string, unknown>) {
  vi.resetModules(); let definition!: Definition;
  vi.stubGlobal('Component', (value: Definition) => { definition = value; });
  if (kind === 'image') await import('../miniprogram/components/cover-image/index');
  else await import('../miniprogram/components/cover-cropper/index');
  const model = { ...definition.methods, data: structuredClone(definition.data), properties, triggerEvent: vi.fn(),
    setData(values: object, callback?: () => void) { Object.assign(this.data, values); callback?.(); },
    observe() { Object.values(definition.observers).forEach(observer => observer.call(this)); } } as Model;
  model.observe(); return model;
}

describe('封面组件实际绘制状态', () => {
  it('裁切原图按有效像素绘制，5:4与方图呈现同一构图的中间区域', async () => {
    const crops = compositionCrops(fitCrop(1200, 800, 1.25, 2, { x: .6, y: .4 }));
    const wide = cropGeometry(crops.reading, 300, 1.25)!;
    const square = cropGeometry(crops.thumbnail, 240, 1)!;
    expect(square.drawWidth).toBeCloseTo(wide.drawWidth); expect(square.drawHeight).toBeCloseTo(wide.drawHeight);
    expect(square.left).toBeCloseTo(wide.left - 30); expect(square.top).toBeCloseTo(wide.top);
    const image = await mount('image', { src: '/account-a/photo.jpg', width: 300, ratio: 1.25, crop: crops.reading }) as ImageModel;
    expect(image.data).toMatchObject({ ...wide, valid: true, loaded: false, imageSource: '/account-a/photo.jpg' });
    image.imageLoaded(); expect(image.data).toMatchObject({ loaded: true, failed: false });
  });
  it('初始空矩形和无效尺寸不生成无限大图片，仍保留实际宿主大小与错误状态', async () => {
    const image = await mount('image', { src: '/account-a/photo.jpg', width: 70, ratio: 1.25, crop: {} }) as ImageModel;
    expect(image.data).toMatchObject({ valid: false, frameWidth: 70, frameHeight: 56, source: '/account-a/photo.jpg' });
    expect(Object.values(image.data).filter(value => typeof value === 'number').every(Number.isFinite)).toBe(true);
    for (const crop of [{ x: 0, y: 0, width: 0, height: 1 }, { x: NaN, y: 0, width: 1, height: 1 }, { x: .8, y: 0, width: .5, height: 1 }]) {
      expect(cropGeometry(crop, 300, 1.25)).toBeNull();
    }
    expect(cropGeometry(centeredCrops(640, 480).reading, Infinity, 1.25)).toBeNull();
    image.properties.crop = centeredCrops(640, 480).reading; image.observe();
    expect(image.data.valid).toBe(true);
  });
  it('图片加载失败提供重试，重试不丢失本机路径或裁切，换图清除旧失败状态', async () => {
    const crop = centeredCrops(640, 480).reading;
    const image = await mount('image', { src: '/account-a/photo.jpg', width: 342, ratio: 1.25, crop }) as ImageModel;
    image.imageFailed(); expect(image.data.failed).toBe(true); expect(image.triggerEvent).toHaveBeenCalledWith('error');
    const writes = vi.spyOn(image, 'setData'); image.retry();
    expect(writes).toHaveBeenCalledWith(expect.objectContaining({ imageSource: '' }), expect.any(Function));
    expect(image.data).toMatchObject({ imageSource: '/account-a/photo.jpg', valid: true, failed: false, loaded: false });
    expect(image.properties.crop).toEqual(crop); image.imageLoaded(); expect(image.data.loaded).toBe(true);
    image.imageFailed(); image.properties.src = '/account-a/replacement.jpg'; image.observe();
    expect(image.data).toMatchObject({ imageSource: '/account-a/replacement.jpg', failed: false, loaded: false });
  });
});

describe('单一封面构图手势与还原', () => {
  const properties = () => ({ sourceWidth: 640, sourceHeight: 480, ratio: 1.25, viewportWidth: 280, crop: fitCrop(640, 480, 1.25, 2), disabled: false });
  it('拖动中持续给出当前构图，结束保存最终位置，还原同时重置缩放与位置', async () => {
    const cropper = await mount('cropper', properties()) as CropModel;
    const original = { ...cropper.data.rect };
    cropper.begin({ touches: [{ clientX: 100, clientY: 100 }] });
    cropper.move({ touches: [{ clientX: 130, clientY: 120 }] });
    expect(cropper.data.rect).not.toEqual(original);
    expect(cropper.triggerEvent).toHaveBeenLastCalledWith('changing', { crop: cropper.data.rect });
    cropper.end(); expect(cropper.triggerEvent).toHaveBeenLastCalledWith('change', { crop: cropper.data.rect });
    cropper.reset(); expect(cropper.data.rect).toEqual(fitCrop(640, 480, 1.25)); expect(cropper.data.zoom).toBe(1);
    expect(cropper.triggerEvent).toHaveBeenLastCalledWith('change', { crop: cropper.data.rect });
  });
  it('滑杆和双指实时预览，保存中操作不改变构图', async () => {
    const cropper = await mount('cropper', properties()) as CropModel;
    cropper.zoomChanging({ detail: { value: 3 } }); expect(cropper.data.zoom).toBeCloseTo(3);
    expect(cropper.triggerEvent).toHaveBeenLastCalledWith('changing', { crop: cropper.data.rect });
    cropper.zoomChanged({ detail: { value: 3 } }); expect(cropper.triggerEvent).toHaveBeenLastCalledWith('change', { crop: cropper.data.rect });
    cropper.begin({ touches: [{ clientX: 50, clientY: 100 }, { clientX: 150, clientY: 100 }] });
    cropper.move({ touches: [{ clientX: 75, clientY: 100 }, { clientX: 125, clientY: 100 }] });
    expect(cropper.data.zoom).toBeCloseTo(1.5);
    const saved = { ...cropper.data.rect }; cropper.properties.disabled = true; cropper.triggerEvent.mockClear();
    cropper.reset(); cropper.enlarge(); cropper.zoomChanged({ detail: { value: 4 } }); cropper.end();
    expect(cropper.data.rect).toEqual(saved); expect(cropper.triggerEvent).not.toHaveBeenCalled();
  });
});

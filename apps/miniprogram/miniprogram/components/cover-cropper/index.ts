import { centeredCrops, type CoverCrops } from '../../domain/core';
import { cropGeometry, fitCrop, moveCrop, validCrop } from '../../publication/crop';
type Point = { clientX: number; clientY: number };
const gestures = new WeakMap<object, { points: Point[]; crop: CoverCrops['thumbnail']; zoom: number }>();
const distance = (points: Point[]) => points.length > 1 ? Math.hypot(points[1].clientX - points[0].clientX, points[1].clientY - points[0].clientY) : 0;
Component({
  properties: { disabled: Boolean, dark: Boolean, src: String, sourceWidth: Number, sourceHeight: Number, ratio: { type: Number, value: 1 }, viewportWidth: { type: Number, value: 300 }, crop: { type: Object, value: {} } },
  data: { rect: { x: 0, y: 0, width: 1, height: 1 }, frameWidth: 300, frameHeight: 240, drawWidth: 300, drawHeight: 300, left: 0, top: 0, zoom: 1, failed: false },
  observers: { 'crop, sourceWidth, sourceHeight, ratio, viewportWidth': function () {
    if (!this.properties.sourceWidth || !this.properties.sourceHeight) return;
    const rect = this.properties.crop as CoverCrops['thumbnail'] | null;
    this.render(validCrop(rect) ? rect : fitCrop(this.properties.sourceWidth, this.properties.sourceHeight, this.properties.ratio));
  } },
  methods: {
    render(rect: CoverCrops['thumbnail']) {
      const width = this.properties.viewportWidth, ratio = this.properties.ratio;
      const baseline = centeredCrops(this.properties.sourceWidth, this.properties.sourceHeight)[ratio === 1 ? 'thumbnail' : 'reading'];
      const geometry = cropGeometry(rect, width, ratio);
      if (geometry) this.setData({ rect, ...geometry, zoom: baseline.width / rect.width });
    },
    begin(event: WechatMiniprogram.TouchEvent) {
      if (this.properties.disabled) return;
      gestures.set(this, { points: event.touches.map(p => ({ clientX: p.clientX, clientY: p.clientY })), crop: { ...this.data.rect }, zoom: this.data.zoom });
    },
    move(event: WechatMiniprogram.TouchEvent) {
      const start = gestures.get(this);
      if (this.properties.disabled || !start || !event.touches.length) return;
      if (start.points.length > 1 && event.touches.length > 1 && distance(start.points)) {
        this.render(fitCrop(this.properties.sourceWidth, this.properties.sourceHeight, this.properties.ratio,
          start.zoom * distance(event.touches) / distance(start.points), { x: start.crop.x + start.crop.width / 2, y: start.crop.y + start.crop.height / 2 }));
      } else this.render(moveCrop(start.crop, event.touches[0].clientX - start.points[0].clientX, event.touches[0].clientY - start.points[0].clientY, this.properties.viewportWidth, this.properties.ratio));
      this.triggerEvent('changing', { crop: this.data.rect });
    },
    end() { if (this.properties.disabled) { gestures.delete(this); return; } gestures.delete(this); this.triggerEvent('change', { crop: this.data.rect }); },
    zoomBy(delta: number) {
      if (this.properties.disabled) return;
      const r = this.data.rect;
      this.render(fitCrop(this.properties.sourceWidth, this.properties.sourceHeight, this.properties.ratio, this.data.zoom + delta, { x: r.x + r.width / 2, y: r.y + r.height / 2 }));
      this.end();
    },
    zoomChanging(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
      if (this.properties.disabled) return;
      const r = this.data.rect;
      this.render(fitCrop(this.properties.sourceWidth, this.properties.sourceHeight, this.properties.ratio, event.detail.value,
        { x: r.x + r.width / 2, y: r.y + r.height / 2 }));
      this.triggerEvent('changing', { crop: this.data.rect });
    },
    zoomChanged(event: WechatMiniprogram.CustomEvent<{ value: number }>) { this.zoomChanging(event); this.end(); },
    reset() {
      if (this.properties.disabled) return;
      this.render(fitCrop(this.properties.sourceWidth, this.properties.sourceHeight, this.properties.ratio)); this.end();
    },
    imageFailed() { this.setData({ failed: true }); this.triggerEvent('error'); },
    imageLoaded() { this.setData({ failed: false }); },
    enlarge() { this.zoomBy(.25); },
    shrink() { this.zoomBy(-.25); },
  },
});

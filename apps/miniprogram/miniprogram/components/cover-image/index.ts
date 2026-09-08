import { cropGeometry, type Crop } from '../../publication/crop';

Component({
  properties: { src: String, width: { type: Number, value: 300 }, ratio: { type: Number, value: 1.25 }, crop: { type: Object, value: {} } },
  data: { frameWidth: 300, frameHeight: 240, drawWidth: 300, drawHeight: 240, left: 0, top: 0,
    imageSource: '', source: '', valid: false, failed: false, loaded: false },
  observers: { 'src, width, ratio, crop': function () {
    const { src, width, ratio, crop } = this.properties;
    const geometry = cropGeometry(crop as Crop, width, ratio);
    const changed = src !== this.data.source;
    const frameWidth = Number.isFinite(width) && width > 0 ? width : 300;
    const frameHeight = frameWidth / (Number.isFinite(ratio) && ratio > 0 ? ratio : 1.25);
    this.setData({ frameWidth, frameHeight, ...(geometry ?? {}), valid: Boolean(geometry),
      ...(changed ? { source: src, imageSource: src, failed: false, loaded: false } : {}) });
  } },
  methods: {
    imageLoaded() { this.setData({ loaded: true, failed: false }); },
    imageFailed() { this.setData({ failed: true, loaded: false }); this.triggerEvent('error'); },
    retry() {
      this.setData({ imageSource: '', failed: false, loaded: false }, () => {
        this.setData({ imageSource: this.properties.src });
      });
    },
  },
});

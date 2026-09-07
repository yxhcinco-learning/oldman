/** WeChat bridges can return ArrayBuffers from a different JavaScript realm. */
export function publicationBytes(value: unknown): ArrayBuffer {
  if (Object.prototype.toString.call(value) !== '[object ArrayBuffer]') throw new Error('图片读取失败，请重新选择。');
  const buffer = value as ArrayBuffer;
  if (!buffer.byteLength || buffer.byteLength > 8 * 1024 * 1024) throw new Error('请选择 8MB 以内的图片。');
  return Uint8Array.from(new Uint8Array(buffer)).buffer;
}

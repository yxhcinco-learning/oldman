type PortableCrypto = {
  randomUUID?: () => string;
};

type PortableGlobals = typeof globalThis & {
  crypto?: PortableCrypto;
  structuredClone?: <T>(value: T) => T;
};

const globals = globalThis as PortableGlobals;

/** Domain identifiers are uniqueness keys, not authentication credentials. */
export function portableId(): string {
  const uuid = globals.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const random = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return `${Date.now().toString(36)}-${random()}-${random()}`;
}

export function cloneValue<T>(value: T): T {
  return globals.structuredClone ? globals.structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

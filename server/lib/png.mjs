// PNG checks without an image library: strict base64, signature, and the
// IHDR chunk (width, height, CRC).

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Decodes and checks a base64 PNG. Returns { bytes, width, height } or
 * { error } with a client-safe message.
 */
export function inspectPngBase64(image, { maxBytes, maxSide }) {
  if (typeof image !== "string" || image.length === 0) return { error: "image must be a non-empty base64 string." };
  if (image.startsWith("data:")) return { error: "image must be raw base64 without a data: prefix." };
  if (image.length % 4 !== 0 || !BASE64.test(image)) return { error: "image is not valid base64." };
  // Cheap size check before decoding.
  const padding = image.endsWith("==") ? 2 : image.endsWith("=") ? 1 : 0;
  const decodedLength = (image.length / 4) * 3 - padding;
  if (decodedLength > maxBytes) return { error: `image exceeds ${maxBytes} bytes when decoded.` };

  const bytes = Buffer.from(image, "base64");
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(SIGNATURE)) return { error: "image is not a PNG." };
  // First chunk must be IHDR with a 13-byte payload.
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString("latin1", 12, 16) !== "IHDR") {
    return { error: "image is not a valid PNG (missing IHDR)." };
  }
  if (crc32(bytes.subarray(12, 29)) !== bytes.readUInt32BE(29)) {
    return { error: "image is not a valid PNG (bad IHDR checksum)." };
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) return { error: "image has zero width or height." };
  if (width > maxSide || height > maxSide) return { error: `image must be ${maxSide} px or smaller per side.` };
  return { bytes, width, height };
}

/** Builds a minimal valid PNG header (signature + IHDR) for tests and fixtures. */
export function pngHeader(width, height) {
  const ihdr = Buffer.alloc(17);
  ihdr.write("IHDR", 0, "latin1");
  ihdr.writeUInt32BE(width, 4);
  ihdr.writeUInt32BE(height, 8);
  ihdr.set([8, 6, 0, 0, 0], 12); // 8-bit RGBA, default compression/filter/interlace
  const len = Buffer.alloc(4);
  len.writeUInt32BE(13);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(ihdr));
  return Buffer.concat([SIGNATURE, len, ihdr, crc]);
}

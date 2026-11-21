// Reads the pixel size of a JPEG or PNG from its header, without decoding it.

/** { type: 'jpeg' | 'png', width, height }, or null when the bytes are neither. */
export function imageSize(bytes) {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) return { type: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let at = 2
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null
    const marker = bytes[at + 1]
    if (marker === 0xff) { at += 1; continue }
    const isFrameStart = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isFrameStart) return { type: 'jpeg', width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) }
    at += 2 + bytes.readUInt16BE(at + 2)
  }
  return null
}

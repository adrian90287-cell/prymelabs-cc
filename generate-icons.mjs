/**
 * Generates icon-192.png and icon-512.png for the PWA manifest.
 * Pure Node.js — no dependencies needed.
 * Run: node generate-icons.mjs
 */
import { deflateSync } from 'zlib'
import { writeFileSync } from 'fs'

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[i] = c
    }
    return t
  })()
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const crcBuf = Buffer.concat([typeBytes, data])
  const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcBuf))
  return Buffer.concat([len, typeBytes, data, crcVal])
}

function makePng(size) {
  // Build RGBA pixel data with a "PL" look: dark bg + blue accent square
  const pixels = new Uint8Array(size * size * 4)

  // Background: #09090b  (9, 9, 11)
  const bg = [9, 9, 11, 255]
  // Card bg: #12121f  (18, 18, 31)
  const card = [18, 18, 31, 255]
  // White: #ffffff
  const white = [255, 255, 255, 255]
  // Blue: #3b82f6  (59, 130, 246)
  const blue = [59, 130, 246, 255]

  const setPixel = (x, y, r, g, b, a) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 4
    pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a
  }

  const fill = (x0, y0, x1, y1, color) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        setPixel(x, y, ...color)
  }

  // Background fill
  fill(0, 0, size, size, bg)

  // Rounded card (inner square with padding ~12%)
  const pad = Math.round(size * 0.12)
  fill(pad, pad, size - pad, size - pad, card)

  // Draw "P" as a simple block letter (3 cols × 5 rows grid, scaled)
  const unit = Math.max(1, Math.round(size * 0.07))
  const startX = Math.round(size * 0.18)
  const startY = Math.round(size * 0.25)

  // "P" — column 1 full, top-right corner, middle bar
  for (let row = 0; row < 5; row++) fill(startX, startY + row * unit, startX + unit, startY + (row + 1) * unit, white)
  for (let row = 0; row < 2; row++) fill(startX + unit, startY + row * unit, startX + 2 * unit, startY + (row + 1) * unit, white)
  fill(startX + unit, startY + 2 * unit, startX + 2 * unit, startY + 3 * unit, white)

  // "L" — column 1 full, bottom bar
  const lX = startX + Math.round(size * 0.28)
  for (let row = 0; row < 5; row++) fill(lX, startY + row * unit, lX + unit, startY + (row + 1) * unit, white)
  fill(lX, startY + 4 * unit, lX + 3 * unit, startY + 5 * unit, white)

  // Blue dot accent (bottom right area)
  const dotCx = Math.round(size * 0.72)
  const dotCy = Math.round(size * 0.72)
  const dotR  = Math.round(size * 0.07)
  for (let y = dotCy - dotR; y <= dotCy + dotR; y++) {
    for (let x = dotCx - dotR; x <= dotCx + dotR; x++) {
      const dx = x - dotCx, dy = y - dotCy
      if (dx * dx + dy * dy <= dotR * dotR) setPixel(x, y, ...blue)
    }
  }

  // Build PNG filtered scanlines (filter 0 = None, prepend 0x00 each row)
  const filtered = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4)
    filtered[rowStart] = 0  // filter type None
    for (let x = 0; x < size; x++) {
      const pi = (y * size + x) * 4
      filtered[rowStart + 1 + x * 4]     = pixels[pi]
      filtered[rowStart + 1 + x * 4 + 1] = pixels[pi + 1]
      filtered[rowStart + 1 + x * 4 + 2] = pixels[pi + 2]
      filtered[rowStart + 1 + x * 4 + 3] = pixels[pi + 3]
    }
  }

  const compressed = deflateSync(filtered)

  const sig  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8]  = 8  // bit depth
  ihdr[9]  = 6  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))])
}

writeFileSync('public/icon-192.png', makePng(192))
writeFileSync('public/icon-512.png', makePng(512))
console.log('✅  public/icon-192.png and public/icon-512.png created')

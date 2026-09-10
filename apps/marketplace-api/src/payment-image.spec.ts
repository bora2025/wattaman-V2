import { MAX_QR_IMAGE_BYTES, validateImageDataUrl } from './payment-image';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const dataUrl = (type: string, bytes: Buffer) => `data:image/${type};base64,${bytes.toString('base64')}`;
const png = (padding = 32) => dataUrl('png', Buffer.concat([PNG_SIGNATURE, Buffer.alloc(padding)]));

describe('validateImageDataUrl', () => {
  it('accepts a PNG whose bytes match its label', () => {
    expect(validateImageDataUrl(png(), MAX_QR_IMAGE_BYTES, 'QR code')).toBe(png());
  });

  it('accepts JPEG and WebP by their signatures', () => {
    const jpeg = dataUrl('jpeg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]));
    const webp = dataUrl('webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(32)]));
    expect(() => validateImageDataUrl(jpeg, MAX_QR_IMAGE_BYTES, 'QR code')).not.toThrow();
    expect(() => validateImageDataUrl(webp, MAX_QR_IMAGE_BYTES, 'QR code')).not.toThrow();
  });

  // SVG is the one common image format that can carry script.
  it('refuses an SVG outright', () => {
    const svg = dataUrl('svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'));
    expect(() => validateImageDataUrl(svg, MAX_QR_IMAGE_BYTES, 'QR code')).toThrow(/PNG, JPEG or WebP/);
  });

  // The prefix is whatever the client wrote; the bytes decide.
  it('refuses markup relabelled as a PNG', () => {
    const disguised = dataUrl('png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'));
    expect(() => validateImageDataUrl(disguised, MAX_QR_IMAGE_BYTES, 'QR code')).toThrow(/not a valid PNG/);
  });

  it('refuses a JPEG label on PNG bytes', () => {
    const mislabelled = dataUrl('jpeg', Buffer.concat([PNG_SIGNATURE, Buffer.alloc(32)]));
    expect(() => validateImageDataUrl(mislabelled, MAX_QR_IMAGE_BYTES, 'QR code')).toThrow(/not a valid JPEG/);
  });

  it('refuses an image over its cap, naming the limit', () => {
    expect(() => validateImageDataUrl(png(MAX_QR_IMAGE_BYTES), MAX_QR_IMAGE_BYTES, 'QR code')).toThrow(/under 120 KB/);
  });

  it('refuses something that is not a base64 data URL', () => {
    expect(() => validateImageDataUrl('https://example.com/qr.png', MAX_QR_IMAGE_BYTES, 'QR code')).toThrow(/PNG, JPEG or WebP/);
    expect(() => validateImageDataUrl('data:image/png;base64,not base64!', MAX_QR_IMAGE_BYTES, 'QR code')).toThrow(/PNG, JPEG or WebP/);
  });
});

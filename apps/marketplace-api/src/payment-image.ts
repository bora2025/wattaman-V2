import { HttpError } from './http-error';

/**
 * Images handed to the marketplace as data URLs: a bank's receiving QR code, set by an operator,
 * and a customer's transfer receipt.
 *
 * The data-URL prefix is whatever the client chose to write, so it is never trusted on its own. The
 * decoded bytes must carry the signature of the format the prefix claims -- which is what keeps an
 * SVG, the one common image format that can carry script, from arriving relabelled as a PNG.
 *
 * Both caps sit well inside the API's 256kb JSON limit once base64 inflates them by a third, which
 * is why clients downscale before uploading rather than that limit being raised for every route.
 */
export const MAX_QR_IMAGE_BYTES = 120 * 1024;
export const MAX_RECEIPT_IMAGE_BYTES = 150 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const SIGNATURES: Record<'png' | 'jpeg' | 'webp', (bytes: Buffer) => boolean> = {
  png: (bytes) => bytes.length > PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
  jpeg: (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  webp: (bytes) => bytes.length > 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP',
};

export function validateImageDataUrl(value: string, maxBytes: number, label: string): string {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new HttpError(400, `${label} must be a PNG, JPEG or WebP image`);
  const format = match[1] as 'png' | 'jpeg' | 'webp';
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > maxBytes) throw new HttpError(413, `${label} must be under ${Math.floor(maxBytes / 1024)} KB`);
  if (!SIGNATURES[format](bytes)) throw new HttpError(400, `${label} is not a valid ${format.toUpperCase()} image`);
  return value;
}

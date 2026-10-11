import sharp from 'sharp';
import type { Metadata, Sharp } from 'sharp';
import { BadRequestError } from '../../errors/app.error.js';

/**
 * Validates and sanitises one student-uploaded image before it is shown to a
 * model.
 *
 * Two jobs, both mandatory for a product used by eleven-year-olds:
 *
 *  1. Prove it really is an image we support. The browser's Content-Type is a
 *     claim, not evidence - `accept=` on a file input is a filter hint that any
 *     student can defeat by choosing "All files" - so the real file signature
 *     decides, and sharp has to agree it can decode the result.
 *
 *  2. Strip everything that is not picture. A photo taken on a phone carries
 *     EXIF with GPS coordinates, device model and a timestamp. A child
 *     photographing homework at the kitchen table is otherwise transmitting
 *     their home address. Client-side canvas re-encoding also strips metadata,
 *     but a client cannot be trusted, so this is done here and this is the
 *     authoritative copy.
 *
 * Nothing in this file logs or returns image bytes, and no error message
 * carries file content - only the reason, in words a student can read.
 */

/** The only formats the MVP accepts. HEIC is deliberately excluded. */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/**
 * 4 MB of original upload. Comfortably fits a phone photo while staying far
 * below anything that would strain a request. Enforced by multer before the
 * bytes are even fully buffered, and re-checked here.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Guards against decompression bombs and against 2x2 pixel noise. */
export const MIN_IMAGE_DIMENSION = 16;
export const MAX_IMAGE_DIMENSION = 8000;

/**
 * The longest edge the model actually needs. Downscaling here is not cosmetic:
 * it cuts the number of image tokens billed per turn, and a 1600px photo of a
 * homework page is already more than legible.
 */
const MAX_OUTPUT_DIMENSION = 1600;

export interface SanitisedImage {
  mimeType: AllowedImageMimeType;
  data: Buffer;
  width: number;
  height: number;
  bytes: number;
}

/**
 * File signatures, checked against the real bytes rather than the declared type.
 *
 * WebP needs two checks because the container is RIFF: bytes 0-3 are "RIFF",
 * bytes 8-11 are "WEBP", and the four in between are a length.
 */
function sniffMimeType(buffer: Buffer): AllowedImageMimeType | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    return 'image/png';
  }

  // WebP: "RIFF" .... "WEBP"
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }

  return null;
}

/** Maps a sniffed type to the sharp encoder that produces metadata-free output. */
function encodeWithoutMetadata(
  pipeline: Sharp,
  mimeType: AllowedImageMimeType
): Sharp {
  switch (mimeType) {
    case 'image/jpeg':
      return pipeline.jpeg({ quality: 85 });
    case 'image/png':
      return pipeline.png({ compressionLevel: 9 });
    case 'image/webp':
      return pipeline.webp({ quality: 85 });
  }
}

/**
 * Validates, strips metadata from, and downscales one uploaded image.
 *
 * Throws BadRequestError with a student-readable reason. Never throws a message
 * containing bytes, a path, or a library detail.
 */
export async function validateAndSanitiseImage(
  buffer: Buffer,
  declaredMimeType?: string
): Promise<SanitisedImage> {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestError('That image looked empty. Try choosing it again.');
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new BadRequestError(
      `That photo is too big. Please use one under ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`
    );
  }

  // The real bytes decide. A renamed .exe, a PDF, or a text file all stop here.
  const sniffed = sniffMimeType(buffer);
  if (!sniffed) {
    throw new BadRequestError('That file is not a photo ED can read. Use a JPG, PNG or WebP.');
  }

  // A declared type that disagrees with the bytes is a red flag, not a tiebreak:
  // the sniffed type always wins, and a mismatch is rejected outright.
  if (declaredMimeType) {
    const declared = declaredMimeType.split(';')[0].trim().toLowerCase();
    const normalised = declared === 'image/jpg' ? 'image/jpeg' : declared;
    if (normalised !== sniffed) {
      throw new BadRequestError('That file is not a photo ED can read. Use a JPG, PNG or WebP.');
    }
  }

  let pipeline: Sharp;
  let metadata: Metadata;
  try {
    // failOn 'error' makes sharp reject truncated or corrupt data rather than
    // silently decoding whatever it can.
    pipeline = sharp(buffer, { failOn: 'error' });
    metadata = await pipeline.metadata();
  } catch {
    // Deliberately swallows the library error: it can contain offsets and
    // internal detail that mean nothing to a student.
    throw new BadRequestError('That photo seems damaged. Try taking or choosing it again.');
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
    throw new BadRequestError('That photo is too small to read. Try a clearer one.');
  }

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new BadRequestError('That photo is too large. Try a smaller one.');
  }

  let clean: Buffer;
  try {
    // The re-encode is what actually removes EXIF, GPS, device make and model,
    // timestamps and colour-profile extras: sharp drops all metadata unless
    // withMetadata() is called, and it is deliberately not called here.
    //
    // .rotate() with no argument applies the EXIF orientation flag BEFORE the
    // metadata is discarded, so a photo taken sideways still arrives upright
    // once the flag that described it is gone.
    const resized = pipeline
      .rotate()
      .resize({
        width: MAX_OUTPUT_DIMENSION,
        height: MAX_OUTPUT_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true
      });

    clean = await encodeWithoutMetadata(resized, sniffed).toBuffer();
  } catch {
    throw new BadRequestError('ED could not read that photo. Try a different one.');
  }

  if (clean.length === 0) {
    throw new BadRequestError('ED could not read that photo. Try a different one.');
  }

  const finalMeta = await sharp(clean).metadata();

  return {
    mimeType: sniffed,
    data: clean,
    width: finalMeta.width ?? width,
    height: finalMeta.height ?? height,
    bytes: clean.length
  };
}

import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../errors/app.error.js';
import { MAX_IMAGE_BYTES } from '../services/ai/image-validation.service.js';

/**
 * Multipart handling for a single tutor photo.
 *
 * Deliberately isolated to the one route that needs it, so the global
 * express.json({ limit: '2mb' }) is untouched: raising that would widen the
 * request surface of every JSON endpoint in the app just to carry a photo.
 *
 * Memory storage, because nothing is written to disk. The bytes live for the
 * length of one request, go to validation, then to the model, and are never
 * persisted anywhere.
 *
 * A non-multipart request passes straight through, so ordinary text turns on
 * this same route are completely unaffected.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    // Only `message` and `action` are expected alongside the file.
    fields: 8,
    parts: 12
  },
  fileFilter: (_req, file, callback) => {
    // A cheap first gate only. The declared type is a claim, so the real
    // decision is made later from the file signature in image-validation.
    if (/^image\/(jpeg|png|webp)$/i.test(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new BadRequestError('That file is not a photo ED can read. Use a JPG, PNG or WebP.'));
  }
});

const singleImage = upload.single('image');

/**
 * Wraps multer so its own errors become safe, student-readable ones. Multer
 * reports a size overrun as a MulterError with an internal code; a child
 * should see a sentence, not LIMIT_FILE_SIZE.
 */
export function uploadTutorImage(req: Request, res: Response, next: NextFunction): void {
  singleImage(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(
          new BadRequestError(
            `That photo is too big. Please use one under ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`
          )
        );
        return;
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        next(new BadRequestError('Send one photo at a time.'));
        return;
      }
      next(new BadRequestError('ED could not read that upload. Try again.'));
      return;
    }

    next(err);
  });
}

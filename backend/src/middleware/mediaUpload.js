import { createWriteStream } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Busboy from 'busboy';
import { AppError } from '../utils/AppError.js';

const uploadDir = join(tmpdir(), 'gbp-automation-uploads');
mkdirSync(uploadDir, { recursive: true });

function setFormField(target, name, value) {
  if (target[name] === undefined) {
    target[name] = value;
    return;
  }
  if (Array.isArray(target[name])) {
    target[name].push(value);
    return;
  }
  target[name] = [target[name], value];
}

/**
 * Read a form field from multer/busboy body (null prototype object).
 */
export function getFormField(body, fieldName) {
  if (!body || typeof body !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(body, fieldName)) {
    return body[fieldName];
  }
  const want = fieldName.toLowerCase();
  for (const key of Object.keys(body)) {
    if (key.toLowerCase() === want) return body[key];
  }
  return undefined;
}

export function pickFormString(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  return String(value).trim();
}

/**
 * Parse multipart/form-data (file + text fields). Runs before route handler so
 * req.body is populated even when the file part is sent before text fields.
 * GBP media uploads also need a postType field.
 */
export function parseMediaMultipart(req, res, next) {
  return parseMultipart(req, res, next, { requirePostType: true });
}

/** Image upload with no postType (generated-site images). Sets req.uploadedFile. */
export function parseImageMultipart(req, res, next) {
  return parseMultipart(req, res, next, { requirePostType: false });
}

function parseMultipart(req, res, next, { requirePostType }) {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return next(
      new AppError('Content-Type must be multipart/form-data.', 400, {
        code: 'INVALID_CONTENT_TYPE',
      }),
    );
  }

  req.body = Object.create(null);
  let uploadedFile = null;
  const pendingFiles = [];
  let busboy;

  const fail = (err) => {
    if (busboy) {
      req.unpipe(busboy);
    }
    next(err instanceof AppError ? err : new AppError(err.message || 'Upload failed.', 400, {
      code: 'UPLOAD_ERROR',
    }));
  };

  try {
    busboy = Busboy({ headers: req.headers });
  } catch (e) {
    return fail(e);
  }

  busboy.on('field', (name, value) => {
    setFormField(req.body, name, value);
  });

  busboy.on('file', (name, stream, info) => {
    if (name !== 'file') {
      stream.resume();
      return;
    }

    if (uploadedFile) {
      stream.resume();
      return;
    }

    const mimeType = info.mimeType ?? '';
    if (mimeType && !mimeType.startsWith('image/')) {
      stream.resume();
      fail(new Error('Only image uploads are allowed.'));
      return;
    }

    const ext = info.filename?.includes('.') ? info.filename.split('.').pop() : 'jpg';
    const path = join(uploadDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);

    const writeStream = createWriteStream(path);
    stream.pipe(writeStream);

    pendingFiles.push(
      new Promise((resolve, reject) => {
        writeStream.on('finish', () => {
          uploadedFile = {
            fieldname: name,
            originalname: info.filename,
            mimetype: mimeType,
            path,
          };
          resolve();
        });
        writeStream.on('error', reject);
        stream.on('error', reject);
      }),
    );
  });

  busboy.on('error', (err) => fail(err));

  busboy.on('close', async () => {
    try {
      await Promise.all(pendingFiles);

      if (!uploadedFile?.path) {
        return next(
          new AppError('No file uploaded. Use multipart field name `file`.', 400, {
            code: 'FILE_REQUIRED',
          }),
        );
      }

      if (!requirePostType) {
        req.uploadedFile = uploadedFile;
        return next();
      }

      const postType = pickFormString(
        getFormField(req.body, 'postType') ?? req.query?.postType,
      );

      if (!postType) {
        return next(
          new AppError('postType is required (UPDATE, OFFER, or EVENT).', 400, {
            code: 'INVALID_BODY',
            details: {
              hint: 'Send postType as a text field in form-data (e.g. UPDATE).',
              bodyKeys: Object.keys(req.body),
            },
          }),
        );
      }

      req.uploadedFile = uploadedFile;
      req.parsedPostType = postType;
      next();
    } catch (e) {
      fail(e);
    }
  });

  req.pipe(busboy);
}

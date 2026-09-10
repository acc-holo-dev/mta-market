// File upload routes
import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../lib/auth";
import { standardRateLimit, strictRateLimit } from "../lib/rateLimit";
import { upload, getFileUrl, deleteFile } from "../lib/upload";
import { uploadToS3, S3_ENABLED, getS3PublicUrl } from "../lib/s3";
import {
  MEDIA_MAX_BYTES,
  validateImageBuffer,
  mediaFilename,
  sniffImageType,
} from "../lib/media";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { reqLog } from "../middleware/requestId";

const router: Router = Router();

// PLAN-003 A-005: media uploads get their own multer instance — strict size
// limit and image-only storage naming (opaque media-<hex><ext> names, so a
// media upload can never shadow an artifact file).
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, process.env.UPLOAD_DIR || "./uploads"),
    filename: (_req, _file, cb) => {
      // Temporary name during validation; renamed to the opaque media- name
      // after magic-byte validation passes.
      cb(null, `tmp-${crypto.randomBytes(16).toString("hex")}`);
    },
  }),
  limits: { fileSize: MEDIA_MAX_BYTES },
});

/**
 * POST /upload/media — upload a cover/screenshot image (authenticated).
 * PLAN-003 A-002/A-005: magic-byte sniffed validation, opaque naming,
 * 5 MB limit. Returns the public URL used by the resource media endpoints.
 */
router.post(
  "/media",
  authenticate,
  strictRateLimit,
  mediaUpload.single("file"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const buffer = fs.readFileSync(req.file.path);
      const rejection = validateImageBuffer(buffer, req.file.mimetype, req.file.originalname);
      if (rejection) {
        deleteFile(req.file.filename);
        res.status(400).json({ error: rejection });
        return;
      }

      const sniffed = sniffImageType(buffer);
      if (!sniffed) {
        deleteFile(req.file.filename);
        res.status(400).json({ error: "Unsupported image format" });
        return;
      }

      if (S3_ENABLED) {
        const fileKey = await uploadToS3({
          buffer,
          originalName: req.file.originalname,
          mimeType: sniffed.mime,
          folder: "media",
        });
        deleteFile(req.file.filename);
        res.status(201).json({
          url: getS3PublicUrl(fileKey),
          mimeType: sniffed.mime,
          sizeBytes: buffer.length,
          storage: "s3",
        });
        return;
      }

      // Local storage: atomically rename the validated temp file to the
      // opaque media name (only validated images get media- names).
      const name = mediaFilename(sniffed.extension);
      const target = path.resolve(process.env.UPLOAD_DIR || "./uploads", name);
      fs.renameSync(req.file.path, target);

      res.status(201).json({
        url: `/media/${name}`,
        mimeType: sniffed.mime,
        sizeBytes: buffer.length,
        storage: "local",
      });
    } catch (error) {
      reqLog(req).error("media_upload_failed", { error });

      // Cleanup the temp upload file when it still exists.
      if (req.file) {
        deleteFile(req.file.filename);
      }

      res.status(500).json({ error: "Failed to upload media" });
    }
  }
);

// POST /upload/resource - Upload resource file (authenticated)
router.post(
  "/resource",
  authenticate,
  strictRateLimit,
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      // Compute checksum BEFORE any cleanup (the local temp file is removed
      // after an S3 upload, so it must be read first).
      const buffer = fs.readFileSync(req.file.path);
      const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

      let fileUrl: string;
      let fileKey: string | null = null;

      // Upload to S3 if enabled, otherwise use local storage
      if (S3_ENABLED) {
        fileKey = await uploadToS3({
          buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          folder: "resources",
        });
        // TASK A-009: store the OBJECT KEY, never a public URL — paid
        // artifacts are downloaded exclusively via short-lived signed URLs.
        fileUrl = fileKey;

        // Delete local file after S3 upload
        deleteFile(req.file.filename);
      } else {
        // Local storage: opaque reference; downloads go through the
        // authorized versions download route (no public static serving).
        fileUrl = `/uploads/${req.file.filename}`;
      }

      res.status(201).json({
        fileUrl,
        fileKey,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileChecksum: checksum,
        mimeType: req.file.mimetype,
        storage: S3_ENABLED ? "s3" : "local",
      });
    } catch (error) {
      reqLog(req).error("file_upload_failed", { error });

      // Cleanup on error
      if (req.file) {
        deleteFile(req.file.filename);
      }

      res.status(500).json({ error: "Failed to upload file" });
    }
  }
);

// POST /upload/avatar - Upload user avatar (authenticated)
router.post(
  "/avatar",
  authenticate,
  standardRateLimit,
  upload.single("avatar"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      // Validate image type
      if (!req.file.mimetype.startsWith("image/")) {
        deleteFile(req.file.filename);
        res.status(400).json({ error: "File must be an image" });
        return;
      }

      let avatarUrl: string;

      if (S3_ENABLED) {
        const buffer = fs.readFileSync(req.file.path);
        const fileKey = await uploadToS3({
          buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          folder: "avatars",
        });
        avatarUrl = getS3PublicUrl(fileKey);
        deleteFile(req.file.filename);
      } else {
        avatarUrl = getFileUrl(req.file.filename);
      }

      // TODO: Update user avatar in database
      // await db.orm.public.User
      //   .where({ id: req.user!.userId })
      //   .update({ avatar: avatarUrl });

      res.status(201).json({
        avatarUrl,
        storage: S3_ENABLED ? "s3" : "local",
      });
    } catch (error) {
      reqLog(req).error("avatar_upload_failed", { error });

      if (req.file) {
        deleteFile(req.file.filename);
      }

      res.status(500).json({ error: "Failed to upload avatar" });
    }
  }
);

// POST /upload/screenshot - Upload resource screenshot (authenticated)
router.post(
  "/screenshot",
  authenticate,
  standardRateLimit,
  upload.single("screenshot"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      // Validate image type
      if (!req.file.mimetype.startsWith("image/")) {
        deleteFile(req.file.filename);
        res.status(400).json({ error: "File must be an image" });
        return;
      }

      let screenshotUrl: string;

      if (S3_ENABLED) {
        const buffer = fs.readFileSync(req.file.path);
        const fileKey = await uploadToS3({
          buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          folder: "screenshots",
        });
        screenshotUrl = getS3PublicUrl(fileKey);
        deleteFile(req.file.filename);
      } else {
        screenshotUrl = getFileUrl(req.file.filename);
      }

      res.status(201).json({
        screenshotUrl,
        storage: S3_ENABLED ? "s3" : "local",
      });
    } catch (error) {
      reqLog(req).error("screenshot_upload_failed", { error });

      if (req.file) {
        deleteFile(req.file.filename);
      }

      res.status(500).json({ error: "Failed to upload screenshot" });
    }
  }
);

export default router;

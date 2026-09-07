// File upload routes
import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../lib/auth";
import { standardRateLimit, strictRateLimit } from "../lib/rateLimit";
import { upload, getFileUrl, deleteFile } from "../lib/upload";
import { uploadToS3, S3_ENABLED, getS3PublicUrl } from "../lib/s3";
import crypto from "crypto";
import fs from "fs";

const router: Router = Router();

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

      let fileUrl: string;
      let fileKey: string | null = null;

      // Upload to S3 if enabled, otherwise use local storage
      if (S3_ENABLED) {
        const buffer = fs.readFileSync(req.file.path);
        fileKey = await uploadToS3({
          buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          folder: "resources",
        });
        fileUrl = getS3PublicUrl(fileKey);

        // Delete local file after S3 upload
        deleteFile(req.file.filename);
      } else {
        fileUrl = getFileUrl(req.file.filename);
      }

      // Calculate checksum
      const buffer = S3_ENABLED ? fs.readFileSync(req.file.path) : fs.readFileSync(req.file.path);
      const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

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
      console.error("Error uploading file:", error);

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
      console.error("Error uploading avatar:", error);

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
      console.error("Error uploading screenshot:", error);

      if (req.file) {
        deleteFile(req.file.filename);
      }

      res.status(500).json({ error: "Failed to upload screenshot" });
    }
  }
);

export default router;

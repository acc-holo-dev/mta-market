// PLAN-003 A-002/A-005: public media serving for resource covers/screenshots.
//
// Only `media-<64hex>.<png|jpg|jpeg|webp|gif>` names are served (see
// resolveLocalMediaPath). Paid artifacts live in the same UPLOAD_DIR but use
// plain random names, so this route can never serve them. S3 deployments do
// not hit this route at all (uploads return absolute S3 public URLs).
import { Router, Response } from "express";
import fs from "fs";
import { resolveLocalMediaPath, MEDIA_MIME_BY_EXTENSION } from "../lib/media";
import path from "path";
import { standardRateLimit } from "../lib/rateLimit";
import { reqLog } from "../middleware/requestId";

const router: Router = Router();

router.get("/:name", standardRateLimit, (req, res: Response) => {
  const name = req.params.name as string;
  const filePath = resolveLocalMediaPath(name);

  if (!filePath) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const ext = path.extname(name).toLowerCase();
  const mime = MEDIA_MIME_BY_EXTENSION[ext] ?? "application/octet-stream";

  // Images are immutable content-addressed-by-name files; cache them hard.
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(filePath, (err) => {
    if (err) {
      reqLog(req).warn("media_send_failed", { name });
      if (!res.headersSent) {
        res.status(404).json({ error: "Not found" });
      }
    }
  });
});

export default router;

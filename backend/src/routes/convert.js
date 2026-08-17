import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyMember } from "../middleware/profile.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { convertFileToXml, CONVERTIBLE_EXTENSIONS } from "../lib/xmlConvert.js";

/**
 * Generic structured-data-to-XML converter — CSV/Excel/JSON in, XML out, no OCR/AI involved.
 * Separate from HandScribe's extraction (routes/handscribe.js), which turns photos/scans of
 * documents into structured fields in the first place; this just re-shapes data that's
 * already structured.
 */
export const convertRouter = Router();
convertRouter.use(requireAuth, requireCompanyMember);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

function uploadMiddleware(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "File must be under 10MB" : "Upload failed";
      return res.status(400).json({ error: message });
    }
    next();
  });
}

function safeFileName(name) {
  return (name || "converted").replace(/[^a-z0-9]+/gi, "_").slice(0, 80) || "converted";
}

convertRouter.get("/supported-formats", (req, res) => {
  res.json({ extensions: CONVERTIBLE_EXTENSIONS });
});

convertRouter.post(
  "/to-xml",
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let xml;
    try {
      xml = convertFileToXml(req.file.buffer, req.file.originalname);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const base = safeFileName(req.file.originalname.replace(/\.[^.]+$/, ""));
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Content-Disposition", `attachment; filename="${base}.xml"`);
    res.send(xml);
  })
);

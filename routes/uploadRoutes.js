// backend/routes/uploadRoutes.js
import express from "express";
import upload from "../middleware/upload.js";
import { convertToCloudFrontUrl } from "../utils/cloudfront.js";
import path from "path";

const router = express.Router();

// Single file upload
router.post("/single", (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      console.error("Upload middleware error:", err);
      return res.status(500).json({ error: err.message });
    }
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      // Handle both S3 and local file storage
      let imageUrl;
      if (req.file.location) {
        // S3 storage
        console.log("File uploaded successfully to S3:", req.file.location);
        imageUrl = convertToCloudFrontUrl(req.file.location);
        console.log("CloudFront URL:", imageUrl);
      } else {
        // Local storage
        console.log("File uploaded successfully to local storage:", req.file.filename);
        imageUrl = `/uploads/${req.file.filename}`;
        console.log("Local URL:", imageUrl);
      }
      
      res.json({ imageUrl });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Multiple files upload (array)
router.post("/multiple", upload.array("images", 5), (req, res) => {
  const urls = req.files.map((file) => {
    if (file.location) {
      // S3 storage
      return convertToCloudFrontUrl(file.location);
    } else {
      // Local storage
      return `/uploads/${file.filename}`;
    }
  });
  res.json({ imageUrls: urls });
});

// Multiple fields upload (for builder form - logo + backgroundImage)
router.post("/builder", (req, res) => {
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "backgroundImage", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      console.error("Upload middleware error:", err);
      return res.status(500).json({ 
        error: "Upload failed", 
        details: err.message,
        type: "UPLOAD_ERROR"
      });
    }
    
    try {
      if (!req.files) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      // Helper function to get URL for a file
      const getFileUrl = (file) => {
        if (!file) return null;
        if (file.location) {
          // S3 storage
          return convertToCloudFrontUrl(file.location);
        } else {
          // Local storage
          return `/uploads/${file.filename}`;
        }
      };

      const response = {
        message: "Files uploaded successfully",
        files: {
          logo: req.files.logo ? getFileUrl(req.files.logo[0]) : null,
          backgroundImage: req.files.backgroundImage ? getFileUrl(req.files.backgroundImage[0]) : null,
        },
      };

      console.log("Builder files uploaded:", response.files);
      res.json(response);
    } catch (err) {
      console.error("Upload processing error:", err);
      res.status(500).json({ 
        error: "Upload processing failed", 
        details: err.message,
        type: "PROCESSING_ERROR"
      });
    }
  });
});

export default router;

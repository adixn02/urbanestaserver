import express from "express";
import HomeVideo from "../models/HomeVideo.js";
import { convertToCloudFrontUrl } from "../utils/cloudfront.js";

const router = express.Router();

// Get active home video
router.get("/active", async (req, res) => {
  try {
    const video = await HomeVideo.findOne({ isActive: true })
      .sort({ uploadedAt: -1 })
      .limit(1);
    
    if (!video) {
      return res.json({ data: null });
    }

    // Convert URL to CloudFront if needed
    const responseVideo = {
      ...video._doc,
      url: video.url ? convertToCloudFrontUrl(video.url) : video.url,
    };

    res.json({ data: responseVideo });
  } catch (err) {
    console.error("Error fetching active home video:", err);
    res.json({ data: null });
  }
});

// Get all home videos
router.get("/", async (req, res) => {
  try {
    const videos = await HomeVideo.find()
      .sort({ uploadedAt: -1 })
      .populate('uploadedBy', 'name phoneNumber');

    // Convert URLs to CloudFront
    const videosWithCloudFrontUrls = videos.map((video) => {
      return {
        ...video._doc,
        url: video.url ? convertToCloudFrontUrl(video.url) : video.url,
      };
    });

    res.json(videosWithCloudFrontUrls);
  } catch (err) {
    console.error("Error fetching home videos:", err);
    res.json([]);
  }
});

// Get single home video by ID
router.get("/:id", async (req, res) => {
  try {
    const video = await HomeVideo.findById(req.params.id)
      .populate('uploadedBy', 'name phoneNumber');
    
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Convert URL to CloudFront
    const responseVideo = {
      ...video._doc,
      url: video.url ? convertToCloudFrontUrl(video.url) : video.url,
    };

    res.json(responseVideo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new home video
router.post("/", async (req, res) => {
  try {
    const video = new HomeVideo(req.body);
    await video.save();
    res.status(201).json(video);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update home video
router.put("/:id", async (req, res) => {
  try {
    const video = await HomeVideo.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }
    
    res.json(video);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete home video
router.delete("/:id", async (req, res) => {
  try {
    const video = await HomeVideo.findByIdAndDelete(req.params.id);
    
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }
    
    res.json({ message: "Video deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


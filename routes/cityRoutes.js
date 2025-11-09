import express from "express";
import City from "../models/City.js";
import { convertToCloudFrontUrl } from "../utils/cloudfront.js";

const router = express.Router();

// Get all cities
router.get("/", async (req, res) => {
  try {
    const cities = await City.find().sort({ createdAt: -1 });
    
    // Convert S3 URLs to CloudFront URLs
    const citiesWithCloudFrontUrls = cities.map(city => ({
      ...city.toObject(),
      backgroundImage: convertToCloudFrontUrl(city.backgroundImage)
    }));
    
    res.json(citiesWithCloudFrontUrls);
  } catch (error) {
    console.error("Error fetching cities:", error);
    // Return empty array instead of 500 error
    res.json([]);
  }
});

// Get single city by ID
router.get("/:id", async (req, res) => {
  try {
    const city = await City.findById(req.params.id);
    if (!city) {
      return res.status(404).json({ error: "City not found" });
    }
    
    // Convert S3 URL to CloudFront URL
    const cityWithCloudFrontUrl = {
      ...city.toObject(),
      backgroundImage: convertToCloudFrontUrl(city.backgroundImage)
    };
    
    res.json(cityWithCloudFrontUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

import express from "express";
import City from "../models/City.js";
import upload from "../middleware/upload.js";
import { convertToCloudFrontUrl } from "../utils/cloudfront.js";
import { deleteImageFromS3 } from "../utils/s3Delete.js";

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

// Create new city
router.post("/", upload.single("backgroundImage"), async (req, res) => {
  try {
    const { name, state, country, isActive, localities, backgroundImageUrl } = req.body;
    
    const cityData = {
      name,
      state,
      country: country || "India",
      isActive: isActive === "true" || isActive === true,
      localities: localities ? JSON.parse(localities) : []
    };

    // Add background image URL - prioritize uploaded file over existing URL
    if (req.file) {
      cityData.backgroundImage = req.file.location;
      console.log("New image uploaded to S3:", req.file.location);
    } else if (backgroundImageUrl) {
      cityData.backgroundImage = backgroundImageUrl;
      console.log("Using existing image URL:", backgroundImageUrl);
    }

    const city = new City(cityData);
    await city.save();
    console.log("City created with backgroundImage:", cityData.backgroundImage);
    
    // Convert S3 URL to CloudFront URL for response
    const cityWithCloudFrontUrl = {
      ...city.toObject(),
      backgroundImage: convertToCloudFrontUrl(city.backgroundImage)
    };
    
    res.status(201).json(cityWithCloudFrontUrl);
  } catch (error) {
    console.error("Error creating city:", error);
    res.status(400).json({ error: error.message });
  }
});

// Update city
router.put("/:id", upload.single("backgroundImage"), async (req, res) => {
  try {
    const { name, state, country, isActive, localities, backgroundImageUrl } = req.body;
    
    // First, get the existing city to check for old image
    const existingCity = await City.findById(req.params.id);
    if (!existingCity) {
      return res.status(404).json({ error: "City not found" });
    }

    const updateData = {
      name,
      state,
      country: country || "India",
      isActive: isActive === "true" || isActive === true,
      localities: localities ? JSON.parse(localities) : []
    };

    // Handle background image update
    let newImageUrl = null;
    if (req.file) {
      // New file uploaded
      newImageUrl = req.file.location;
      updateData.backgroundImage = newImageUrl;
      console.log("New image uploaded to S3:", newImageUrl);
    } else if (backgroundImageUrl) {
      // Using existing URL
      newImageUrl = backgroundImageUrl;
      updateData.backgroundImage = backgroundImageUrl;
      console.log("Using existing image URL:", backgroundImageUrl);
    }

    // If we have a new image and the old image is different, delete the old one
    if (newImageUrl && existingCity.backgroundImage && existingCity.backgroundImage !== newImageUrl) {
      console.log("Deleting old background image from S3:", existingCity.backgroundImage);
      const oldImageDeleted = await deleteImageFromS3(existingCity.backgroundImage);
      if (oldImageDeleted) {
        console.log("Old background image deleted successfully from S3");
      } else {
        console.warn("Failed to delete old background image from S3");
      }
    }

    const city = await City.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    console.log("City updated with backgroundImage:", updateData.backgroundImage);
    
    // Convert S3 URL to CloudFront URL for response
    const cityWithCloudFrontUrl = {
      ...city.toObject(),
      backgroundImage: convertToCloudFrontUrl(city.backgroundImage)
    };
    
    res.json(cityWithCloudFrontUrl);
  } catch (error) {
    console.error("Error updating city:", error);
    res.status(400).json({ error: error.message });
  }
});

// Delete city
router.delete("/:id", async (req, res) => {
  try {
    // First, get the city to access the background image
    const city = await City.findById(req.params.id);
    if (!city) {
      return res.status(404).json({ error: "City not found" });
    }

    // Delete the background image from S3 if it exists
    if (city.backgroundImage) {
      console.log("Deleting background image from S3:", city.backgroundImage);
      const imageDeleted = await deleteImageFromS3(city.backgroundImage);
      if (imageDeleted) {
        console.log("Background image deleted successfully from S3");
      } else {
        console.warn("Failed to delete background image from S3, but continuing with city deletion");
      }
    }

    // Delete the city from database
    await City.findByIdAndDelete(req.params.id);
    
    console.log("City deleted successfully from database");
    res.json({ message: "City and associated image deleted successfully" });
  } catch (error) {
    console.error("Error deleting city:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add locality to city
router.post("/:id/localities", async (req, res) => {
  try {
    const { name, isActive } = req.body;
    
    const city = await City.findById(req.params.id);
    if (!city) {
      return res.status(404).json({ error: "City not found" });
    }

    city.localities.push({
      name,
      isActive: isActive === "true" || isActive === true
    });

    await city.save();
    res.json(city);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update locality
router.put("/:cityId/localities/:localityId", async (req, res) => {
  try {
    const { name, isActive } = req.body;
    
    const city = await City.findById(req.params.cityId);
    if (!city) {
      return res.status(404).json({ error: "City not found" });
    }

    const locality = city.localities.id(req.params.localityId);
    if (!locality) {
      return res.status(404).json({ error: "Locality not found" });
    }

    locality.name = name;
    locality.isActive = isActive === "true" || isActive === true;

    await city.save();
    res.json(city);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete locality
router.delete("/:cityId/localities/:localityId", async (req, res) => {
  try {
    const city = await City.findById(req.params.cityId);
    if (!city) {
      return res.status(404).json({ error: "City not found" });
    }

    city.localities.pull(req.params.localityId);
    await city.save();
    res.json(city);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

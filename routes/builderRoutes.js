import express from "express";
import Builder from "../models/Builder.js";
import { convertToCloudFrontUrl } from "../utils/cloudfront.js";

const router = express.Router();

// Get all builders
router.get("/", async (req, res) => {
  try {
    const builders = await Builder.find();
    // Convert image fields to CloudFront URLs
    const buildersWithCloudFrontUrls = builders.map((builder) => {
      return {
        ...builder._doc,
        logo: builder.logo ? convertToCloudFrontUrl(builder.logo) : "",
        backgroundImage: builder.backgroundImage ? convertToCloudFrontUrl(builder.backgroundImage) : "",
      };
    });
    res.json(buildersWithCloudFrontUrls);
  } catch (err) {
    console.error("Error fetching builders:", err);
    // Return empty array instead of 500 error
    res.json([]);
  }
});

// Get single builder by slug
router.get("/:slug", async (req, res) => {
  try {
    const builder = await Builder.findOne({ slug: req.params.slug });
    if (!builder) {
      return res.status(404).json({ error: "Builder not found" });
    }
     // Convert images before returning
    const responseBuilder = {
      ...builder._doc,
      logo: builder.logo ? convertToCloudFrontUrl(builder.logo) : "",
      backgroundImage: builder.backgroundImage ? convertToCloudFrontUrl(builder.backgroundImage) : "",
    };
    res.json(responseBuilder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

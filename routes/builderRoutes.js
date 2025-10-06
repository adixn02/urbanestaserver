import express from "express";
import Builder from "../models/Builder.js";
import { convertToCloudFrontUrl } from "../utils/cloudfront.js";

const router = express.Router();

// ✅ Get all builders
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

// ✅ Get single builder by slug
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

// ✅ Update builder display order
router.put("/order", async (req, res) => {
  try {
    const { builders } = req.body;
    
    if (!Array.isArray(builders)) {
      return res.status(400).json({ error: "Builders array is required" });
    }

    // Update display order for each builder
    const updatePromises = builders.map(({ id, displayOrder }) => 
      Builder.findByIdAndUpdate(id, { displayOrder }, { new: true })
    );

    await Promise.all(updatePromises);
    res.json({ message: "Builder order updated successfully" });
  } catch (err) {
    console.error("Error updating builder order:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Add new builder
router.post("/", async (req, res) => {
  try {
    const { name, description, logo, backgroundImage, isActive, establishedYear, headquarters, website, specialties, displayOrder } = req.body;
    
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Builder name is required" });
    }
    
    // Check if builder with same name already exists
    const existingBuilder = await Builder.findOne({ name: name.trim() });
    if (existingBuilder) {
      return res.status(400).json({ error: "Builder with this name already exists" });
    }
    
    // Generate slug from name with collision handling
    let baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let slug = baseSlug;
    let counter = 1;
    
    // Check for slug collisions and append number if needed
    while (await Builder.findOne({ slug })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    const newBuilder = new Builder({
      name: name.trim(),
      slug,
      description: description?.trim() || "",
      logo: logo || "",
      backgroundImage: backgroundImage || "",
      isActive: isActive !== false,
      establishedYear: establishedYear ? parseInt(establishedYear) : undefined,
      headquarters: headquarters?.trim() || "",
      website: website?.trim() || "",
      specialties: Array.isArray(specialties) ? specialties.filter(s => s.trim()) : [],
      displayOrder: displayOrder || 0
    });
    
    await newBuilder.save();
    res.status(201).json(newBuilder);
  } catch (err) {
    console.error("Error creating builder:", err);
    if (err.code === 11000) {
      res.status(400).json({ error: "Builder with this name or slug already exists" });
    } else {
      res.status(400).json({ error: err.message });
    }
  }
});

// ✅ Update builder
router.put("/:id", async (req, res) => {
  try {
    const { name, description, logo, backgroundImage, isActive, establishedYear, headquarters, website, specialties, displayOrder } = req.body;
    
    // Validation
    if (name && !name.trim()) {
      return res.status(400).json({ error: "Builder name cannot be empty" });
    }
    
    const updateData = {};
    
    // Only update fields that are provided
    if (description !== undefined) updateData.description = description.trim();
    if (logo !== undefined) updateData.logo = logo;
    if (backgroundImage !== undefined) updateData.backgroundImage = backgroundImage;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (establishedYear !== undefined) updateData.establishedYear = establishedYear ? parseInt(establishedYear) : undefined;
    if (headquarters !== undefined) updateData.headquarters = headquarters.trim();
    if (website !== undefined) updateData.website = website.trim();
    if (specialties !== undefined) updateData.specialties = Array.isArray(specialties) ? specialties.filter(s => s.trim()) : [];
    if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
    
    // If name is being updated, generate new slug and check for duplicates
    if (name) {
      const trimmedName = name.trim();
      const existingBuilder = await Builder.findOne({ 
        name: trimmedName, 
        _id: { $ne: req.params.id } 
      });
      if (existingBuilder) {
        return res.status(400).json({ error: "Builder with this name already exists" });
      }
      updateData.name = trimmedName;
      
      // Generate new slug with collision handling
      let baseSlug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      let newSlug = baseSlug;
      let counter = 1;
      
      // Check for slug collisions and append number if needed
      while (await Builder.findOne({ slug: newSlug, _id: { $ne: req.params.id } })) {
        newSlug = `${baseSlug}-${counter}`;
        counter++;
      }
      
      updateData.slug = newSlug;
    }
    
    const builder = await Builder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!builder) {
      return res.status(404).json({ error: "Builder not found" });
    }
    
    res.json(builder);
  } catch (err) {
    console.error("Error updating builder:", err);
    if (err.code === 11000) {
      res.status(400).json({ error: "Builder with this name or slug already exists" });
    } else {
      res.status(400).json({ error: err.message });
    }
  }
});

// ✅ Delete builder
router.delete("/:id", async (req, res) => {
  try {
    const builder = await Builder.findByIdAndDelete(req.params.id);
    if (!builder) {
      return res.status(404).json({ error: "Builder not found" });
    }
    res.json({ message: "Builder deleted successfully" });
  } catch (err) {
    console.error("Error deleting builder:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

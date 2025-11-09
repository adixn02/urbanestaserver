import express from 'express';
import Managedproperty from '../models/property.js';
import Category from '../models/category.js';
import City from '../models/City.js';
import Builder from '../models/Builder.js';
import { convertToCloudFrontUrl } from '../utils/cloudfront.js';

const router = express.Router();

// GET /api/properties/dropdown-data - Get all dropdown data for property form
router.get('/dropdown-data', async (req, res) => {
  try {
    // Fetch categories with subcategories
    const categories = await Category.find({ isActive: true })
      .select('name deepSubcategories')
      .populate('deepSubcategories', 'name isActive');
    
    // Fetch cities with localities
    const cities = await City.find({ isActive: true })
      .select('name state localities')
      .populate('localities', 'name isActive');
    
    // Fetch builders
    const builders = await Builder.find({ isActive: true })
      .select('name slug')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      data: {
        categories,
        cities,
        builders
      }
    });
  } catch (error) {
    console.error('Error fetching dropdown data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dropdown data',
      details: error.message
    });
  }
});

// GET /api/properties - Get all properties with optional filtering
router.get('/', async (req, res) => {
  try {
    const { type, status, city, category, subcategory, page = 1, limit = 50, sort = 'createdAt', order = 'desc' } = req.query;
    
    // Build filter object
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (city) {
      // Check if city is an ObjectId or city name
      if (city.match(/^[0-9a-fA-F]{24}$/)) {
        // It's an ObjectId
        filter.city = city;
      } else {
        // It's a city name, we need to find the city first
        const cityDoc = await City.findOne({ name: new RegExp(city, 'i') });
        if (cityDoc) {
          filter.city = cityDoc._id;
        }
      }
    }
    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sortOrder = order === 'asc' ? 1 : -1;
    const sortObj = { [sort]: sortOrder };
    
    // Get properties with pagination and populate references
    const properties = await Managedproperty.find(filter)
      .populate('category', 'name deepSubcategories')
      .populate('city', 'name state localities')
      .populate('builder', 'name slug')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Convert to plain objects and add display images with CloudFront URLs
    const propertiesWithSubcategoryNames = properties.map(property => {
      const propertyObj = property.toObject();
      
      // If subcategoryName is not set, try to populate it from the category
      if (!propertyObj.subcategoryName && propertyObj.category && propertyObj.subcategory) {
        try {
          const category = propertyObj.category;
          if (category.deepSubcategories) {
            const subcategory = category.deepSubcategories.find(
              sub => sub._id.toString() === propertyObj.subcategory
            );
            if (subcategory) {
              propertyObj.subcategoryName = subcategory.name;
            }
          }
        } catch (error) {
          console.error('Error populating subcategory name:', error);
        }
      }
      
      // Populate locality name for location field
      if (propertyObj.city && propertyObj.city.localities && propertyObj.location) {
        try {
          const locality = propertyObj.city.localities.find(
            loc => loc._id.toString() === propertyObj.location
          );
          if (locality) {
            propertyObj.localityName = locality.name;
          }
        } catch (error) {
          console.error('Error populating locality name:', error);
        }
      }
      
      // Get display image based on property type
      let displayImage = null;
      if (propertyObj.type === 'regular') {
        // For regular properties, use first project image
        if (propertyObj.projectImages && propertyObj.projectImages.length > 0) {
          displayImage = propertyObj.projectImages[0];
        }
      } else if (propertyObj.type === 'builder') {
        // For builder properties, use wallpaper image
        displayImage = propertyObj.wallpaperImage;
      }
      
      // Convert display image to CloudFront URL
      if (displayImage) {
        propertyObj.displayImage = convertToCloudFrontUrl(displayImage);
      }
      
      // Convert all image URLs to CloudFront URLs
      if (propertyObj.projectImages) {
        propertyObj.projectImages = propertyObj.projectImages.map(img => convertToCloudFrontUrl(img));
      }
      if (propertyObj.images) {
        propertyObj.images = propertyObj.images.map(img => convertToCloudFrontUrl(img));
      }
      if (propertyObj.projectLogo) {
        propertyObj.projectLogo = convertToCloudFrontUrl(propertyObj.projectLogo);
      }
      if (propertyObj.wallpaperImage) {
        propertyObj.wallpaperImage = convertToCloudFrontUrl(propertyObj.wallpaperImage);
      }
      if (propertyObj.descriptionImage) {
        propertyObj.descriptionImage = convertToCloudFrontUrl(propertyObj.descriptionImage);
      }
      if (propertyObj.highlightImage) {
        propertyObj.highlightImage = convertToCloudFrontUrl(propertyObj.highlightImage);
      }
      if (propertyObj.floorPlan) {
        propertyObj.floorPlan = convertToCloudFrontUrl(propertyObj.floorPlan);
      }
      if (propertyObj.masterPlan) {
        propertyObj.masterPlan = convertToCloudFrontUrl(propertyObj.masterPlan);
      }
      
      return propertyObj;
    });
    
    // Get total count for pagination
    const total = await Managedproperty.countDocuments(filter);
    
    res.json({
      success: true,
      data: propertiesWithSubcategoryNames,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch properties',
      details: error.message
    });
  }
});

// GET /api/properties/:id - Get single property by ID
router.get('/:id', async (req, res) => {
  try {
    const property = await Managedproperty.findById(req.params.id)
      .populate('category', 'name')
      .populate('city', 'name state')
      .populate('builder', 'name slug');
    
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }
    
    res.json({
      success: true,
      data: property
    });
  } catch (error) {
    console.error('Error fetching property:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch property',
      details: error.message
    });
  }
});

export default router;

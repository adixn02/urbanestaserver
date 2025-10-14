import express from 'express';
import Managedproperty from '../models/property.js';
import Category from '../models/category.js';
import City from '../models/City.js';
import Builder from '../models/Builder.js';
import { User } from '../models/users.js';
import { authenticateJWT } from '../middleware/jwtAuth.js';
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
    const { type, status, city, category, subcategory, page = 1, limit = 50 } = req.query;
    
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
    
    // Get properties with pagination and populate references
    const properties = await Managedproperty.find(filter)
      .populate('category', 'name deepSubcategories')
      .populate('city', 'name state localities')
      .populate('builder', 'name slug')
      .sort({ createdAt: -1 })
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

// POST /api/properties - Create new property
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const propertyData = req.body;
    
    // Validate required fields based on property type
    if (!propertyData.type || !['regular', 'builder'].includes(propertyData.type)) {
      return res.status(400).json({
        success: false,
        error: 'Property type is required and must be either "regular" or "builder"'
      });
    }
    
    // Common required fields
    const requiredFields = ['title', 'city', 'location', 'category', 'subcategory', 'description'];
    for (const field of requiredFields) {
      if (!propertyData[field]) {
        return res.status(400).json({
          success: false,
          error: `${field} is required`
        });
      }
    }
    
    // Type-specific validation
    if (propertyData.type === 'regular') {
      if (!propertyData.price || propertyData.price <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid price is required for regular properties'
        });
      }
      if (!propertyData.locality) {
        return res.status(400).json({
          success: false,
          error: 'Locality is required for regular properties'
        });
      }
    }
    
    if (propertyData.type === 'builder') {
      const builderRequiredFields = ['builder', 'projectName', 'about', 'reraNo', 'minPrice', 'maxPrice', 'possessionDate', 'landArea'];
      for (const field of builderRequiredFields) {
        if (!propertyData[field]) {
          return res.status(400).json({
            success: false,
            error: `${field} is required for builder properties`
          });
        }
      }
      
      // Validate unit details array
      if (!propertyData.unitDetails || !Array.isArray(propertyData.unitDetails) || propertyData.unitDetails.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one unit detail is required for builder properties'
        });
      }
      
      // Validate each unit detail
      for (let i = 0; i < propertyData.unitDetails.length; i++) {
        const unit = propertyData.unitDetails[i];
        if (!unit.unitType || !unit.area || !unit.floorPlan) {
          return res.status(400).json({
            success: false,
            error: `Unit ${i + 1}: unitType, area, and floorPlan are required`
          });
        }
      }
      
      // Convert to numbers for comparison
      const minPrice = Number(propertyData.minPrice);
      const maxPrice = Number(propertyData.maxPrice);
      
      if (isNaN(minPrice) || minPrice <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid minimum price is required'
        });
      }
      
      if (isNaN(maxPrice) || maxPrice <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid maximum price is required'
        });
      }
      
      if (minPrice >= maxPrice) {
        return res.status(400).json({
          success: false,
          error: 'Maximum price must be greater than minimum price'
        });
      }
    }
    
    // For all properties, store subcategory name for easier display
    if (propertyData.category && propertyData.subcategory) {
      try {
        const category = await Category.findById(propertyData.category).select('deepSubcategories');
        if (category && category.deepSubcategories) {
          const subcategory = category.deepSubcategories.find(
            sub => sub._id.toString() === propertyData.subcategory
          );
          if (subcategory) {
            propertyData.subcategoryName = subcategory.name;
            // Found subcategory name for property
          } else {
            // Subcategory not found for ID
          }
        }
      } catch (error) {
        console.error('Error fetching subcategory name:', error);
      }
    }
    
    // Add user information to property
    propertyData.createdBy = req.user.uid;
    propertyData.createdByPhone = req.user.phone_number;
    
    const property = new Managedproperty(propertyData);
    await property.save();
    
    // Add property to user's myProperties array
    const user = await User.findOne({ phoneNumber: req.user.phone_number });
    if (user) {
      user.myProperties.push(property._id);
      await user.save();
    }
    
    res.status(201).json({
      success: true,
      data: property,
      message: 'Property created successfully'
    });
  } catch (error) {
    console.error('Error creating property:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create property',
      details: error.message
    });
  }
});

// PUT /api/properties/:id - Update property
router.put('/:id', async (req, res) => {
  try {
    const propertyData = req.body;
    const propertyId = req.params.id;
    
    // Validate property exists
    const existingProperty = await Managedproperty.findById(propertyId);
    if (!existingProperty) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }
    
    // Validate required fields based on property type
    if (propertyData.type && !['regular', 'builder'].includes(propertyData.type)) {
      return res.status(400).json({
        success: false,
        error: 'Property type must be either "regular" or "builder"'
      });
    }
    
    // Type-specific validation (same as create)
    if (propertyData.type === 'regular') {
      if (propertyData.price !== undefined && propertyData.price <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid price is required for regular properties'
        });
      }
    }
    
    if (propertyData.type === 'builder') {
      const minPrice = Number(propertyData.minPrice);
      const maxPrice = Number(propertyData.maxPrice);
      
      if (minPrice && maxPrice && minPrice >= maxPrice) {
        return res.status(400).json({
          success: false,
          error: 'Maximum price must be greater than minimum price'
        });
      }
    }
    
    const updatedProperty = await Managedproperty.findByIdAndUpdate(
      propertyId,
      propertyData,
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      data: updatedProperty,
      message: 'Property updated successfully'
    });
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update property',
      details: error.message
    });
  }
});

// DELETE /api/properties/:id - Delete property
router.delete('/:id', async (req, res) => {
  try {
    const property = await Managedproperty.findByIdAndDelete(req.params.id);
    
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Property deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete property',
      details: error.message
    });
  }
});

// GET /api/properties/stats/summary - Get property statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = await Managedproperty.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          regular: { $sum: { $cond: [{ $eq: ['$type', 'regular'] }, 1, 0] } },
          builder: { $sum: { $cond: [{ $eq: ['$type', 'builder'] }, 1, 0] } },
          available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
          sold: { $sum: { $cond: [{ $eq: ['$status', 'sold'] }, 1, 0] } },
          rented: { $sum: { $cond: [{ $eq: ['$status', 'rented'] }, 1, 0] } }
        }
      }
    ]);
    
    const result = stats[0] || {
      total: 0,
      regular: 0,
      builder: 0,
      available: 0,
      sold: 0,
      rented: 0
    };
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching property stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch property statistics',
      details: error.message
    });
  }
});

// POST /api/properties/migrate-subcategory-names - Migrate existing properties to have subcategory names
router.post('/migrate-subcategory-names', async (req, res) => {
  try {
    // Starting subcategory name migration
    
    // Find all properties that don't have subcategoryName set
    const properties = await Managedproperty.find({ 
      subcategoryName: { $exists: false } 
    }).populate('category', 'deepSubcategories');
    
    // Found properties without subcategory names
    
    let updatedCount = 0;
    
    for (const property of properties) {
      if (property.category && property.category.deepSubcategories && property.subcategory) {
        const subcategory = property.category.deepSubcategories.find(
          sub => sub._id.toString() === property.subcategory
        );
        
        if (subcategory) {
          property.subcategoryName = subcategory.name;
          await property.save();
          updatedCount++;
          // Updated property with subcategory name
        }
      }
    }
    
    res.json({
      success: true,
      message: `Migration completed. Updated ${updatedCount} properties.`,
      updatedCount,
      totalFound: properties.length
    });
  } catch (error) {
    console.error('Error during migration:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error.message
    });
  }
});

// GET /api/properties/user - Get properties created by authenticated user
router.get('/user', authenticateJWT, async (req, res) => {
  try {
    const properties = await Managedproperty.find({ 
      createdByPhone: req.user.phone_number 
    })
    .populate('city', 'name state')
    .populate('category', 'name')
    .populate('builder', 'name slug')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      properties: properties
    });
  } catch (error) {
    console.error('Error fetching user properties:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user properties',
      details: error.message
    });
  }
});

export default router;

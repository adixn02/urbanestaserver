import express from 'express';
import { authenticateJWT, generateToken } from '../middleware/jwtAuth.js';
import { User } from '../models/users.js';
import Managedproperty from '../models/property.js';
import logger from '../utils/logger.js';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { convertToCloudFrontUrl } from '../utils/cloudfront.js';

const router = express.Router();

// Refresh token endpoint
router.post('/refresh-token', async (req, res) => {
  try {
    const cookies = cookie.parse(req.headers.cookie || '');
    const refreshToken = cookies.urbanesta_refresh_token;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token not found'
      });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }
    
    // Find user
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Generate new access token
    const newAccessToken = generateToken(user);
    
    // Set new access token cookie
    const cookieOptions = {
      maxAge: 30 * 60 * 1000, // 30 minutes
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && req.secure,
      sameSite: 'lax',
      path: '/',
    };
    
    res.cookie('urbanesta_token', newAccessToken, cookieOptions);
    
    res.json({
      success: true,
      message: 'Token refreshed successfully'
    });
    
  } catch (error) {
    logger.error('Refresh token error', { error: error.message });
    res.status(401).json({
      success: false,
      error: 'Invalid or expired refresh token'
    });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  try {
    // Clear both cookies
    res.clearCookie('urbanesta_token', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && req.secure,
      sameSite: 'lax',
    });
    
    res.clearCookie('urbanesta_refresh_token', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && req.secure,
      sameSite: 'lax',
    });
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    logger.error('Logout error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

// Test endpoint to check authentication
router.get('/test', authenticateJWT, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Authentication working',
      user: req.user
    });
  } catch (error) {
    logger.error('Test endpoint error', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Test failed' 
    });
  }
});

// Get user profile
router.get('/profile', authenticateJWT, async (req, res) => {
  try {
    // Find user in database by ID (from JWT token)
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    res.json({
      success: true,
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        email: user.email,
        name: user.name,
        city: user.city,
        joinDate: user.joinDate,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    logger.error('Get profile error', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get profile' 
    });
  }
});

// Update user profile
router.put('/profile', authenticateJWT, async (req, res) => {
  try {
    const { name, city, email } = req.body;
    
    logger.info('Profile update request', { 
      userId: req.user?.id, 
      body: req.body 
    });
    
    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }
    
    if (!city || !city.trim()) {
      return res.status(400).json({
        success: false,
        error: 'City is required'
      });
    }
    
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }
    
    // Validate email format
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address'
      });
    }
    
    // Find user in database by ID
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if email is being changed and if it already exists
    if (user.email !== email.trim().toLowerCase()) {
      const existingUser = await User.findOne({ 
        email: email.trim().toLowerCase(),
        _id: { $ne: req.user.id }
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Email address is already in use by another account'
        });
      }
    }
    
    // Update user data
    user.name = name.trim();
    user.city = city.trim();
    user.email = email.trim().toLowerCase();
    
    await user.save();
    
    logger.info('Profile updated', { 
      userId: req.user.id, 
      updates: { name, city, email } 
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        name: user.name,
        city: user.city,
        email: user.email,
        joinDate: user.joinDate
      }
    });
  } catch (error) {
    logger.error('Update profile error', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.id,
      body: req.body
    });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get user's watchlist
router.get('/watchlist', authenticateJWT, async (req, res) => {
  try {
    // Find user and populate watchlist with all necessary fields
    const user = await User.findById(req.user.id)
      .populate({
        path: 'watchlist',
        populate: [
          { path: 'category', select: 'name deepSubcategories' },
          { path: 'city', select: 'name state localities' },
          { path: 'builder', select: 'name slug' }
        ]
      });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Process watchlist properties similar to main properties route
    const processedWatchlist = (user.watchlist || []).map(property => {
      if (!property) return null; // Skip null/undefined properties
      
      const propertyObj = property.toObject ? property.toObject() : property;
      
      // Populate subcategory name if not set
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
        if (propertyObj.projectImages && propertyObj.projectImages.length > 0) {
          displayImage = propertyObj.projectImages[0];
        } else if (propertyObj.images && propertyObj.images.length > 0) {
          displayImage = propertyObj.images[0];
        }
      } else if (propertyObj.type === 'builder') {
        displayImage = propertyObj.wallpaperImage || 
                      (propertyObj.projectImages && propertyObj.projectImages.length > 0 ? propertyObj.projectImages[0] : null);
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
      
      // Ensure we have images array for frontend
      if (!propertyObj.images || propertyObj.images.length === 0) {
        if (propertyObj.projectImages && propertyObj.projectImages.length > 0) {
          propertyObj.images = propertyObj.projectImages;
        } else if (displayImage) {
          propertyObj.images = [displayImage];
        } else {
          propertyObj.images = [];
        }
      }
      
      // Get category name for display
      if (propertyObj.category && propertyObj.category.name) {
        propertyObj.categoryName = propertyObj.category.name;
      }
      
      return propertyObj;
    }).filter(property => property !== null); // Remove null entries

    res.json({
      success: true,
      watchlist: processedWatchlist
    });
  } catch (error) {
    logger.error('Get watchlist error', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get watchlist',
      details: error.message
    });
  }
});

// Add property to watchlist
router.post('/watchlist', authenticateJWT, async (req, res) => {
  try {
    const { propertyId } = req.body;
    
    if (!propertyId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Property ID is required' 
      });
    }

    // Validate property exists
    const property = await Managedproperty.findById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    // Find user and add property to watchlist
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if property already in watchlist (convert both to strings for comparison)
    const propertyIdStr = propertyId.toString();
    const isAlreadyInWatchlist = user.watchlist.some(id => id.toString() === propertyIdStr);
    
    if (!isAlreadyInWatchlist) {
      user.watchlist.push(propertyId);
      await user.save();
      logger.info('Property added to watchlist', { 
        userId: req.user.id, 
        propertyId: propertyIdStr,
        propertyTitle: property.projectName || property.title
      });
    } else {
      logger.info('Property already in watchlist', { 
        userId: req.user.id, 
        propertyId: propertyIdStr
      });
    }

    res.json({
      success: true,
      message: isAlreadyInWatchlist ? 'Property already in watchlist' : 'Property added to watchlist'
    });
  } catch (error) {
    logger.error('Add to watchlist error', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add to watchlist',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Remove property from watchlist
router.delete('/watchlist/:propertyId', authenticateJWT, async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    // Find user and remove property from watchlist
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Remove property from watchlist
    user.watchlist = user.watchlist.filter(id => id.toString() !== propertyId);
    await user.save();
    
    logger.info('Property removed from watchlist', { 
      userId: req.user.id, 
      propertyId 
    });

    res.json({
      success: true,
      message: 'Property removed from watchlist'
    });
  } catch (error) {
    logger.error('Remove from watchlist error', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to remove from watchlist' 
    });
  }
});

// Get user's properties
router.get('/properties', authenticateJWT, async (req, res) => {
  try {
    // Find properties created by this user
    const properties = await Managedproperty.find({ 
      createdBy: req.user.id 
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
    logger.error('Get user properties error', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get properties' 
    });
  }
});

// Delete user's property
router.delete('/properties/:propertyId', authenticateJWT, async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    // Find property and verify ownership
    const property = await Managedproperty.findOne({ 
      _id: propertyId, 
      createdBy: req.user.id 
    });
    
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found or you do not have permission to delete it'
      });
    }
    
    // Delete the property
    await Managedproperty.findByIdAndDelete(propertyId);
    
    // Remove from user's myProperties array
    const user = await User.findById(req.user.id);
    if (user) {
      user.myProperties = user.myProperties.filter(id => id.toString() !== propertyId);
      await user.save();
    }
    
    logger.info('Property deleted', { 
      userId: req.user.id, 
      propertyId 
    });

    res.json({
      success: true,
      message: 'Property deleted successfully'
    });
  } catch (error) {
    logger.error('Delete property error', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete property' 
    });
  }
});

export default router;

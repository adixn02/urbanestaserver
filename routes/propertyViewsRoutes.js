import express from 'express';
import PropertyViews from '../models/PropertyViews.js';
import Managedproperty from '../models/property.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Track property view
router.post('/track', async (req, res) => {
  try {
    const { propertyId } = req.body;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        error: 'Property ID is required'
      });
    }

    // Verify property exists
    const property = await Managedproperty.findById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    // Increment view count
    const viewRecord = await PropertyViews.incrementView(propertyId);

    logger.info(`Property view tracked: ${propertyId}`, {
      propertyId,
      viewCount: viewRecord.viewCount,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'View tracked successfully',
      data: {
        propertyId,
        viewCount: viewRecord.viewCount,
        lastViewedAt: viewRecord.lastViewedAt
      }
    });

  } catch (error) {
    logger.error('Error tracking property view:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track property view',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get property view count
router.get('/count/:propertyId', async (req, res) => {
  try {
    const { propertyId } = req.params;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        error: 'Property ID is required'
      });
    }

    const viewCount = await PropertyViews.getViewCount(propertyId);

    res.json({
      success: true,
      data: {
        propertyId,
        viewCount
      }
    });

  } catch (error) {
    logger.error('Error getting property view count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get view count',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get top viewed properties
router.get('/top-viewed', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const limitNum = parseInt(limit);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be a number between 1 and 100'
      });
    }

    const topViewed = await PropertyViews.getTopViewedProperties(limitNum);

    res.json({
      success: true,
      data: topViewed
    });

  } catch (error) {
    logger.error('Error getting top viewed properties:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get top viewed properties',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get view statistics for multiple properties
router.post('/stats', async (req, res) => {
  try {
    const { propertyIds } = req.body;

    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Property IDs array is required'
      });
    }

    if (propertyIds.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 property IDs allowed per request'
      });
    }

    const stats = await PropertyViews.find({
      propertyId: { $in: propertyIds }
    }).populate('propertyId', 'title type city location price');

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Error getting property view stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get property view stats',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;

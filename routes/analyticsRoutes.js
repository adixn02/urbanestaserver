import express from 'express';
import Analytics from '../models/Analytics.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Helper function to parse user agent
function parseUserAgent(userAgent) {
  const ua = userAgent.toLowerCase();
  
  // Device detection
  let device = 'desktop';
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    device = 'mobile';
  } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
    device = 'tablet';
  }

  // Browser detection
  let browser = 'unknown';
  if (ua.includes('chrome') && !ua.includes('edg')) {
    browser = 'chrome';
  } else if (ua.includes('firefox')) {
    browser = 'firefox';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'safari';
  } else if (ua.includes('edg')) {
    browser = 'edge';
  } else if (ua.includes('opera')) {
    browser = 'opera';
  }

  // OS detection
  let os = 'unknown';
  if (ua.includes('windows')) {
    os = 'windows';
  } else if (ua.includes('mac os')) {
    os = 'macos';
  } else if (ua.includes('linux')) {
    os = 'linux';
  } else if (ua.includes('android')) {
    os = 'android';
  } else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) {
    os = 'ios';
  }

  return { device, browser, os };
}

// Track website visit
router.post('/track', async (req, res) => {
  try {
    const {
      pageUrl,
      pageTitle,
      referrer,
      sessionId,
      screenResolution,
      language,
      timezone,
      visitDuration
    } = req.body;

    if (!pageUrl) {
      return res.status(400).json({
        success: false,
        error: 'Page URL is required'
      });
    }

    const userAgent = req.get('User-Agent') || '';
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Parse user agent
    const { device, browser, os } = parseUserAgent(userAgent);

    // Check if this is a returning visitor (same IP in last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const existingVisitor = await Analytics.findOne({
      ipAddress,
      createdAt: { $gte: yesterday }
    });

    const visitData = {
      ipAddress,
      userAgent,
      device,
      browser,
      operatingSystem: os,
      pageUrl,
      pageTitle: pageTitle || '',
      referrer: referrer || '',
      sessionId: sessionId || '',
      screenResolution: screenResolution || '',
      language: language || '',
      timezone: timezone || '',
      isReturningVisitor: !!existingVisitor,
      visitDuration: visitDuration || 0
    };

    const analytics = await Analytics.recordVisit(visitData);

    logger.info('Website visit tracked', {
      ipAddress,
      pageUrl,
      device,
      browser,
      os,
      isReturningVisitor: visitData.isReturningVisitor
    });

    res.json({
      success: true,
      message: 'Visit tracked successfully',
      data: {
        visitId: analytics._id,
        isReturningVisitor: visitData.isReturningVisitor
      }
    });

  } catch (error) {
    logger.error('Error tracking website visit:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track visit',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get visitor statistics
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await Analytics.getVisitorStats(startDate, endDate);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Error getting visitor stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get visitor stats',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get page popularity
router.get('/page-popularity', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const limitNum = parseInt(limit);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be a number between 1 and 100'
      });
    }

    const popularity = await Analytics.getPagePopularity(limitNum);

    res.json({
      success: true,
      data: popularity
    });

  } catch (error) {
    logger.error('Error getting page popularity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get page popularity',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get device/browser statistics
router.get('/device-stats', async (req, res) => {
  try {
    const stats = await Analytics.getDeviceStats();

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Error getting device stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get device stats',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get recent visits
router.get('/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const limitNum = parseInt(limit);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be a number between 1 and 100'
      });
    }

    const recentVisits = await Analytics.find()
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .select('ipAddress device browser operatingSystem pageUrl pageTitle createdAt visitDuration');

    res.json({
      success: true,
      data: recentVisits
    });

  } catch (error) {
    logger.error('Error getting recent visits:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recent visits',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;

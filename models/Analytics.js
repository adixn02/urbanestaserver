import mongoose from 'mongoose';

const AnalyticsSchema = new mongoose.Schema({
  // Basic visitor information
  ipAddress: {
    type: String,
    required: true,
    index: true
  },
  userAgent: {
    type: String,
    required: true
  },
  
  // Device and browser information
  device: {
    type: String, // mobile, tablet, desktop
    enum: ['mobile', 'tablet', 'desktop', 'unknown'],
    default: 'unknown'
  },
  browser: {
    type: String, // chrome, firefox, safari, edge, etc.
    default: 'unknown'
  },
  operatingSystem: {
    type: String, // windows, macos, linux, android, ios, etc.
    default: 'unknown'
  },
  
  // Location information (if available)
  country: {
    type: String,
    default: 'unknown'
  },
  city: {
    type: String,
    default: 'unknown'
  },
  region: {
    type: String,
    default: 'unknown'
  },
  
  // Page information
  pageUrl: {
    type: String,
    required: true
  },
  pageTitle: {
    type: String,
    default: ''
  },
  referrer: {
    type: String,
    default: ''
  },
  
  // Session information
  sessionId: {
    type: String,
    index: true
  },
  
  // Additional metadata
  screenResolution: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: ''
  },
  timezone: {
    type: String,
    default: ''
  },
  
  // Tracking flags
  isReturningVisitor: {
    type: Boolean,
    default: false
  },
  visitDuration: {
    type: Number, // in seconds
    default: 0
  }
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

// Indexes for efficient queries
AnalyticsSchema.index({ ipAddress: 1, createdAt: -1 });
AnalyticsSchema.index({ sessionId: 1 });
AnalyticsSchema.index({ pageUrl: 1, createdAt: -1 });
AnalyticsSchema.index({ device: 1, createdAt: -1 });
AnalyticsSchema.index({ country: 1, createdAt: -1 });

// Static method to record a page visit
AnalyticsSchema.statics.recordVisit = async function(visitData) {
  try {
    const analytics = new this(visitData);
    await analytics.save();
    return analytics;
  } catch (error) {
    throw new Error(`Failed to record visit: ${error.message}`);
  }
};

// Static method to get visitor statistics
AnalyticsSchema.statics.getVisitorStats = async function(startDate, endDate) {
  try {
    const matchStage = {};
    if (startDate && endDate) {
      matchStage.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const stats = await this.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalVisits: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$ipAddress' },
          deviceStats: {
            $push: {
              device: '$device',
              browser: '$browser',
              os: '$operatingSystem'
            }
          },
          countryStats: {
            $push: '$country'
          },
          avgVisitDuration: { $avg: '$visitDuration' }
        }
      },
      {
        $project: {
          totalVisits: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' },
          deviceStats: 1,
          countryStats: 1,
          avgVisitDuration: 1
        }
      }
    ]);

    return stats[0] || {
      totalVisits: 0,
      uniqueVisitors: 0,
      deviceStats: [],
      countryStats: [],
      avgVisitDuration: 0
    };
  } catch (error) {
    throw new Error(`Failed to get visitor stats: ${error.message}`);
  }
};

// Static method to get page popularity
AnalyticsSchema.statics.getPagePopularity = async function(limit = 10) {
  try {
    const stats = await this.aggregate([
      {
        $group: {
          _id: '$pageUrl',
          visitCount: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$ipAddress' },
          avgDuration: { $avg: '$visitDuration' }
        }
      },
      {
        $project: {
          pageUrl: '$_id',
          visitCount: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' },
          avgDuration: 1
        }
      },
      { $sort: { visitCount: -1 } },
      { $limit: limit }
    ]);

    return stats;
  } catch (error) {
    throw new Error(`Failed to get page popularity: ${error.message}`);
  }
};

// Static method to get device/browser statistics
AnalyticsSchema.statics.getDeviceStats = async function() {
  try {
    const deviceStats = await this.aggregate([
      {
        $group: {
          _id: '$device',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const browserStats = await this.aggregate([
      {
        $group: {
          _id: '$browser',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const osStats = await this.aggregate([
      {
        $group: {
          _id: '$operatingSystem',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    return {
      devices: deviceStats,
      browsers: browserStats,
      operatingSystems: osStats
    };
  } catch (error) {
    throw new Error(`Failed to get device stats: ${error.message}`);
  }
};

const Analytics = mongoose.model('Analytics', AnalyticsSchema);

export default Analytics;

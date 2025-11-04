import mongoose from 'mongoose';

const PropertyViewsSchema = new mongoose.Schema({
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Managedproperty',
    required: true,
    index: true
  },
  viewCount: {
    type: Number,
    default: 1,
    min: 0
  },
  lastViewedAt: {
    type: Date,
    default: Date.now
  },
  // Optional: Track unique visitors (if you want to implement this later)
  uniqueVisitors: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

// Compound index for efficient queries
PropertyViewsSchema.index({ propertyId: 1, lastViewedAt: -1 });

// Static method to increment view count for a property
PropertyViewsSchema.statics.incrementView = async function(propertyId) {
  try {
    const result = await this.findOneAndUpdate(
      { propertyId },
      { 
        $inc: { viewCount: 1 },
        $set: { lastViewedAt: new Date() }
      },
      { 
        upsert: true, // Create if doesn't exist
        new: true 
      }
    );
    return result;
  } catch (error) {
    throw new Error(`Failed to increment view count: ${error.message}`);
  }
};

// Static method to get view count for a property
PropertyViewsSchema.statics.getViewCount = async function(propertyId) {
  try {
    const result = await this.findOne({ propertyId });
    return result ? result.viewCount : 0;
  } catch (error) {
    throw new Error(`Failed to get view count: ${error.message}`);
  }
};

// Static method to get top viewed properties
PropertyViewsSchema.statics.getTopViewedProperties = async function(limit = 10) {
  try {
    const result = await this.find()
      .populate('propertyId', 'title type city location price')
      .sort({ viewCount: -1 })
      .limit(limit);
    return result;
  } catch (error) {
    throw new Error(`Failed to get top viewed properties: ${error.message}`);
  }
};

const PropertyViews = mongoose.model('PropertyViews', PropertyViewsSchema);

export default PropertyViews;

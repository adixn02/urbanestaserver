import mongoose from 'mongoose';

const ManagedpropertySchema = new mongoose.Schema({
  // Common fields for both regular and builder properties
  type: {
    type: String,
    enum: ['regular', 'builder'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    required: true
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'categories',
    required: true
  },
  subcategory: {
    type: String,
    required: true,
    trim: true
  },
  subcategoryName: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['available', 'sold', 'rented'],
    default: 'available'
  },
  googleMapUrl: {
    type: String,
    trim: true
  },
  images: [{
    type: String, // URLs of uploaded images
    trim: true
  }],
  projectImages: [{
    type: String, // URLs of project images (for regular properties)
    trim: true
  }],
  
  // Regular property specific fields
  price: {
    type: Number,
    min: 0
  },
  propertyAction: {
    type: String,
    enum: ['Sale', 'Rent']
  },
  
 
  area: {
    type: Number,
    min: 0
  },
  locality: {
    type: String,
    trim: true
  },
  
  // Builder property specific fields
  builder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Builder',
    trim: true
  },
  projectName: {
    type: String,
    trim: true
  },
  projectLogo: {
    type: String, // URL of uploaded logo
    trim: true
  },
  wallpaperImage: {
    type: String, // URL of uploaded wallpaper
    trim: true
  },
  fullAddress: {
    type: String,
    trim: true
  },
  about: {
    type: String,
    trim: true
  },
  reraNo: {
    type: String,
    trim: true
  },
  minPrice: {
    type: Number,
    min: 0
  },
  maxPrice: {
    type: Number,
    min: 0
  },
  possessionDate: {
    type: String, // Stored as YYYY-MM format
    trim: true
  },
  landArea: {
    type: String,
    trim: true
  },
  descriptionImage: {
    type: String, // URL of uploaded description image
    trim: true
  },
  highlightImage: {
    type: String, // URL of uploaded highlight image
    trim: true
  },
  // Unit details array for builder properties
  unitDetails: [{
    unitType: {
      type: String,
      trim: true
    },
    area: {
      type: String,
      trim: true
    },
    floorPlan: {
      type: String, // URL of uploaded floor plan
      trim: true
    }
  }],
  // Legacy fields for backward compatibility
  unitType: {
    type: String,
    trim: true
  },
  areaType: {
    type: String,
    trim: true
  },
  highlights: [{
    type: String,
    trim: true
  }],
  connectivityPoints: [{
    type: String,
    trim: true
  }],
  floorPlan: {
    type: String, // URL of uploaded floor plan
    trim: true
  },
  masterPlan: {
    type: String, // URL of uploaded master plan
    trim: true
  },
  // User association fields
  createdBy: {
    type: String, // User ID
    required: true
  },
  createdByPhone: {
    type: String, // User's phone number
    required: true
  }
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

// Index for better query performance
ManagedpropertySchema.index({ type: 1, status: 1 });
ManagedpropertySchema.index({ city: 1 });
ManagedpropertySchema.index({ category: 1, subcategory: 1 });
ManagedpropertySchema.index({ createdBy: 1 });
ManagedpropertySchema.index({ createdByPhone: 1 });

// Virtual field to check if it's a builder property
ManagedpropertySchema.virtual('isBuilder').get(function() {
  return this.type === 'builder';
});

// Ensure virtual fields are serialized
ManagedpropertySchema.set('toJSON', { virtuals: true });

const Managedproperty = mongoose.model('Managedproperty', ManagedpropertySchema);

export default Managedproperty;

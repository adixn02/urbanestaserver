import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  propertyInterest: {
    type: String,
    trim: true
  },
  message: {
    type: String,
    trim: true
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Managedproperty',
    default: null
  },
  propertyName: {
    type: String,
    trim: true
  },
  propertyUrl: {
    type: String,
    trim: true
  },
  source: {
    type: String,
    default: 'website',
    enum: ['website', 'property_page_popup', 'contact_form', 'phone', 'walk_in']
  },
  status: {
    type: String,
    default: 'new',
    enum: ['new', 'contacted', 'qualified', 'converted', 'closed']
  },
  priority: {
    type: String,
    default: 'medium',
    enum: ['low', 'medium', 'high', 'urgent']
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  notes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  followUpDate: {
    type: Date,
    default: null
  },
  tags: [{
    type: String,
    trim: true
  }],
  metadata: {
    userAgent: String,
    ipAddress: String,
    referrer: String,
    utmSource: String,
    utmMedium: String,
    utmCampaign: String
  }
}, {
  timestamps: true
});

// Index for better query performance
leadSchema.index({ phone: 1 });
leadSchema.index({ email: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ propertyId: 1 });

// Virtual for full name
leadSchema.virtual('fullName').get(function() {
  return this.name;
});

// Method to update status
leadSchema.methods.updateStatus = function(newStatus) {
  this.status = newStatus;
  return this.save();
};

// Method to add note
leadSchema.methods.addNote = function(note, userId) {
  this.notes.push({
    note,
    addedBy: userId,
    addedAt: new Date()
  });
  return this.save();
};

// Static method to get leads by status
leadSchema.statics.getByStatus = function(status) {
  return this.find({ status }).sort({ createdAt: -1 });
};

// Static method to get leads by property
leadSchema.statics.getByProperty = function(propertyId) {
  return this.find({ propertyId }).sort({ createdAt: -1 });
};

// Pre-save middleware
leadSchema.pre('save', function(next) {
  // Set follow-up date to 24 hours from now if not set
  if (!this.followUpDate && this.status === 'new') {
    this.followUpDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  next();
});

const Lead = mongoose.model('Lead', leadSchema);

export default Lead;

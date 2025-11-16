import mongoose from 'mongoose';

const homeVideoSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    trim: true
  },
  key: {
    type: String,
    required: true,
    trim: true
  },
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true,
    default: 'video/mp4'
  },
  isActive: {
    type: Boolean,
    default: false
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better query performance
homeVideoSchema.index({ isActive: 1 });
homeVideoSchema.index({ uploadedAt: -1 });

const HomeVideo = mongoose.model('HomeVideo', homeVideoSchema);

export default HomeVideo;


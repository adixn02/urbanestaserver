import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      match: [/^\+[1-9]\d{1,14}$/, 'Please enter a valid phone number with country code'],
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
      default: 'Delhi'
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true, // Allows multiple null values but ensures uniqueness for non-null values
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    joinDate: {
      type: Date,
      default: Date.now,
    },
    lastLogin: {
      type: Date,
    },
    watchlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Managedproperty',
      },
    ],
    myProperties: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Managedproperty',
      },
    ],
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for formatted phone number
userSchema.virtual('formattedPhone').get(function() {
  return this.phoneNumber;
});

// Index for better performance
userSchema.index({ phoneNumber: 1 });
userSchema.index({ name: 1 });
userSchema.index({ city: 1 });

export const User = mongoose.model('User', userSchema);
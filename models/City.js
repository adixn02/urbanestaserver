import mongoose from "mongoose";

const localitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const citySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  country: {
    type: String,
    required: true,
    trim: true,
    default: "India"
  },
  isActive: {
    type: Boolean,
    default: true
  },
  backgroundImage: {
    type: String,
    default: ""
  },
  localities: [localitySchema]
}, { timestamps: true });

export default mongoose.model("City", citySchema);

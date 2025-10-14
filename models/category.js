// backend/models/Category.js
import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  deepSubcategories: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true }
  }],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("categories", CategorySchema);

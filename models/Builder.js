import mongoose from "mongoose";

const builderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    description: String,
    logo: String,
    backgroundImage: String,
    isActive: { type: Boolean, default: true },
    establishedYear: Number,
    totalProjects: Number,
    completedProjects: Number,
    ongoingProjects: Number,
    upcomingProjects: Number,
    locations: [String], // Array of locations
    specialties: [String], // Array of specialties
    awards: [String], // Array of awards
    website: String,
    contactInfo: {
      email: String,
      phone: String,
      address: String,
    },
    properties: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Property", // Assuming you will create a Property model later
      },
    ],
    displayOrder: { type: Number, default: 0 },
    headquarters: String,
  },
  { timestamps: true }
);

const Builder = mongoose.model("Builder", builderSchema);

export default Builder;

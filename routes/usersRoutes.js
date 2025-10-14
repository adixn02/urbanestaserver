import express from "express";
import User from "../models/User.js";
import Property from "../models/Property.js";

const router = express.Router();

/* ===============================
   ✅ Create a new user
================================ */
router.post("/", async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ✅ Get all users
================================ */
router.get("/", async (req, res) => {
  try {
    const users = await User.find().populate("watchlist");
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ✅ Get a single user by ID
================================ */
router.get("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("watchlist");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ✅ Update user info
================================ */
router.put("/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    }).populate("watchlist");

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ✅ Delete user
================================ */
router.delete("/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ✅ Add property to user's watchlist
================================ */
router.post("/:id/watchlist", async (req, res) => {
  try {
    const { propertyId } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { watchlist: propertyId } }, // avoids duplicates
      { new: true }
    ).populate("watchlist");

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ✅ Remove property from watchlist
================================ */
router.delete("/:id/watchlist/:propertyId", async (req, res) => {
  try {
    const { id, propertyId } = req.params;
    const user = await User.findByIdAndUpdate(
      id,
      { $pull: { watchlist: propertyId } },
      { new: true }
    ).populate("watchlist");

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

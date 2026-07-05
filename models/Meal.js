const mongoose = require("mongoose");

const mealSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    foodName: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: "",
    },
    portion: {
      type: String,
      default: "",
    },
    estimatedCalories: {
      type: Number,
      default: 0,
    },
    calorieRange: {
      type: String,
      default: "",
    },
    protein: {
      type: Number,
      default: 0,
    },
    carbs: {
      type: Number,
      default: 0,
    },
    fats: {
      type: Number,
      default: 0,
    },
    confidence: {
      type: String,
      default: "",
    },
    observation: {
      type: String,
      default: "",
    },
    // Fecha en formato "YYYY-MM-DD", para poder agrupar y sumar por día
    // sin pelear con zonas horarias de createdAt.
    date: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Meal", mealSchema);
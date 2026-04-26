const mongoose = require("mongoose");

const ActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true
    },

    title: {
      type: String,
      required: true,
      default: "Entrenamiento"
    },

    date: {
      type: String,
      required: true
    },

    distance: {
      type: Number,
      default: 0
    },

    duration: {
      type: Number,
      default: 0
    },

    pace: {
      type: Number,
      default: 0
    },

    notes: {
      type: String,
      default: ""
    },

    bpm: {
      type: Number,
      default: 0
    },

    steps: {
      type: Number,
      default: 0
    },

    cadence: {
      type: Number,
      default: 0
    },

    acceleration: {
      type: Number,
      default: 0
    },

    iaClass: {
      type: Number,
      default: null
    },

    iaLabel: {
      type: String,
      default: ""
    },

    iaConfidence: {
      type: Number,
      default: 0
    },

    iaRecommendation: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Activity", ActivitySchema);
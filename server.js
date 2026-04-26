const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

const User = require("./models/User");
const Activity = require("./models/Activity");

const SECRET = "secreto123";

app.use(cors());
app.use(express.json());

// 🔥 CONEXIÓN A MONGO
mongoose
  .connect("mongodb://127.0.0.1:27017/stravaDB")
  .then(() => console.log("MongoDB conectado"))
  .catch((err) => console.log("ERROR MONGO:", err));

// 🔥 TEST ROUTE
app.get("/", (req, res) => {
  res.send("Backend funcionando 🔥");
});

// 🔥 REGISTER
app.post("/register", async (req, res) => {
  try {
    console.log("REGISTER:", req.body);

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Faltan datos"
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        error: "Usuario ya existe"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword
    });

    await user.save();

    res.status(201).json({
      message: "Usuario registrado correctamente"
    });

  } catch (error) {
    console.log("ERROR REGISTER:", error);

    res.status(500).json({
      error: "Error servidor"
    });
  }
});

// 🔥 LOGIN
app.post("/login", async (req, res) => {
  try {
    console.log("LOGIN:", req.body);

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Faltan datos"
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        error: "Usuario no existe"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        error: "Contraseña incorrecta"
      });
    }

    const token = jwt.sign(
      { id: user._id },
      SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "Login correcto",
      token,
      user
    });

  } catch (error) {
    console.log("ERROR LOGIN:", error);

    res.status(500).json({
      error: "Error servidor"
    });
  }
});

// 🔥 GUARDAR ACTIVIDAD
app.post("/activities", async (req, res) => {
  try {
    console.log("ACTIVITY POST:", req.body);

    const {
      userId,
      title,
      date,
      distance,
      duration,
      pace,
      notes,

      // Datos extra del reloj / IA, si tu modelo Activity los tiene
      bpm,
      steps,
      cadence,
      acceleration,
      iaClass,
      iaLabel,
      iaConfidence,
      iaRecommendation
    } = req.body;

    if (!userId || !title || !date) {
      return res.status(400).json({
        error: "Faltan datos obligatorios"
      });
    }

    const activity = new Activity({
      userId,
      title,
      date,
      distance: Number(distance) || 0,
      duration: Number(duration) || 0,
      pace: Number(pace) || 0,
      notes: notes || "",

      bpm: Number(bpm) || 0,
      steps: Number(steps) || 0,
      cadence: Number(cadence) || 0,
      acceleration: Number(acceleration) || 0,
      iaClass: iaClass ?? null,
      iaLabel: iaLabel || "",
      iaConfidence: Number(iaConfidence) || 0,
      iaRecommendation: iaRecommendation || ""
    });

    await activity.save();

    res.status(201).json({
      message: "Actividad guardada correctamente",
      activity
    });

  } catch (error) {
    console.log("ERROR ACTIVITY POST:", error);

    res.status(500).json({
      error: "Error al guardar actividad",
      details: error.message
    });
  }
});

// 🔥 OBTENER ACTIVIDADES POR USUARIO
app.get("/activities/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    console.log("GET ACTIVITIES USER:", userId);

    if (!userId) {
      return res.status(400).json({
        error: "Falta userId"
      });
    }

    const activities = await Activity
      .find({ userId })
      .sort({ date: -1, createdAt: -1 });

    res.status(200).json(activities);

  } catch (error) {
    console.log("ERROR ACTIVITY GET:", error);

    res.status(500).json({
      error: "Error al obtener actividades",
      details: error.message
    });
  }
});

// 🔥 ELIMINAR ACTIVIDAD POR ID
app.delete("/activities/:id", async (req, res) => {
  try {
    const { id } = req.params;

    console.log("DELETE ACTIVITY ID:", id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "ID de actividad inválido"
      });
    }

    const activityDeleted = await Activity.findByIdAndDelete(id);

    if (!activityDeleted) {
      return res.status(404).json({
        message: "Actividad no encontrada"
      });
    }

    res.status(200).json({
      message: "Actividad eliminada correctamente",
      activityDeleted
    });

  } catch (error) {
    console.log("ERROR DELETE ACTIVITY:", error);

    res.status(500).json({
      message: "Error al eliminar actividad",
      error: error.message
    });
  }
});

// 🔥 SERVER
app.listen(3000, "0.0.0.0", () => {
  console.log("Servidor corriendo en puerto 3000");
});
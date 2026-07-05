require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const FOOD_API_KEY = process.env.FOOD_API_KEY;

const User = require("./models/User");
const Activity = require("./models/Activity");

const app = express();

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "clave_temporal";

if (!MONGO_URI) {
  console.error("ERROR: Falta la variable de entorno MONGO_URI");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB Atlas conectado correctamente");
  })
  .catch((error) => {
    console.error("Error conectando a MongoDB Atlas:", error.message);
  });

app.get("/", (req, res) => {
  res.json({
    message: "Backend funcionando correctamente",
    database: "MongoDB Atlas",
    status: "OK"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    server: "online",
    timestamp: new Date().toISOString()
  });
});

app.post("/register", async (req, res) => {
  try {
    console.log("REGISTER:", req.body);

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Faltan datos"
      });
    }

    const emailNormalizado = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: emailNormalizado
    });

    if (existingUser) {
      return res.status(400).json({
        error: "Usuario ya existe"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email: emailNormalizado,
      password: hashedPassword
    });

    await user.save();

    res.json({
      message: "Usuario registrado correctamente"
    });

  } catch (error) {
    console.log("ERROR REGISTER:", error);

    res.status(500).json({
      error: "Error servidor"
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    console.log("LOGIN:", req.body);

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Faltan datos"
      });
    }

    const emailNormalizado = email.trim().toLowerCase();

    const user = await User.findOne({
      email: emailNormalizado
    });

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
      {
        id: user._id,
        email: user.email
      },
      JWT_SECRET,
      {
        expiresIn: "7d"
      }
    );

    res.json({
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

      iaClass: iaClass === null || iaClass === undefined ? null : Number(iaClass),
      iaLabel: iaLabel || "",
      iaConfidence: Number(iaConfidence) || 0,
      iaRecommendation: iaRecommendation || ""
    });

    await activity.save();

    res.json({
      message: "Actividad guardada correctamente",
      activity
    });

  } catch (error) {
    console.log("ERROR ACTIVITY POST:", error);

    res.status(500).json({
      error: "Error al guardar actividad"
    });
  }
});

app.get("/activities/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    console.log("GET ACTIVITIES USER:", userId);

    const activities = await Activity.find({
      userId
    }).sort({
      createdAt: -1
    });

    res.json(activities);

  } catch (error) {
    console.log("ERROR ACTIVITY GET:", error);

    res.status(500).json({
      error: "Error al obtener actividades"
    });
  }
});

app.delete("/activities/:id", async (req, res) => {
  try {
    const { id } = req.params;

    console.log("DELETE ACTIVITY ID:", id);

    const activityDeleted = await Activity.findByIdAndDelete(id);

    if (!activityDeleted) {
      return res.status(404).json({
        message: "Actividad no encontrada"
      });
    }

    res.json({
      message: "Actividad eliminada correctamente"
    });

  } catch (error) {
    console.log("ERROR ACTIVITY DELETE:", error);

    res.status(500).json({
      message: "Error al eliminar actividad",
      error: error.message
    });
  }
});

app.post("/analyze-food", async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!FOOD_API_KEY) {
      return res.status(500).json({
        error: "Falta FOOD_API_KEY en el servidor"
      });
    }

    if (!imageBase64) {
      return res.status(400).json({
        error: "Falta la imagen en base64"
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": FOOD_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: imageBase64
                }
              },
              {
                type: "text",
                text:
                  "Analiza esta imagen. Si NO es comida, responde solamente: NO_COMIDA. " +
                  "Si sí es comida, responde SOLO en JSON válido con este formato exacto: " +
                  "{\"detectedFoods\":[{\"name\":\"nombre\",\"calories\":123}],\"totalCalories\":123,\"message\":\"observación breve\"}"
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Error de API externa",
        details: data
      });
    }

    if (!data.content || !data.content[0] || !data.content[0].text) {
      return res.status(500).json({
        error: "Respuesta inesperada de la IA",
        details: data
      });
    }

    const texto = data.content[0].text.trim();

    if (texto === "NO_COMIDA") {
      return res.json({
        detectedFoods: [],
        totalCalories: 0,
        message: "No se detectó comida en la imagen"
      });
    }

    let resultado;
    try {
      resultado = JSON.parse(texto);
    } catch (e) {
      return res.status(500).json({
        error: "La IA no devolvió JSON válido",
        raw: texto
      });
    }

    return res.json(resultado);

  } catch (error) {
    console.log("ERROR ANALYZE FOOD:", error);

    res.status(500).json({
      error: "Error al analizar comida",
      details: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
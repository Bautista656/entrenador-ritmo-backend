require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "clave_temporal";
const PORT = process.env.PORT || 3000;

const User = require("./models/User");
const Activity = require("./models/Activity");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

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
    status: "OK",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    server: "online",
    timestamp: new Date().toISOString(),
  });
});

app.post("/register", async (req, res) => {
  try {
    console.log("REGISTER:", req.body);

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Faltan datos",
      });
    }

    const emailNormalizado = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: emailNormalizado,
    });

    if (existingUser) {
      return res.status(400).json({
        error: "Usuario ya existe",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email: emailNormalizado,
      password: hashedPassword,
    });

    await user.save();

    res.json({
      message: "Usuario registrado correctamente",
    });
  } catch (error) {
    console.log("ERROR REGISTER:", error);

    res.status(500).json({
      error: "Error servidor",
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    console.log("LOGIN:", req.body);

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Faltan datos",
      });
    }

    const emailNormalizado = email.trim().toLowerCase();

    const user = await User.findOne({
      email: emailNormalizado,
    });

    if (!user) {
      return res.status(400).json({
        error: "Usuario no existe",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        error: "Contraseña incorrecta",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
      },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.json({
      token,
      user,
    });
  } catch (error) {
    console.log("ERROR LOGIN:", error);

    res.status(500).json({
      error: "Error servidor",
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
      iaRecommendation,
    } = req.body;

    if (!userId || !title || !date) {
      return res.status(400).json({
        error: "Faltan datos obligatorios",
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
      iaRecommendation: iaRecommendation || "",
    });

    await activity.save();

    res.json({
      message: "Actividad guardada correctamente",
      activity,
    });
  } catch (error) {
    console.log("ERROR ACTIVITY POST:", error);

    res.status(500).json({
      error: "Error al guardar actividad",
    });
  }
});

app.get("/activities/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    console.log("GET ACTIVITIES USER:", userId);

    const activities = await Activity.find({ userId }).sort({
      createdAt: -1,
    });

    res.json(activities);
  } catch (error) {
    console.log("ERROR ACTIVITY GET:", error);

    res.status(500).json({
      error: "Error al obtener actividades",
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
        message: "Actividad no encontrada",
      });
    }

    res.json({
      message: "Actividad eliminada correctamente",
    });
  } catch (error) {
    console.log("ERROR ACTIVITY DELETE:", error);

    res.status(500).json({
      message: "Error al eliminar actividad",
      error: error.message,
    });
  }
});

// -----------------------------
// Helpers para /analyze-food
// -----------------------------

const MIME_TYPES_PERMITIDOS = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

// Quita el prefijo "data:image/xxx;base64," si el frontend lo envía tal cual,
// y detecta el mimeType real de la imagen. Esta era una causa muy común de
// que Gemini "no reconociera" nada: el base64 llegaba con el prefijo incluido
// y la API lo interpretaba como datos corruptos.
function limpiarImagenBase64(imageBase64, mimeTypeDeclarado) {
  let mimeType = mimeTypeDeclarado || "image/jpeg";
  let data = imageBase64 || "";

  const match = data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
  if (match) {
    mimeType = match[1];
    data = match[2];
  }

  data = data.trim();

  if (!MIME_TYPES_PERMITIDOS.includes(mimeType)) {
    mimeType = "image/jpeg";
  }

  return { data, mimeType };
}

function limpiarJsonTexto(texto) {
  let limpio = texto.trim();

  if (limpio.startsWith("```json")) {
    limpio = limpio.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  } else if (limpio.startsWith("```")) {
    limpio = limpio.replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  }

  return limpio.trim();
}

function normalizarResultado(obj) {
  const isFood = Boolean(obj?.isFood);

  if (!isFood) {
    return {
      isFood: false,
      foodName: "",
      category: "",
      portion: "",
      estimatedCalories: 0,
      calorieRange: "",
      confidence: "baja",
      observation: obj?.observation || "No se detectó comida en la imagen",
    };
  }

  return {
    isFood: true,
    foodName: String(obj?.foodName || "Alimento no identificado"),
    category: String(obj?.category || "plato"),
    portion: String(obj?.portion || "Porción no clara"),
    estimatedCalories: Number(obj?.estimatedCalories) || 0,
    calorieRange: String(obj?.calorieRange || ""),
    confidence: String(obj?.confidence || "media"),
    observation: String(obj?.observation || ""),
  };
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    isFood: { type: "boolean" },
    foodName: { type: "string" },
    category: { type: "string" },
    portion: { type: "string" },
    estimatedCalories: { type: "number" },
    calorieRange: { type: "string" },
    confidence: { type: "string" },
    observation: { type: "string" },
  },
  required: [
    "isFood",
    "foodName",
    "category",
    "portion",
    "estimatedCalories",
    "calorieRange",
    "confidence",
    "observation",
  ],
};

app.post("/analyze-food", async (req, res) => {
  try {
    const { imageBase64, mimeType: mimeTypeBody } = req.body;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Falta GEMINI_API_KEY en el servidor",
      });
    }

    if (!imageBase64) {
      return res.status(400).json({
        error: "Falta la imagen en base64",
      });
    }

    const { data: imagenLimpia, mimeType } = limpiarImagenBase64(
      imageBase64,
      mimeTypeBody
    );

    if (!imagenLimpia) {
      return res.status(400).json({
        error: "La imagen en base64 está vacía o mal formada",
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: imagenLimpia,
                  },
                },
                {
                  text:
                    'Analiza esta imagen de alimento o bebida. ' +
                    'Si NO hay comida o bebida visible, responde con isFood en false y explica por qué en observation. ' +
                    'Si SÍ hay comida o bebida, identifica el alimento, la porción visible, una categoría ' +
                    '(plato, paquete, bebida o snack) y una estimación razonable de calorías con su rango. ' +
                    "Reglas: " +
                    "1. No inventes precisión exacta, da una estimación creíble. " +
                    "2. Si es un producto empaquetado, indica si es el paquete completo o solo una referencia visual. " +
                    "3. Si la cantidad visible no es clara, usa un rango conservador. " +
                    "4. Responde siempre en español.",
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.log("ERROR GEMINI API:", JSON.stringify(data));
      return res.status(response.status).json({
        error: "Error de API externa",
        details: data,
      });
    }

    // Si el modelo se negó a responder (safety, etc.) candidates puede venir vacío
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (!data?.candidates?.length) {
      console.log("ERROR ANALYZE FOOD: sin candidates", JSON.stringify(data));
      return res.status(500).json({
        error: "Gemini no devolvió resultados",
        finishReason: finishReason || null,
        details: data,
      });
    }

    const textoPlano =
      data.candidates[0]?.content?.parts
        ?.filter((part) => typeof part.text === "string")
        ?.map((part) => part.text)
        ?.join("\n")
        ?.trim() || "";

    if (!textoPlano) {
      return res.status(500).json({
        error: "Respuesta inesperada de Gemini",
        finishReason: finishReason || null,
        details: data,
      });
    }

    const textoJson = limpiarJsonTexto(textoPlano);

    let resultado;
    try {
      resultado = JSON.parse(textoJson);
    } catch (e) {
      console.log("ERROR PARSEO JSON. Texto crudo de Gemini:", textoPlano);
      return res.status(500).json({
        error: "Gemini no devolvió JSON válido",
        raw: textoPlano,
      });
    }

    return res.json(normalizarResultado(resultado));
  } catch (error) {
    console.log("ERROR ANALYZE FOOD:", error);

    res.status(500).json({
      error: "Error al analizar comida",
      details: error.message,
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
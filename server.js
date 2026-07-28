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
const Meal = require("./models/Meal");

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

// Lista los modelos que la API key configurada puede usar para analizar
// imagenes. Sirve para actualizar MODELOS_EN_ORDEN cuando Google descontinua
// una version, sin tener que adivinar nombres.
app.get("/modelos", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Falta GEMINI_API_KEY en el servidor" });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      { headers: { "x-goog-api-key": GEMINI_API_KEY } }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const disponibles = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace("models/", ""));

    res.json({ total: disponibles.length, modelos: disponibles });
  } catch (error) {
    res.status(500).json({ error: "No se pudo consultar la lista", details: error.message });
  }
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

// Modelos a probar en orden. Google satura sus modelos por temporadas y
// descontinua versiones antiguas sin aviso previo en la aplicacion, asi que el
// analisis recorre esta lista hasta encontrar uno que responda en lugar de
// depender de un unico nombre fijo. Consulta GET /modelos para ver cuales
// acepta realmente la API key configurada.
const MODELOS_EN_ORDEN = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-flash-latest",
];

const PROMPT_ANALISIS =
  "Eres un nutriólogo analizando la fotografía de un alimento. " +
  "Si NO hay comida o bebida visible, responde con isFood en false y explica por qué en observation. " +
  "Antes de responder, razona en este orden: " +
  "(a) identifica qué alimento es y si es un producto comercial de marca; " +
  "(b) si reconoces la marca o alcanzas a leer la etiqueta, BUSCA EN INTERNET su tabla " +
  "nutricional oficial y usa esos datos reales; " +
  "(c) determina a qué porción vas a reportar; " +
  "(d) calcula los macronutrientes de esa porción; " +
  "(e) verifica que las cifras sean coherentes entre sí antes de entregarlas. " +
  "REGLA MÁS IMPORTANTE - la porción: " +
  "Reporta SIEMPRE los valores de UNA porción de consumo normal, NUNCA el paquete completo. " +
  "Si es un producto empaquetado, usa la porción sugerida de su tabla nutricional " +
  "(por ejemplo 1 pieza, 2 galletas, 30 g), no el contenido neto total del paquete. " +
  "Nadie se come un paquete entero de una sentada, y reportar el total da cifras " +
  "engañosas para quien lleva el conteo de su día. " +
  "En portion escribe con claridad a qué cantidad corresponden las cifras " +
  "(ejemplo: '1 tostada (12 g)' o '30 g, aprox. 2 piezas'). " +
  "Si es comida servida en un plato, usa la porción que se ve en la imagen. " +
  "Reglas de precisión: " +
  "1. Si obtuviste los datos de la etiqueta oficial o de una fuente confiable, úsalos tal cual, " +
  "sin redondearlos ni inflarlos, y pon confidence en alta. " +
  "2. Si estimas a ojo (comida preparada, sin etiqueta), apóyate en valores conocidos por cada " +
  "100 g del ingrediente principal y multiplica por la cantidad que ves; redondea " +
  "estimatedCalories a un múltiplo de 10 y los macronutrientes a enteros, y usa confidence " +
  "media o baja según qué tan clara se vea la porción. " +
  "3. calorieRange debe reflejar la incertidumbre real: angosto cuando viene de una etiqueta " +
  "(±5%), más amplio cuando es estimación visual (±15% o más). " +
  "4. VERIFICACIÓN OBLIGATORIA de coherencia: la proteína y los carbohidratos aportan 4 kcal " +
  "por gramo, y las grasas 9 kcal por gramo. Calcula " +
  "(protein x 4) + (carbs x 4) + (fats x 9) y compáralo con estimatedCalories: deben " +
  "parecerse. Si no cuadran, corrige tus cifras antes de responder, no entregues números " +
  "que se contradigan entre sí. " +
  "5. Cuida que cada macronutriente sea plausible para ese alimento: un producto horneado sin " +
  "grasa añadida no puede tener 30 g de grasa, y una verdura no puede tener 40 g de proteína. " +
  "6. En observation, en una sola frase, di a qué porción corresponden las cifras y si vienen " +
  "de la etiqueta del producto o de una estimación visual. " +
  "7. El campo confidence debe ser exactamente una de estas tres palabras en español: " +
  "alta, media o baja. " +
  "8. Responde siempre en español. " +
  "FORMATO DE SALIDA: responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni " +
  "después, con exactamente estos campos: isFood (booleano), foodName (texto), " +
  "category (texto: plato, paquete, bebida o snack), portion (texto), " +
  "estimatedCalories (número), calorieRange (texto), protein (número), carbs (número), " +
  "fats (número), confidence (texto), observation (texto), recomendacion (texto) y " +
  "porcionSugerida (texto). Deja recomendacion y porcionSugerida como cadena vacía " +
  "salvo que más abajo se te dé el contexto de la persona.";

/**
 * Anade al prompt el contexto del usuario para que la IA redacte un consejo
 * personalizado.
 *
 * Las metas y lo ya consumido llegan calculados desde la aplicacion con la
 * ecuacion de Mifflin-St Jeor. Aqui se le pide explicitamente al modelo que NO
 * recalcule esas cifras: interpretar numeros dados es algo que hace bien,
 * mientras que la aritmetica es donde se equivoca.
 *
 * Devuelve cadena vacia cuando el usuario no ha llenado sus datos corporales,
 * de modo que el analisis nutricional sigue funcionando sin personalizar.
 */
function bloqueDePerfil(perfil) {
  if (!perfil || !perfil.caloriasMeta) return "";

  const restantes = perfil.caloriasMeta - (perfil.caloriasConsumidas || 0);

  return (
    " CONTEXTO DE LA PERSONA que va a comer esto. " +
    `Sexo: ${perfil.sexo}. Edad: ${perfil.edad} años. ` +
    `Estatura: ${perfil.estaturaCm} cm. Peso: ${perfil.pesoKg} kg. ` +
    `Nivel de actividad: ${perfil.nivelActividad}. Objetivo: ${perfil.objetivo}. ` +
    "Metas diarias ya calculadas: " +
    `${perfil.caloriasMeta} kcal, ${perfil.proteinaMeta} g de proteína, ` +
    `${perfil.carbosMeta} g de carbohidratos, ${perfil.grasasMeta} g de grasas. ` +
    "Lo que lleva consumido hoy antes de esta comida: " +
    `${perfil.caloriasConsumidas || 0} kcal, ${perfil.proteinaConsumida || 0} g de proteína, ` +
    `${perfil.carbosConsumidos || 0} g de carbohidratos, ${perfil.grasasConsumidas || 0} g de grasas. ` +
    `Le quedan aproximadamente ${restantes} kcal disponibles para el resto del día. ` +
    "INSTRUCCIONES PARA LOS CAMPOS recomendacion Y porcionSugerida: " +
    "1. NO recalcules las metas ni los totales: ya vienen calculados con una fórmula " +
    "médica y son correctos. Tu trabajo es interpretarlos, no rehacerlos. " +
    "2. En recomendacion escribe 2 o 3 frases, en segundo persona y en español, " +
    "diciendo si esta porción encaja bien en su día según su objetivo, qué " +
    "macronutriente le conviene cuidar, y una sugerencia práctica y concreta " +
    "(por ejemplo con qué acompañarla o en qué momento del día conviene más). " +
    "3. Si la porción analizada es desproporcionada para esta persona, usa " +
    "porcionSugerida para indicar una cantidad más adecuada (ejemplo: " +
    "'2 tostadas en lugar de 4'). Si la porción ya es apropiada, deja " +
    "porcionSugerida como cadena vacía. " +
    "4. Sé alentador y concreto, nunca alarmista ni culposo: la persona está " +
    "cuidando su alimentación y merece un tono que la acompañe. " +
    "5. No des indicaciones médicas ni diagnósticos; esto es orientación general."
  );
}

// La busqueda web de Google y la salida con esquema JSON no son compatibles
// entre si: al combinarlas la API responde 400 con "Search Grounding can't be
// used with JSON/YAML/XML mode". Por eso cada modo arma su solicitud distinto,
// y cuando hay busqueda el JSON se pide por instruccion dentro del prompt.
function construirCuerpo(partes, conBusqueda) {
  const cuerpo = {
    contents: [{ role: "user", parts: partes }],
    generationConfig: { temperature: 0.4 },
  };

  if (conBusqueda) {
    cuerpo.tools = [{ google_search: {} }];
  } else {
    cuerpo.generationConfig.responseMimeType = "application/json";
    cuerpo.generationConfig.responseSchema = RESPONSE_SCHEMA;
  }

  return cuerpo;
}

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

  limpio = limpio.trim();

  // Cuando la busqueda web esta activa no se puede exigir un esquema de salida,
  // asi que el modelo a veces acompana el JSON con una frase de introduccion o
  // con las fuentes que consulto. En ese caso se recorta el objeto en si, que
  // va del primer "{" a su llave de cierre correspondiente.
  if (!limpio.startsWith("{")) {
    const inicio = limpio.indexOf("{");
    const fin = limpio.lastIndexOf("}");

    if (inicio !== -1 && fin > inicio) {
      limpio = limpio.slice(inicio, fin + 1);
    }
  }

  return limpio.trim();
}

// Saca el objeto JSON de la respuesta de Gemini. Devuelve null si la respuesta
// vino vacia, si el modelo se nego a contestar, o si el texto no es JSON.
function extraerJson(data) {
  const texto =
    data?.candidates?.[0]?.content?.parts
      ?.filter((part) => typeof part.text === "string")
      ?.map((part) => part.text)
      ?.join("\n")
      ?.trim() || "";

  if (!texto) return null;

  try {
    return JSON.parse(limpiarJsonTexto(texto));
  } catch (e) {
    console.log("No se pudo interpretar como JSON:", texto.slice(0, 300));
    return null;
  }
}

// El modelo a veces devuelve la confianza en ingles ("HIGH", "medium") pese a
// pedirle espanol, y ese valor se muestra tal cual en la aplicacion. Aqui se
// traduce a las tres palabras que la pantalla espera.
function normalizarConfianza(valor) {
  const texto = String(valor || "").trim().toLowerCase();

  if (["alta", "high", "alto"].includes(texto)) return "alta";
  if (["baja", "low", "bajo"].includes(texto)) return "baja";
  if (["media", "medium", "moderada", "medio"].includes(texto)) return "media";

  return "media";
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
      protein: 0,
      carbs: 0,
      fats: 0,
      confidence: "baja",
      observation: obj?.observation || "No se detectó comida en la imagen",
      recomendacion: "",
      porcionSugerida: "",
    };
  }

  const resultado = {
    isFood: true,
    foodName: String(obj?.foodName || "Alimento no identificado"),
    category: String(obj?.category || "plato"),
    portion: String(obj?.portion || "Porción no clara"),
    estimatedCalories: Number(obj?.estimatedCalories) || 0,
    calorieRange: String(obj?.calorieRange || ""),
    protein: Number(obj?.protein) || 0,
    carbs: Number(obj?.carbs) || 0,
    fats: Number(obj?.fats) || 0,
    confidence: normalizarConfianza(obj?.confidence),
    observation: String(obj?.observation || ""),
    recomendacion: String(obj?.recomendacion || ""),
    porcionSugerida: String(obj?.porcionSugerida || ""),
  };

  return revisarCoherencia(resultado);
}

// Comprobacion aritmetica que no depende de que el modelo se acuerde de
// hacerla: los macronutrientes tienen un aporte energetico fijo, asi que las
// calorias que se derivan de ellos deben parecerse a las reportadas. Cuando no
// cuadran, alguna de las dos cifras esta mal y no hay forma de saber cual, por
// lo que en vez de inventar una correccion se baja la confianza para que el
// usuario sepa que ese dato merece menos credito.
function revisarCoherencia(resultado) {
  const { protein, carbs, fats, estimatedCalories } = resultado;

  const caloriasDeMacros = protein * 4 + carbs * 4 + fats * 9;

  if (estimatedCalories <= 0 || caloriasDeMacros <= 0) {
    return resultado;
  }

  const desviacion =
    Math.abs(caloriasDeMacros - estimatedCalories) / estimatedCalories;

  if (desviacion > 0.25) {
    console.log(
      `Incoherencia en ${resultado.foodName}: ${estimatedCalories} kcal declaradas ` +
        `contra ${Math.round(caloriasDeMacros)} kcal derivadas de los macronutrientes.`
    );

    resultado.confidence = "baja";
    resultado.observation = [
      resultado.observation,
      "Las cifras de macronutrientes y calorías no terminan de coincidir, " +
        "así que conviene tomar este resultado solo como referencia.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return resultado;
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
    protein: { type: "number" },
    carbs: { type: "number" },
    fats: { type: "number" },
    confidence: { type: "string" },
    observation: { type: "string" },
    recomendacion: { type: "string" },
    porcionSugerida: { type: "string" },
  },
  required: [
    "isFood",
    "foodName",
    "category",
    "portion",
    "estimatedCalories",
    "calorieRange",
    "protein",
    "carbs",
    "fats",
    "confidence",
    "observation",
  ],
};

app.post("/analyze-food", async (req, res) => {
  try {
    const { imageBase64, mimeType: mimeTypeBody, perfil } = req.body;

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

    const partes = [
      { inline_data: { mime_type: mimeType, data: imagenLimpia } },
      { text: PROMPT_ANALISIS + bloqueDePerfil(perfil) },
    ];

    let response;
    let data;
    let busquedaDescartada = false;
    let modeloUsado = null;
    let busquedaUsada = false;

    // Se intenta primero con busqueda web activada, porque permite consultar la
    // tabla nutricional oficial de productos de marca en lugar de estimarla de
    // memoria. Si Google rechaza esa combinacion, se recurre al metodo con
    // esquema JSON, que es el que ya se sabe estable.
    for (const conBusqueda of [true, false]) {
      if (conBusqueda && busquedaDescartada) continue;

      for (const modelo of MODELOS_EN_ORDEN) {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
          {
            method: "POST",
            headers: {
              "x-goog-api-key": GEMINI_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(construirCuerpo(partes, conBusqueda)),
          }
        );

        data = await response.json();

        if (response.ok) {
          modeloUsado = modelo;
          busquedaUsada = conBusqueda;
          break;
        }

        const estado = data?.error?.status;

        // La busqueda web no convive con todas las configuraciones ni con todos
        // los modelos. Si Google la rechaza de plano, insistir con los demas
        // modelos solo agrega demora: se pasa directo al metodo con esquema.
        if (conBusqueda && estado === "INVALID_ARGUMENT") {
          console.log("Busqueda web no admitida, usando esquema JSON.");
          busquedaDescartada = true;
          break;
        }

        // UNAVAILABLE = el modelo esta saturado ahora mismo.
        // NOT_FOUND = ese modelo ya fue descontinuado por Google.
        // En ambos casos el siguiente modelo de la lista puede funcionar.
        if (estado !== "UNAVAILABLE" && estado !== "NOT_FOUND") break;

        console.log(`Modelo ${modelo} no disponible (${estado}), probando siguiente...`);
      }

      if (response.ok) break;
    }

    if (!response.ok) {
      console.log("ERROR GEMINI API:", JSON.stringify(data));
      return res.status(response.status).json({
        error: "Error de API externa",
        details: data,
      });
    }

    let crudo = extraerJson(data);

    // Con la busqueda activa no hay esquema que garantice el formato, asi que
    // el modelo puede contestar en prosa. Si pasa, se repite la consulta en modo
    // esquema, que si obliga al JSON, en vez de darle un error al usuario.
    if (!crudo && busquedaUsada) {
      console.log("Sin JSON valido usando busqueda; repitiendo con esquema.");

      const respaldo = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modeloUsado}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": GEMINI_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(construirCuerpo(partes, false)),
        }
      );

      if (respaldo.ok) {
        crudo = extraerJson(await respaldo.json());
        busquedaUsada = false;
      }
    }

    if (!crudo) {
      const finishReason = data?.candidates?.[0]?.finishReason;
      console.log("ERROR ANALYZE FOOD: respuesta no interpretable", JSON.stringify(data));

      return res.status(500).json({
        error: "Gemini no devolvió un resultado interpretable",
        finishReason: finishReason || null,
      });
    }

    // modelo y fuente son informativos: permiten comprobar desde fuera si la
    // busqueda web se llego a usar. La aplicacion los ignora sin problema.
    return res.json({
      ...normalizarResultado(crudo),
      modelo: modeloUsado,
      fuente: busquedaUsada ? "busqueda_web" : "modelo",
    });
  } catch (error) {
    console.log("ERROR ANALYZE FOOD:", error);

    res.status(500).json({
      error: "Error al analizar comida",
      details: error.message,
    });
  }
});

// -----------------------------
// Endpoints de comidas (Meal)
// -----------------------------

function fechaHoyString() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

app.post("/meals", async (req, res) => {
  try {
    console.log("MEAL POST:", req.body);

    const {
      userId,
      foodName,
      category,
      portion,
      estimatedCalories,
      calorieRange,
      protein,
      carbs,
      fats,
      confidence,
      observation,
      date,
    } = req.body;

    if (!userId || !foodName) {
      return res.status(400).json({
        error: "Faltan datos obligatorios (userId, foodName)",
      });
    }

    const meal = new Meal({
      userId,
      foodName,
      category: category || "",
      portion: portion || "",
      estimatedCalories: Number(estimatedCalories) || 0,
      calorieRange: calorieRange || "",
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fats: Number(fats) || 0,
      confidence: confidence || "",
      observation: observation || "",
      date: date || fechaHoyString(),
    });

    await meal.save();

    res.json({
      message: "Comida guardada correctamente",
      meal,
    });
  } catch (error) {
    console.log("ERROR MEAL POST:", error);

    res.status(500).json({
      error: "Error al guardar la comida",
    });
  }
});

// GET /meals/:userId            -> todas las comidas del usuario
// GET /meals/:userId?date=YYYY-MM-DD -> solo las de ese día (para el total diario)
app.get("/meals/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;

    console.log("GET MEALS USER:", userId, "date:", date || "(todas)");

    const filtro = date ? { userId, date } : { userId };

    const meals = await Meal.find(filtro).sort({ createdAt: -1 });

    res.json(meals);
  } catch (error) {
    console.log("ERROR MEAL GET:", error);

    res.status(500).json({
      error: "Error al obtener las comidas",
    });
  }
});

// GET /meals/:userId/summary?date=YYYY-MM-DD -> totales del día (calorías + macros)
app.get("/meals/:userId/summary", async (req, res) => {
  try {
    const { userId } = req.params;
    const date = req.query.date || fechaHoyString();

    const meals = await Meal.find({ userId, date });

    const resumen = meals.reduce(
      (acc, meal) => {
        acc.totalCalories += meal.estimatedCalories || 0;
        acc.totalProtein += meal.protein || 0;
        acc.totalCarbs += meal.carbs || 0;
        acc.totalFats += meal.fats || 0;
        return acc;
      },
      { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 }
    );

    res.json({
      date,
      cantidadComidas: meals.length,
      ...resumen,
    });
  } catch (error) {
    console.log("ERROR MEAL SUMMARY:", error);

    res.status(500).json({
      error: "Error al calcular el resumen del día",
    });
  }
});

app.delete("/meals/:id", async (req, res) => {
  try {
    const { id } = req.params;

    console.log("DELETE MEAL ID:", id);

    const mealEliminada = await Meal.findByIdAndDelete(id);

    if (!mealEliminada) {
      return res.status(404).json({
        message: "Comida no encontrada",
      });
    }

    res.json({
      message: "Comida eliminada correctamente",
    });
  } catch (error) {
    console.log("ERROR MEAL DELETE:", error);

    res.status(500).json({
      message: "Error al eliminar comida",
      error: error.message,
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
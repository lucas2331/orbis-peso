import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3333;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const WEIGHTS_FILE = path.join(DATA_DIR, "pesos.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const FRONTEND_DIST = path.join(__dirname, "../frontend/dist");

app.use(cors());
app.use(express.json());

async function ensureJsonFile(filePath, defaultValue) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2), "utf-8");
  }
}

async function readJson(filePath, defaultValue) {
  await ensureJsonFile(filePath, defaultValue);

  const content = await fs.readFile(filePath, "utf-8");

  if (!content.trim()) {
    return defaultValue;
  }

  return JSON.parse(content);
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

async function readWeights() {
  return readJson(WEIGHTS_FILE, []);
}

async function writeWeights(weights) {
  const sorted = [...weights].sort((a, b) => new Date(a.date) - new Date(b.date));
  await writeJson(WEIGHTS_FILE, sorted);
}

async function readConfig() {
  return readJson(CONFIG_FILE, { goal: 160 });
}

async function writeConfig(config) {
  await writeJson(CONFIG_FILE, config);
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "orbis-weight",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/pesos", async (req, res) => {
  try {
    const weights = await readWeights();
    res.json(weights);
  } catch {
    res.status(500).json({
      message: "Erro ao ler os pesos."
    });
  }
});

app.post("/api/pesos", async (req, res) => {
  try {
    const { date, weight } = req.body;

    if (!date || weight === undefined || weight === null) {
      return res.status(400).json({
        message: "Data e peso são obrigatórios."
      });
    }

    const parsedWeight = Number(weight);

    if (Number.isNaN(parsedWeight) || parsedWeight <= 0) {
      return res.status(400).json({
        message: "Peso inválido."
      });
    }

    const weights = await readWeights();

    const updated = [
      ...weights.filter((item) => item.date !== date),
      {
        date,
        weight: parsedWeight
      }
    ];

    await writeWeights(updated);

    res.status(201).json(updated);
  } catch {
    res.status(500).json({
      message: "Erro ao salvar o peso."
    });
  }
});

app.delete("/api/pesos/:date", async (req, res) => {
  try {
    const { date } = req.params;

    const weights = await readWeights();
    const updated = weights.filter((item) => item.date !== date);

    await writeWeights(updated);

    res.json(updated);
  } catch {
    res.status(500).json({
      message: "Erro ao remover o peso."
    });
  }
});

app.get("/api/config", async (req, res) => {
  try {
    const config = await readConfig();
    res.json(config);
  } catch {
    res.status(500).json({
      message: "Erro ao ler as configurações."
    });
  }
});

app.put("/api/config", async (req, res) => {
  try {
    const { goal } = req.body;
    const parsedGoal = Number(goal);

    if (Number.isNaN(parsedGoal) || parsedGoal <= 0) {
      return res.status(400).json({
        message: "Meta inválida."
      });
    }

    const config = await readConfig();

    const updated = {
      ...config,
      goal: parsedGoal
    };

    await writeConfig(updated);

    res.json(updated);
  } catch {
    res.status(500).json({
      message: "Erro ao salvar as configurações."
    });
  }
});

app.use(express.static(FRONTEND_DIST));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
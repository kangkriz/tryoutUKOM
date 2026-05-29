import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up server-side Gemini client
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Support JSON payloads
app.use(express.json({ limit: '10mb' }));

// Health Check API
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mode: process.env.NODE_ENV || "development" });
});

// Gemini-powered Question Parser API
app.post("/api/parse-questions", async (req, res) => {
  const { textContent, originalFileName } = req.body;
  if (!textContent) {
     return res.status(400).json({ error: "Missing textContent parameter" });
  }

  if (!ai) {
    return res.status(503).json({ 
      error: "Gemini API is not configured on the server. Please check GEMINI_API_KEY in Secrets." 
    });
  }

  try {
    const prompt = `Review the following text which contains exam questions (mutiple-choice with 5 options A-E, correct answer, and explanation) for Nursing (D3 Keperawatan).
Extract all valid questions and output them as a JSON list matching the requested structure.
Text to parse:
"""
${textContent}
"""`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an expert Indonesian Nurse Educator. Your task is to accurately extract multiple-choice nursing questions from raw text files, Word docx content, or PDF texts. Standardize categories to match classic D3 Keperawatan fields (e.g., Keperawatan Medikal Bedah (KMB), Keperawatan Anak, Keperawatan Jiwa, Keperawatan Maternitas, Keperawatan Keluarga, Keperawatan Gerontik, Keperawatan Gawat Darurat & Kritis, atau Manajemen Keperawatan). Return a clean JSON array representing the questions. Ensure optionA, optionB, etc. contain the options without 'A. ', 'B. ' prefixes.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { 
                type: Type.STRING, 
                description: "The nursing category of the question (e.g., 'Keperawatan Medikal Bedah (KMB)', 'Keperawatan Anak', etc.)" 
              },
              question: { 
                type: Type.STRING, 
                description: "The complete case narrative (vignette) and the question asked" 
              },
              optionA: { type: Type.STRING, description: "Text content for option A" },
              optionB: { type: Type.STRING, description: "Text content for option B" },
              optionC: { type: Type.STRING, description: "Text content for option C" },
              optionD: { type: Type.STRING, description: "Text content for option D" },
              optionE: { type: Type.STRING, description: "Text content for option E" },
              correctAnswer: { 
                type: Type.STRING,
                description: "Single-character code representing the correct choice: A, B, C, D, or E" 
              },
              explanation: { 
                type: Type.STRING, 
                description: "Detailed Indonesian nursing rationale why this option is correct" 
              }
            },
            required: ["category", "question", "optionA", "optionB", "optionC", "optionD", "optionE", "correctAnswer", "explanation"]
          }
        }
      }
    });

    const bodyText = response.text ? response.text.trim() : "[]";
    const questions = JSON.parse(bodyText);
    
    // Add unique IDs and timestamps to parsed items
    const processedQuestions = questions.map((q: any, i: number) => ({
      ...q,
      id: `parsed-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString()
    }));

    res.json({ success: true, questions: processedQuestions });
  } catch (err: any) {
    console.error("Gemini Question Parsing Failed:", err);
    res.status(500).json({ error: "Failed to parse questions using AI", details: err?.message || err });
  }
});

// Start routing with Vite middleware or build static asset files serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server loaded and active on http://0.0.0.0:${PORT}`);
  });
}

startServer();

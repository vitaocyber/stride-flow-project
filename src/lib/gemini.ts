import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenAI({ apiKey });

export async function generateTrainingPlan(goal: string, currentLevel: string, daysPerWeek: number) {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Crie um plano de treinamento de corrida de 4 semanas para um corredor que deseja: ${goal}. 
  Nível atual: ${currentLevel}. 
  Disponibilidade: ${daysPerWeek} dias por semana.
  Retorne APENAS um JSON seguindo este formato:
  {
    "name": "Nome do Plano",
    "goal": "Objetivo",
    "workouts": [
      { "id": "uuid", "date": "YYYY-MM-DD", "type": "Easy|Interval|Long|Tempo|Recovery", "distance": number, "duration": number, "intensity": number, "notes": "descrição curta" }
    ]
  }
  Gere IDs únicos para cada treino.
  Considere a data de início como hoje.`;

  try {
    const response = await genAI.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Erro ao gerar plano:", error);
    return null;
  }
}

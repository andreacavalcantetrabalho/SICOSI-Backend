const Groq = require("groq-sdk");
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { prompt, productInfo, context } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "prompt é obrigatório" });
    }

    console.log("📦 Analisando produto:", productInfo?.description || "N/A");
    console.log("🏷️ Tipo:", productInfo?.type || "N/A");

    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            context?.role ||
            "Você é um especialista em sustentabilidade e compras públicas.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0,
      max_tokens: 2000,
    });

    const aiResponse = completion.choices[0].message.content;

    // Tentar parsear JSON
    let parsedResponse;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = JSON.parse(aiResponse);
      }
    } catch (parseError) {
      console.error("❌ Erro ao parsear JSON:", parseError);
      return res.status(500).json({
        error: "Erro ao processar resposta da IA",
        rawResponse: aiResponse,
      });
    }

    console.log("✅ Resposta processada com sucesso");

    return res.status(200).json(parsedResponse);
  } catch (error) {
    console.error("❌ Erro no groq-proxy:", error);
    return res.status(500).json({
      error: "Erro interno do servidor",
      message: error.message,
    });
  }
};

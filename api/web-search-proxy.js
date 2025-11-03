const Groq = require("groq-sdk");
const TavilyClient = require("../lib/tavily-client");
const ResponseNormalizer = require("../lib/response-normalizer");

module.exports = async (req, res) => {
  // CORS Headers
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

    // Validação
    if (!prompt || !productInfo) {
      return res.status(400).json({
        error: "prompt e productInfo são obrigatórios",
      });
    }

    const productType = productInfo.type || "produto";
    const certifications = context?.certifications || ["EPEAT", "Energy Star", "FSC"];

    console.log("📦 Produto:", productInfo.description);
    console.log("🏷️ Tipo:", productType);

    // 1. BUSCAR COM TAVILY (profissional)
    console.log("🔑 TAVILY_API_KEY existe?", !!process.env.TAVILY_API_KEY);
    console.log("🔑 Primeiros 10 chars:", process.env.TAVILY_API_KEY?.substring(0, 10));

    const tavilyClient = new TavilyClient(process.env.TAVILY_API_KEY);

    console.log("🌐 Buscando com Tavily:", productType, certifications);
    const tavilyResults = await tavilyClient.searchSustainableProducts(
      productType,
      certifications
    );

    console.log("📊 Tavily retornou:");
    console.log("  - results.length:", tavilyResults.results?.length || 0);
    console.log("  - query:", tavilyResults.query);
    console.log("  - error:", tavilyResults.error || "nenhum");
    console.log("  - primeiros 2 resultados:", JSON.stringify(tavilyResults.results?.slice(0, 2), null, 2));

    // 2. FORMATAR CONTEXTO WEB
    const webContext = tavilyResults.results.length > 0
      ? tavilyResults.results
          .map((result, i) => 
            `[${i + 1}] ${result.title}\n${result.content}\nURL: ${result.url}`
          )
          .join("\n\n")
      : "Nenhum resultado encontrado na web. Use seu conhecimento geral sobre produtos sustentáveis certificados.";

    console.log(`📊 Contexto web: ${tavilyResults.results.length} resultados`);

    // 3. PROMPT ENRIQUECIDO COM CONTEXTO WEB
    const enrichedPrompt = `${prompt}

CONTEXTO DA BUSCA WEB (Tavily):
${webContext}

${tavilyResults.answer ? `RESPOSTA DIRETA: ${tavilyResults.answer}\n` : ""}

INSTRUÇÕES:
- Sugira 2-3 alternativas sustentáveis do tipo "${productType}"
- Use informações dos resultados acima quando disponíveis
- Se não houver resultados, use conhecimento geral sobre certificações ${certifications.join(", ")}
- Sempre mencione certificações específicas e benefícios mensuráveis
- Responda em formato JSON com estrutura: { "alternatives": [...] }`;

    // 4. GROQ PROCESSA (sem gambiarra)
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    console.log("🤖 Enviando para Groq com contexto web...");

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: context?.role 
            ? `${context.role}. Responda sempre em formato JSON.`
            : "Você é um especialista em produtos sustentáveis. Responda sempre em formato JSON.",
        },
        {
          role: "user",
          content: enrichedPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const aiResponse = completion.choices[0].message.content;

    // 5. PARSEAR E NORMALIZAR
    let aiJSON;
    try {
      aiJSON = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error("❌ Erro ao parsear JSON:", parseError);
      return res.status(500).json({
        error: "Erro ao processar resposta da IA",
        rawResponse: aiResponse,
      });
    }

    console.log("📄 JSON recebido da IA");

    // 6. NORMALIZAR RESPOSTA
    const normalizedResponse = ResponseNormalizer.normalize(aiJSON, productType);

    // 7. ADICIONAR METADADOS
    normalizedResponse._meta = {
      webResultsCount: tavilyResults.results.length,
      searchQuery: tavilyResults.query,
      tavilyAnswer: tavilyResults.answer || null,
      source: "groq-tavily",
      model: "llama-3.3-70b-versatile",
      responseTime: tavilyResults.responseTime || 0,
    };

    console.log("✅ Resposta processada com sucesso");

    return res.status(200).json(normalizedResponse);
    
  } catch (error) {
    console.error("❌ Erro no web-search-proxy:", error);
    return res.status(500).json({
      error: "Erro interno do servidor",
      message: error.message,
    });
  }
};
// SICOSI-Backend/api/web-search-proxy.js

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
    const productDescription = productInfo.description || "";
    const productUrl = productInfo.url || "";
    const certifications = context?.certifications || ["EPEAT", "Energy Star", "FSC"];

    console.log("📦 Produto:", productDescription);
    console.log("🏷️ Tipo:", productType);
    console.log("🔗 URL:", productUrl);

    // ✅ Extrair contexto da URL
    let urlContext = "";
    if (productUrl) {
      try {
        const urlObj = new URL(productUrl);
        const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
        urlContext = `Contexto da URL: ${pathSegments.join(' > ')}`;
        console.log("🔍 Contexto URL:", urlContext);
      } catch (e) {
        console.warn("⚠️ Erro ao parsear URL:", e.message);
      }
    }

    // ✅ NOVO: Extrair marca da URL para stoplist genérica
    let brandStoplist = [];
    if (productUrl) {
      try {
        const urlObj = new URL(productUrl);
        const segs = urlObj.pathname.split('/').filter(Boolean);
        const idx = segs.findIndex(s => ['marca', 'brand'].includes(s.toLowerCase()));
        if (idx >= 0 && segs[idx + 1]) {
          brandStoplist.push(segs[idx + 1]);
          console.log("🏷️ Marca detectada:", segs[idx + 1]);
        } else {
          // fallback: último segmento pode ser slug de marca/página
          if (segs.length) {
            brandStoplist.push(segs[segs.length - 1]);
            console.log("🏷️ Possível marca (fallback):", segs[segs.length - 1]);
          }
        }
      } catch (e) {
        // silencia parse errors
      }
    }

    // Busca inteligente
    const searchQuery = `${productDescription} ${productType} certificação sustentável`;
    console.log("🔍 Query de busca:", searchQuery);

    const tavilyClient = new TavilyClient(process.env.TAVILY_API_KEY);
    const tavilyResults = await tavilyClient.searchSustainableProducts(
      productType,
      certifications
    );

    console.log("📊 Tavily retornou:", tavilyResults.results?.length || 0, "resultados");

    // Formatar contexto web
    const webContext = tavilyResults.results.length > 0
      ? tavilyResults.results
          .map((result, i) => 
            `[${i + 1}] ${result.title}\n${result.content}\nURL: ${result.url}`
          )
          .join("\n\n")
      : "Nenhum resultado encontrado na web. Use seu conhecimento geral sobre produtos sustentáveis certificados.";

    console.log(`📊 Contexto web: ${tavilyResults.results.length} resultados`);

    // Prompt melhorado
    const enrichedPrompt = `${prompt}

INFORMAÇÕES ADICIONAIS DO CONTEXTO:
${urlContext}
URL completa: ${productUrl}

CONTEXTO DA BUSCA WEB (Tavily):
${webContext}

${tavilyResults.answer ? `RESPOSTA DIRETA: ${tavilyResults.answer}\n` : ""}

⚠️ INSTRUÇÕES CRÍTICAS DE VALIDAÇÃO:

1. ANÁLISE DO PRODUTO:
   - O produto "${productDescription}" do tipo "${productType}" pode ter significados diferentes
   - Use o contexto da URL e da busca web para determinar a categoria CORRETA
   - Exemplos de ambiguidade:
     * "Comfort" pode ser: amaciante de roupas OU ar-condicionado
     * "Apple" pode ser: fruta OU empresa de tecnologia
     * "Jaguar" pode ser: animal OU carro
   
2. VALIDAÇÃO OBRIGATÓRIA:
   - As alternativas DEVEM ser da MESMA categoria que o produto original
   - Se o produto é amaciante, sugira APENAS amaciantes
   - Se o produto é ar-condicionado, sugira APENAS ar-condicionados
   - NUNCA misture categorias diferentes

3. COMO DETERMINAR A CATEGORIA CORRETA:
   - Leia o contexto da URL (caminho do site)
   - Analise os resultados da busca web
   - Se ainda houver dúvida, sugira alternativas genéricas sustentáveis do tipo "${productType}"

4. RESPOSTA FINAL:
   - Sugira 2-3 alternativas sustentáveis do tipo "${productType}"
   - Use informações dos resultados acima quando disponíveis
   - Se não houver resultados, use conhecimento geral sobre certificações ${certifications.join(", ")}
   - Sempre mencione certificações específicas e benefícios mensuráveis
   - Responda em formato JSON com estrutura: { "alternatives": [...] }`;

    // Groq processa
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    console.log("🤖 Enviando para Groq com contexto enriquecido...");

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: context?.role 
            ? `${context.role}. Você é extremamente cuidadoso para não confundir categorias de produtos. Sempre valide o contexto antes de sugerir alternativas. Responda sempre em formato JSON.`
            : "Você é um especialista em produtos sustentáveis. Sempre valide a categoria correta do produto usando o contexto fornecido. Responda sempre em formato JSON.",
        },
        {
          role: "user",
          content: enrichedPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const aiResponse = completion.choices[0].message.content;

    // Parsear JSON
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

    // ✅ NOVO: Passar brandStoplist e urlContext para o normalizer
    const normalizedResponse = ResponseNormalizer.normalize(aiJSON, productType, {
      certifications,
      urlContext,
      brandStoplist,
    });

    // Adicionar metadados
    normalizedResponse._meta = {
      webResultsCount: tavilyResults.results.length,
      searchQuery: tavilyResults.query,
      tavilyAnswer: tavilyResults.answer || null,
      source: "groq-tavily",
      model: "llama-3.3-70b-versatile",
      responseTime: tavilyResults.responseTime || 0,
      urlContext: urlContext || null,
      brandStoplist: brandStoplist || null, // ✅ NOVO: útil para debug
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
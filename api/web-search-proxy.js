/**
 * Web Search Proxy - Generic Product Alternative Search
 * Integrates Tavily (web search) + Groq (LLM) for sustainable alternatives
 * 
 * @module web-search-proxy
 */

const express = require('express');
const router = express.Router();
const tavilyClient = require('../lib/tavily-client');
const { normalizeResponse } = require('../lib/response-normalizer');
const logger = require('../utils/logger');

// Groq API configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-70b-versatile';

/**
 * POST /api/web-search
 * Searches for sustainable alternatives using Tavily + Groq
 */
router.post('/', async (req, res) => {
  try {
    const { 
      productName, 
      productDescription, 
      detectedType, 
      brandStoplist,
      categoryContext // ← NOVO: contexto do alternatives.json
    } = req.body;

    logger.info('[WebSearchProxy] Received request', {
      productName,
      detectedType,
      hasCategoryContext: !!categoryContext,
      hasBrandStoplist: !!brandStoplist
    });

    // Validate input
    if (!productName || typeof productName !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'productName is required and must be a string'
      });
    }

    // Step 1: Detect product type and extract brand
    const productAnalysis = await analyzeProduct(
      productName, 
      productDescription,
      detectedType // ← Usa tipo detectado pelo frontend se disponível
    );
    
    logger.info('[WebSearchProxy] Product analysis complete', productAnalysis);

    // Step 2: Search web for sustainable alternatives
    const webResults = await searchWebForAlternatives(
      productName,
      productAnalysis.type,
      productAnalysis.brand
    );

    logger.info('[WebSearchProxy] Web search complete', {
      resultsCount: webResults.length
    });

    // Step 3: Process with LLM to extract structured alternatives
    const aiResponse = await processWithLLM(
      productName,
      productAnalysis,
      webResults,
      categoryContext // ← NOVO: passa contexto do alternatives.json
    );

    logger.info('[WebSearchProxy] LLM processing complete');

    // Step 4: Normalize and validate response
    const normalizedResponse = normalizeResponse(aiResponse, {
      productName,
      detectedType: productAnalysis.type,
      brandStoplist: brandStoplist || [],
      categoryContext // ← NOVO: passa para validação
    });

    logger.info('[WebSearchProxy] Response normalized', {
      success: normalizedResponse.success,
      alternativesCount: normalizedResponse.alternatives.length
    });

    return res.json(normalizedResponse);

  } catch (error) {
    logger.error('[WebSearchProxy] Error processing request', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Analyzes product to detect type and extract brand
 */
async function analyzeProduct(productName, productDescription, detectedType) {
  const fullText = `${productName} ${productDescription || ''}`.toLowerCase();

  // Usa tipo detectado pelo frontend se disponível
  const type = detectedType || detectProductType(fullText);

  // Extract brand name
  const brand = extractBrand(productName);

  return { type, brand };
}

/**
 * Detects product type using regex patterns
 * Extensible - add new patterns as needed
 */
function detectProductType(text) {
  const patterns = {
    // Office supplies
    'papel': /\b(papel|sulfite|a4|oficio|resma)\b/i,
    'caneta': /\b(caneta|lapis|marca[dt]or|canetinha)\b/i,
    
    // Technology
    'notebook': /\b(notebook|laptop|ultrabook)\b/i,
    'monitor': /\b(monitor|display|tela)\b/i,
    'impressora': /\b(impressora|multifuncional|scanner)\b/i,
    'mouse': /\b(mouse|rato)\b/i,
    'teclado': /\b(teclado|keyboard)\b/i,
    
    // Footwear & Apparel
    'tenis': /\b(tenis|tênis|sneaker|calçado\s+esportivo)\b/i,
    'sapato': /\b(sapato|bota|sandalia|chinelo)\b/i,
    'roupa': /\b(camiseta|camisa|calça|blusa|vestido|uniforme)\b/i,
    
    // Appliances
    'ar_condicionado': /\b(ar\s+condicionado|climatizador)\b/i,
    'geladeira': /\b(geladeira|refrigerador|freezer)\b/i,
    
    // Furniture
    'cadeira': /\b(cadeira|poltrona|assento)\b/i,
    'mesa': /\b(mesa|escrivaninha|bancada)\b/i,
    'armario': /\b(armario|estante|prateleira)\b/i,
    
    // Cleaning
    'detergente': /\b(detergente|sabao|limpeza|desinfetante)\b/i,
    
    // Disposables
    'copo': /\b(copo|copinho|descartavel)\b/i,
    
    // Lighting
    'lampada': /\b(lampada|iluminacao|led|fluorescente)\b/i,
    
    // Gifts
    'brinde': /\b(brinde|mimo|presente\s+corporativo)\b/i,
    
    // Packaging
    'embalagem': /\b(embalagem|caixa|envelope|saco)\b/i
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      return type;
    }
  }

  return 'generic';
}

/**
 * Extracts brand name from product name
 * Assumes brand is typically the first word(s)
 */
function extractBrand(productName) {
  // Remove common prefixes
  let cleaned = productName
    .replace(/^(kit|conjunto|pacote|caixa)\s+/i, '')
    .trim();

  // Extract first 1-2 words as potential brand
  const words = cleaned.split(/\s+/);
  
  if (words.length === 0) return null;
  
  // If first word is very short, include second word
  if (words[0].length <= 3 && words.length > 1) {
    return `${words[0]} ${words[1]}`;
  }
  
  return words[0];
}

/**
 * Searches web for sustainable alternatives using Tavily
 */
async function searchWebForAlternatives(productName, productType, brand) {
  try {
    // Build search query
    const searchQuery = buildSearchQuery(productName, productType, brand);

    logger.info('[WebSearchProxy] Searching web', { searchQuery });

    // Search with Tavily
    const results = await tavilyClient.search(searchQuery, {
      max_results: 5,
      search_depth: 'advanced',
      include_domains: [
        'ecycle.com.br',
        'akatu.org.br',
        'idec.org.br',
        'greenpeace.org',
        'wwf.org.br'
      ]
    });

    return results;

  } catch (error) {
    logger.error('[WebSearchProxy] Web search error', {
      error: error.message
    });
    return [];
  }
}

/**
 * Builds optimized search query for sustainable alternatives
 */
function buildSearchQuery(productName, productType, brand) {
  const sustainableKeywords = [
    'sustentável',
    'ecológico',
    'certificado',
    'reciclado',
    'orgânico'
  ];

  // Base query: product type + sustainable keywords
  let query = `${productType} ${sustainableKeywords.join(' OR ')}`;

  // Exclude original brand if detected
  if (brand) {
    query += ` -${brand}`;
  }

  return query;
}

/**
 * Processes web results with Groq LLM to extract structured alternatives
 */
async function processWithLLM(productName, productAnalysis, webResults, categoryContext) {
  try {
    const prompt = buildLLMPrompt(
      productName, 
      productAnalysis, 
      webResults,
      categoryContext // ← NOVO: adiciona contexto do alternatives.json
    );

    logger.debug('[WebSearchProxy] Calling Groq API', {
      model: GROQ_MODEL,
      promptLength: prompt.length,
      hasCategoryContext: !!categoryContext
    });

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a sustainability expert specializing in identifying eco-friendly product alternatives. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    logger.debug('[WebSearchProxy] Groq response received', {
      contentLength: content.length
    });

    return JSON.parse(content);

  } catch (error) {
    logger.error('[WebSearchProxy] LLM processing error', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Builds prompt for LLM with context from web results AND alternatives.json
 */
function buildLLMPrompt(productName, productAnalysis, webResults, categoryContext) {
  const webContext = webResults
    .map((result, index) => `[${index + 1}] ${result.title}\n${result.content}`)
    .join('\n\n');

  // ✅ NOVO: Adiciona exemplos do alternatives.json se disponível
  let categoryExamples = '';
  if (categoryContext && categoryContext.examples) {
    categoryExamples = `\n\nEXEMPLOS DE ALTERNATIVAS SUSTENTÁVEIS PARA ESTA CATEGORIA:\n${JSON.stringify(categoryContext.examples, null, 2)}\n`;
  }

  return `
Analyze this product and suggest 3-5 sustainable alternatives:

ORIGINAL PRODUCT:
Name: ${productName}
Type: ${productAnalysis.type}
Brand: ${productAnalysis.brand || 'Unknown'}

WEB SEARCH RESULTS:
${webContext || 'No web results available'}
${categoryExamples}

INSTRUCTIONS:
1. Suggest 3-5 DIFFERENT sustainable alternatives (not the same brand/product)
2. Each alternative must have:
   - name: Clear product name
   - benefits: Array of 3-5 sustainability benefits
   - certifications: Array of relevant certifications (FSC, EPEAT, GOTS, etc)
   - searchTerms: Array of 2-3 search terms to find this product

3. Focus on:
   - Certified products (FSC, EPEAT Gold, Energy Star, GOTS, Fair Trade, etc)
   - Recycled or organic materials
   - Energy efficiency
   - Reduced environmental impact

4. Return ONLY valid JSON in this format:
{
  "alternatives": [
    {
      "name": "Product Name",
      "benefits": ["benefit 1", "benefit 2", "benefit 3"],
      "certifications": ["FSC", "EPEAT Gold"],
      "searchTerms": ["search term 1", "search term 2"]
    }
  ]
}

RESPOND WITH JSON ONLY:
`.trim();
}

module.exports = router;
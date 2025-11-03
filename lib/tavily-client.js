class TavilyClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = null;
  }

  async initialize() {
    if (!this.client) {
      const { TavilyClient: TavilyAPIClient } = await import("tavily");
      this.client = new TavilyAPIClient({ apiKey: this.apiKey });
    }
    return this.client;
  }

  async search(query, options = {}) {
    try {
      await this.initialize();
      console.log("🔍 Tavily Search:", query);

      const response = await this.client.search(query, {
        searchDepth: options.depth || "basic",
        maxResults: options.maxResults || 5,
        includeAnswer: options.includeAnswer !== false,
        includeRawContent: options.includeRawContent || false,
        includeDomains: options.includeDomains || [],
        excludeDomains: options.excludeDomains || [],
      });

      // Tavily retorna array direto, não objeto com .results
      const results = Array.isArray(response) ? response : [];
      
      console.log(`✅ Tavily retornou ${results.length} resultados`);

      return {
        results: results,
        answer: null, // Tavily não retorna answer nesse formato
        query: query,
        responseTime: 0,
      };
    } catch (error) {
      console.error("❌ Erro no Tavily:", error.message);
      return {
        results: [],
        answer: null,
        query: query,
        error: error.message,
      };
    }
  }

  async searchSustainableProducts(productType, certifications = []) {
    const certsQuery = certifications.length > 0 
      ? certifications.join(" OR ") 
      : "EPEAT OR Energy Star OR FSC";

    const query = `${productType} sustainable certified ${certsQuery}`;

    return await this.search(query, {
      depth: "basic",
      maxResults: 5,
      includeAnswer: false,
    });
  }
}

module.exports = TavilyClient;
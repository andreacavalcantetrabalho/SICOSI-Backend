const { TavilySearchAPIClient } = require("tavily");
class TavilyClient {
  constructor(apiKey) {
    this.client = new TavilySearchAPIClient({ apiKey });
  }

  async search(query, options = {}) {
    try {
      console.log("🔍 Tavily Search:", query);

      const response = await this.client.search(query, {
        search_depth: options.depth || "basic",
        max_results: options.maxResults || 5,
        include_answer: options.includeAnswer !== false,
        include_raw_content: options.includeRawContent || false,
        include_domains: options.includeDomains || [],
        exclude_domains: options.excludeDomains || [],
      });

      console.log(`✅ Tavily retornou ${response.results.length} resultados`);

      return {
        results: response.results || [],
        answer: response.answer || null,
        query: response.query || query,
        responseTime: response.response_time || 0,
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
      includeAnswer: true,
    });
  }
}

module.exports = TavilyClient;
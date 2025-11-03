/**
 * Normaliza respostas da IA para o formato esperado pela extensão
 */
class ResponseNormalizer {
  /**
   * Normaliza JSON da IA para formato padrão
   * @param {object} aiJSON - JSON retornado pela IA
   * @param {string} productType - Tipo de produto
   * @returns {object} Resposta normalizada
   */
  static normalize(aiJSON, productType) {
    // Se já estiver no formato correto
    if (aiJSON.alternatives && Array.isArray(aiJSON.alternatives)) {
      return aiJSON;
    }

    const alternatives = [];
    let products = this.extractProducts(aiJSON);

    // Transformar para o formato esperado
    for (const product of products) {
      const normalized = this.normalizeProduct(product, productType);
      if (normalized) {
        alternatives.push(normalized);
      }
    }

    // Fallback se não houver alternativas
    if (alternatives.length === 0) {
      alternatives.push(...this.getFallbackAlternatives(productType));
    }

    return {
      isSustainable: false,
      reason: aiJSON.reason || aiJSON.razao || 
              `${productType} convencional - considere alternativas certificadas`,
      alternatives: alternatives.slice(0, 3),
    };
  }

  /**
   * Extrai produtos de diferentes formatos de JSON
   */
  static extractProducts(aiJSON) {
    if (aiJSON.notebooks) return aiJSON.notebooks;
    if (aiJSON.produtos) return aiJSON.produtos;
    if (aiJSON.alternatives) return aiJSON.alternatives;
    if (aiJSON.products) return aiJSON.products;
    if (Array.isArray(aiJSON)) return aiJSON;
    return [];
  }

  /**
   * Normaliza um produto individual
   */
  static normalizeProduct(product, productType) {
    const name = product.nome || product.name || product.produto || 
                 `${productType} sustentável`;
    
    const benefits = this.extractBenefits(product);

    return {
      name: name,
      benefits: benefits.slice(0, 4),
      searchTerms: [name.toLowerCase(), `${productType} sustentável`],
    };
  }

  /**
   * Extrai benefícios de diferentes formatos
   */
  static extractBenefits(product) {
    const benefits = [];
    
    if (product.beneficios) {
      benefits.push(...product.beneficios);
    } else if (product.benefits) {
      benefits.push(...product.benefits);
    } else if (product.caracteristicas) {
      const carac = product.caracteristicas;
      if (carac.certificacao) benefits.push(`Certificação ${carac.certificacao}`);
      if (carac.economia) benefits.push(carac.economia);
      if (carac.reciclavel) benefits.push(`${carac.reciclavel} materiais recicláveis`);
    }

    if (benefits.length === 0) {
      benefits.push("Produto com características sustentáveis");
      benefits.push("Certificação ambiental");
      benefits.push("Redução de impacto ambiental");
    }

    return benefits;
  }

  /**
   * Retorna alternativas de fallback por tipo de produto
   */
  static getFallbackAlternatives(productType) {
    return [
      {
        name: `${productType} com certificação EPEAT Gold`,
        benefits: [
          "Certificação EPEAT Gold verificada",
          "Reduz consumo de energia em até 30%",
          "85% materiais recicláveis",
          "Programa de logística reversa",
        ],
        searchTerms: [`${productType} EPEAT`, `${productType} certificado`],
      },
      {
        name: `${productType} com certificação Energy Star`,
        benefits: [
          "Certificação Energy Star 8.0",
          "Economia de até 40% no consumo energético",
          "Componentes com materiais reciclados",
          "Programa de reciclagem incluso",
        ],
        searchTerms: [`${productType} Energy Star`, `${productType} eficiente`],
      },
      {
        name: `${productType} Refurbished certificado`,
        benefits: [
          "Produto recondicionado com garantia",
          "Reduz até 70% da pegada de carbono",
          "Testado e certificado para uso pleno",
          "Economia significativa de recursos",
        ],
        searchTerms: [`${productType} refurbished`, `${productType} recondicionado`],
      },
    ];
  }
}

module.exports = ResponseNormalizer;
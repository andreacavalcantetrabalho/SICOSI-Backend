/**
 * Normaliza respostas da IA para o formato esperado pela extensão
 * VERSÃO CORRIGIDA: Valida tipo de produto nas alternativas
 */
class ResponseNormalizer {
  /**
   * Normaliza JSON da IA para formato padrão
   * @param {object} aiJSON - JSON retornado pela IA
   * @param {string} productType - Tipo de produto
   * @returns {object} Resposta normalizada
   */
  static normalize(aiJSON, productType) {
    console.log('🔍 Normalizando resposta para tipo:', productType);
    
    const alternatives = [];
    let products = this.extractProducts(aiJSON);
    
    console.log(`📦 Encontrados ${products.length} produtos na resposta`);

    // Transformar e VALIDAR para o formato esperado
    for (const product of products) {
      const normalized = this.normalizeProduct(product, productType);
      
      if (normalized && this.isValidAlternative(normalized, productType)) {
        alternatives.push(normalized);
        console.log(`   ✅ Alternativa aprovada: ${normalized.name}`);
      } else {
        console.log(`   ❌ Alternativa rejeitada: ${normalized?.name || 'sem nome'}`);
      }
    }

    // Fallback se não houver alternativas VÁLIDAS
    if (alternatives.length === 0) {
      console.warn('⚠️ Nenhuma alternativa válida encontrada, usando fallback');
      alternatives.push(...this.getFallbackAlternatives(productType));
    }

    console.log(`✅ Retornando ${alternatives.length} alternativas válidas`);

    return {
      isSustainable: Boolean(aiJSON.isSustainable),
      reason: aiJSON.reason || aiJSON.razao || 
              `${productType} convencional - considere alternativas certificadas`,
      alternatives: alternatives.slice(0, 3),
    };
  }

  /**
   * VALIDA se a alternativa é do tipo correto
   */
  static isValidAlternative(alternative, productType) {
    if (!alternative || !alternative.name) {
      return false;
    }

    const altNameLower = alternative.name.toLowerCase();
    const productTypeLower = productType.toLowerCase();

    // REGRA 1: Nome não pode começar com palavras proibidas
    const forbiddenStarts = ['adicionar', 'comprar', 'botão', 'button', 'sistema', 'plataforma'];
    
    for (const forbidden of forbiddenStarts) {
      if (altNameLower.startsWith(forbidden)) {
        console.log(`      ❌ Rejeitada: começa com "${forbidden}"`);
        return false;
      }
    }

    // REGRA 2: Deve conter o tipo de produto solicitado
    if (!altNameLower.includes(productTypeLower)) {
      console.log(`      ❌ Rejeitada: não contém "${productType}"`);
      return false;
    }

    // REGRA 3: Verificar tipos incompatíveis
    const incompatibleTypes = {
      'poltrona': ['notebook', 'laptop', 'computador', 'impressora', 'monitor'],
      'notebook': ['poltrona', 'sofá', 'cadeira', 'mesa'],
      'papel': ['notebook', 'poltrona', 'computador'],
      'cadeira': ['notebook', 'computador', 'impressora']
    };

    const incompatibleList = incompatibleTypes[productTypeLower] || [];
    
    for (const incompType of incompatibleList) {
      if (altNameLower.includes(incompType)) {
        console.log(`      ❌ Rejeitada: contém tipo incompatível "${incompType}"`);
        return false;
      }
    }

    return true;
  }

  /**
   * Extrai produtos de diferentes formatos de JSON
   */
  static extractProducts(aiJSON) {
    if (aiJSON.alternatives && Array.isArray(aiJSON.alternatives)) {
      return aiJSON.alternatives;
    }
    if (aiJSON.notebooks) return aiJSON.notebooks;
    if (aiJSON.produtos) return aiJSON.produtos;
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
    const searchTerms = this.extractSearchTerms(product, productType, name);

    return {
      name: name,
      benefits: benefits.slice(0, 4),
      searchTerms: searchTerms,
    };
  }

  /**
   * Extrai termos de busca
   */
  static extractSearchTerms(product, productType, name) {
    const terms = [];
    
    if (product.searchTerms && Array.isArray(product.searchTerms)) {
      terms.push(...product.searchTerms);
    }
    
    if (terms.length === 0) {
      // Extrair marca do nome (primeira palavra após o tipo)
      const nameParts = name.split(' ');
      if (nameParts.length > 1) {
        terms.push(`${nameParts[0]} ${nameParts[1]}`);
      }
      terms.push(`${productType} sustentável`);
      terms.push(`${productType} certificado`);
    }
    
    return terms.slice(0, 3);
  }

  /**
   * Extrai benefícios de diferentes formatos
   */
  static extractBenefits(product) {
    const benefits = [];
    
    if (Array.isArray(product.benefits)) {
      benefits.push(...product.benefits);
    } else if (Array.isArray(product.beneficios)) {
      benefits.push(...product.beneficios);
    } else if (product.caracteristicas) {
      const carac = product.caracteristicas;
      if (carac.certificacao) benefits.push(`Certificação ${carac.certificacao}`);
      if (carac.economia) benefits.push(carac.economia);
      if (carac.reciclavel) benefits.push(`${carac.reciclavel} materiais recicláveis`);
    }

    if (benefits.length === 0) {
      benefits.push("Produto com características sustentáveis");
      benefits.push("Certificação ambiental verificada");
      benefits.push("Redução de impacto ambiental");
    }

    return benefits;
  }

  /**
   * Retorna alternativas de fallback por tipo de produto
   */
  static getFallbackAlternatives(productType) {
    const fallbacks = {
      'poltrona': [
        {
          name: `poltrona Herman Miller Aeron certificada Cradle to Cradle`,
          benefits: [
            "Certificação Cradle to Cradle Silver",
            "94% dos materiais recicláveis",
            "Garantia de 12 anos",
            "Ergonomia certificada internacionalmente",
          ],
          searchTerms: [`Herman Miller Aeron`, `poltrona certificada`],
        },
        {
          name: `poltrona Steelcase Leap certificada GREENGUARD`,
          benefits: [
            "Certificação GREENGUARD Gold",
            "Materiais reciclados pós-consumo",
            "Design ergonômico premiado",
            "Programa de reciclagem ao fim da vida útil",
          ],
          searchTerms: [`Steelcase Leap`, `poltrona sustentável`],
        },
      ],
      'notebook': [
        {
          name: `notebook Dell Latitude 5430 certificado EPEAT Gold`,
          benefits: [
            "Certificação EPEAT Gold verificada",
            "Reduz consumo de energia em até 30%",
            "85% materiais recicláveis",
            "Programa de logística reversa Dell",
          ],
          searchTerms: [`Dell Latitude EPEAT`, `notebook certificado`],
        },
        {
          name: `notebook Lenovo ThinkPad L15 certificado Energy Star`,
          benefits: [
            "Certificação Energy Star 8.0",
            "Economia de até 40% no consumo energético",
            "Componentes com materiais reciclados",
            "Programa Lenovo Take Back",
          ],
          searchTerms: [`Lenovo ThinkPad Energy Star`, `notebook eficiente`],
        },
      ],
      'papel': [
        {
          name: `papel Chamex Eco certificado FSC`,
          benefits: [
            "Certificação FSC 100% verificada",
            "Fabricado com fibras de reflorestamento",
            "Processo de branqueamento ECF (livre de cloro elementar)",
            "Embalagem reciclável",
          ],
          searchTerms: [`Chamex Eco FSC`, `papel certificado`],
        },
        {
          name: `papel Report certificado FSC`,
          benefits: [
            "Certificação FSC Mix",
            "75g/m² ideal para impressão",
            "Processo produtivo sustentável",
            "Programa de responsabilidade ambiental Suzano",
          ],
          searchTerms: [`Report FSC`, `papel sustentável`],
        },
      ],
    };

    // Retornar fallback específico ou genérico
    if (fallbacks[productType.toLowerCase()]) {
      return fallbacks[productType.toLowerCase()];
    }

    // Fallback genérico
    return [
      {
        name: `${productType} com certificação ambiental`,
        benefits: [
          "Certificação ambiental verificada",
          "Reduz impacto ambiental",
          "Materiais sustentáveis",
          "Processo produtivo responsável",
        ],
        searchTerms: [`${productType} certificado`, `${productType} sustentável`],
      },
      {
        name: `${productType} com materiais reciclados`,
        benefits: [
          "Alto percentual de materiais reciclados",
          "Eficiência energética",
          "Durabilidade estendida",
          "Programa de reciclagem",
        ],
        searchTerms: [`${productType} reciclado`, `${productType} eco`],
      },
    ];
  }
}

module.exports = ResponseNormalizer;
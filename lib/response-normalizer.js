// SICOSI-Backend/lib/response-normalizer.js

/**
 * Normaliza respostas da IA para o formato esperado pela extensão
 * VERSÃO GENÉRICA: Sem hardcode, validação inteligente por similaridade
 */

const DIACRITICS = /[\u0300-\u036f]/g;

class ResponseNormalizer {
  static normalize(aiJSON, productType, opts = {}) {
    const options = {
      minScore: 50,
      maxAlternatives: 3,
      urlContext: aiJSON?._meta?.urlContext || opts.urlContext || null,
      brandStoplist: opts.brandStoplist || [],
      ...opts,
    };

    const products = this.extractProducts(aiJSON);
    console.log(`📦 Encontrados ${products.length} produtos na resposta`);

    // Pré-processar tipo removendo marca
    const typeText = this.normalizeText(productType);
    const typeTokensRaw = this.tokenize(typeText);
    const brandTokens = this.normalizeArray(options.brandStoplist);
    const typeTokens = typeTokensRaw.filter((t) => !brandTokens.includes(t));
    const typeBigrams = this.charBigrams(typeText);
    const brandBigrams = this.charBigrams(this.joinNormalized(brandTokens));

    const scored = products
      .map((prod) => {
        const alt = this.normalizeProduct(prod, productType);
        const score = this.scoreAlternative(alt, {
          typeTokens,
          typeBigrams,
          urlContext: options.urlContext,
          brandTokens,
          brandBigrams,
        });
        return { alt, score };
      })
      .filter((x) => x.alt && x.alt.name)
      .sort((a, b) => b.score - a.score);

    const accepted = scored
      .filter((x) => x.score >= options.minScore)
      .map((x) => {
        console.log(`   ✅ ${x.alt.name} (score ${x.score})`);
        return x.alt;
      });

    if (accepted.length === 0) {
      console.warn('⚠️ Nenhuma alternativa válida encontrada, usando fallback genérico');
      accepted.push(...this.getGenericFallback(productType));
    }

    console.log(`✅ Retornando ${accepted.length} alternativas válidas`);

    return {
      isSustainable: Boolean(aiJSON.isSustainable),
      reason:
        aiJSON.reason ||
        aiJSON.razao ||
        `${productType} convencional - considere alternativas certificadas`,
      alternatives: accepted.slice(0, options.maxAlternatives),
    };
  }

  static scoreAlternative(alt, ctx) {
    const { typeTokens, typeBigrams, urlContext, brandTokens = [], brandBigrams = [] } = ctx;

    const fields = [
      alt.name,
      alt.description,
      alt.category,
      ...(alt.tags || []),
      ...(alt.searchTerms || []),
      ...(alt.benefits || []),
    ].filter(Boolean);

    const textAll = this.joinNormalized(fields);
    const tokensAll = this.tokenize(textAll);
    const bigramsAll = this.charBigrams(textAll);

    // Similaridades com o TIPO
    const tokenSim = this.jaccard(typeTokens, tokensAll);
    const bigramSimAll = this.dice(typeBigrams, bigramsAll);
    const nameSim = alt.name ? this.dice(typeBigrams, this.charBigrams(this.normalizeText(alt.name))) : 0;
    const catSim = alt.category ? this.dice(typeBigrams, this.charBigrams(this.normalizeText(alt.category))) : 0;
    const urlSim = urlContext ? this.dice(typeBigrams, this.charBigrams(this.normalizeText(urlContext))) : 0;

    let score =
      tokenSim * 50 +
      nameSim * 20 +
      catSim * 15 +
      urlSim * 10 +
      bigramSimAll * 15;

    // Penalidades genéricas por CTA/elemento de UI
    const nameNorm = this.normalizeText(alt.name);
    const forbiddenStarts = ['adicionar', 'comprar', 'botao', 'button', 'add', 'buy'];
    if (forbiddenStarts.some((f) => nameNorm.startsWith(f))) {
      score -= 40;
    }

    // Penalizar match forte com marca mas fraco com tipo
    if (brandTokens.length || brandBigrams.length) {
      const brandTokenSim = this.jaccard(brandTokens, tokensAll);
      const brandNameSim = this.dice(brandBigrams, this.charBigrams(nameNorm));
      const brandAllSim = this.dice(brandBigrams, bigramsAll);

      const brandSignal = Math.max(brandTokenSim, brandNameSim, brandAllSim);
      const typeSignal = Math.max(tokenSim, nameSim, catSim, bigramSimAll);

      if (brandSignal >= 0.35 && typeSignal < 0.25) {
        score -= 45;
      }
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  static extractProducts(aiJSON) {
    if (!aiJSON) return [];
    if (Array.isArray(aiJSON.alternatives)) return aiJSON.alternatives;
    if (Array.isArray(aiJSON.products)) return aiJSON.products;
    if (Array.isArray(aiJSON.produtos)) return aiJSON.produtos;
    if (Array.isArray(aiJSON)) return aiJSON;

    const out = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node) && node.every((x) => typeof x === 'object')) {
        out.push(...node);
      } else {
        for (const k of Object.keys(node)) visit(node[k]);
      }
    };
    visit(aiJSON);

    return out.filter(
      (p) => p && typeof p === 'object' && (p.name || p.nome || p.produto || p.title)
    );
  }

  static normalizeProduct(product, productType) {
    const name =
      product.nome ||
      product.name ||
      product.produto ||
      product.title ||
      `${productType} sustentável`;

    const benefits = this.extractBenefits(product);
    const searchTerms = this.extractSearchTerms(product, productType, name);

    const category =
      product.categoria ||
      product.category ||
      product.type ||
      product.tipo ||
      null;

    const description =
      product.descricao ||
      product.description ||
      product.desc ||
      null;

    const tags = this.normalizeArray(product.tags || product.etiquetas || []);

    return {
      name,
      benefits: benefits.slice(0, 4),
      searchTerms,
      category,
      description,
      tags,
    };
  }

  static extractSearchTerms(product, productType, name) {
    const out = [];
    if (Array.isArray(product.searchTerms)) out.push(...product.searchTerms);
    if (Array.isArray(product.termosBusca)) out.push(...product.termosBusca);

    if (out.length === 0) {
      const parts = String(name).split(/\s+/).filter(Boolean);
      if (parts.length >= 2) out.push(`${parts[0]} ${parts[1]}`);
      out.push(`${productType} sustentável`);
      out.push(`${productType} certificado`);
    }

    return [...new Set(out)].slice(0, 3);
  }

  static extractBenefits(product) {
    const benefits = [];
    if (Array.isArray(product.benefits)) benefits.push(...product.benefits);
    if (Array.isArray(product.beneficios)) benefits.push(...product.beneficios);

    const carac = product.caracteristicas || product.features;
    if (carac && typeof carac === 'object') {
      if (carac.certificacao || carac.certification)
        benefits.push(`Certificação ${carac.certificacao || carac.certification}`);
      if (carac.economia) benefits.push(carac.economia);
      if (carac.reciclavel) benefits.push(`${carac.reciclavel} materiais recicláveis`);
    }

    if (benefits.length === 0) {
      benefits.push('Produto com características sustentáveis');
      benefits.push('Certificação ambiental verificada');
      benefits.push('Redução de impacto ambiental');
    }

    return benefits;
  }

  static getGenericFallback(productType) {
    return [
      {
        name: `${productType} com certificação ambiental`,
        benefits: [
          'Certificação ambiental verificada',
          'Produção sustentável e responsável',
          'Materiais de origem controlada',
          'Menor impacto ambiental no ciclo de vida',
        ],
        searchTerms: [`${productType} certificado`, `${productType} sustentável`],
      },
      {
        name: `${productType} ecológico`,
        benefits: [
          'Processo produtivo com baixo impacto',
          'Materiais recicláveis ou biodegradáveis',
          'Eficiência no uso de recursos',
          'Programa de responsabilidade ambiental',
        ],
        searchTerms: [`${productType} ecológico`, `${productType} eco`],
      },
    ];
  }

  // Helpers
  static normalizeText(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(DIACRITICS, '')
      .replace(/[^a-z0-9\s\-_/|.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static normalizeArray(arr) {
    return (arr || []).map((x) => this.normalizeText(x)).filter(Boolean);
  }

  static joinNormalized(parts) {
    return this.normalizeText((parts || []).filter(Boolean).join(' | '));
  }

  static tokenize(text) {
    return this.normalizeText(text)
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }

  static charBigrams(text) {
    const s = this.normalizeText(text).replace(/\s+/g, ' ');
    const grams = [];
    for (let i = 0; i < s.length - 1; i++) grams.push(s.slice(i, i + 2));
    return grams.filter(Boolean);
  }

  static jaccard(aArr, bArr) {
    const a = new Set(aArr);
    const b = new Set(bArr);
    if (a.size === 0 && b.size === 0) return 0;
    let inter = 0;
    for (const v of a) if (b.has(v)) inter++;
    const uni = a.size + b.size - inter;
    return uni === 0 ? 0 : inter / uni;
  }

  static dice(aArr, bArr) {
    if (!aArr.length || !bArr.length) return 0;
    const a = new Map();
    for (const g of aArr) a.set(g, (a.get(g) || 0) + 1);
    let inter = 0;
    for (const g of bArr) {
      const c = a.get(g);
      if (c) {
        inter++;
        a.set(g, c - 1);
      }
    }
    return (2 * inter) / (aArr.length + bArr.length);
  }
}

module.exports = ResponseNormalizer;
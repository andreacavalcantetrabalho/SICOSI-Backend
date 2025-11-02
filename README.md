# SICOSI Backend

Backend APIs para o **SICOSI - Sistema de Compras Sustentáveis Inteligente**.

## 🚀 Endpoints

### 1. `/api/groq-proxy`
Análise de produtos usando IA (Groq Llama).

**Método:** POST

**Body:**
```json
{
  "action": "analyze_product",
  "adapter": "compras-gov",
  "prompt": "Sugira alternativas sustentáveis",
  "productInfo": {
    "description": "Notebook Dell Inspiron 15",
    "code": "123456",
    "category": "ti_equipamentos",
    "type": "notebook"
  },
  "context": {
    "role": "especialista em sustentabilidade",
    "focus": ["meio ambiente", "economia circular"],
    "certifications": ["EPEAT", "Energy Star"],
    "regulations": []
  }
}
```

### 2. `/api/web-search-proxy`
Análise de produtos com busca em tempo real (DuckDuckGo + Groq).

**Método:** POST

**Body:** *(mesmo formato do groq-proxy)*

**Diferença:** Busca produtos reais na web antes de analisar.

---

## 🛠️ Setup Local
```bash
# Instalar dependências
npm install

# Rodar localmente
vercel dev

# Testar endpoint
curl -X POST http://localhost:3000/api/web-search-proxy \
  -H "Content-Type: application/json" \
  -d '{"prompt":"teste","productInfo":{"description":"notebook","type":"notebook"}}'
```

---

## 🚀 Deploy
```bash
# Login na Vercel
vercel login

# Deploy em produção
vercel --prod
```

---

## 🔑 Variáveis de Ambiente

Configure no Dashboard da Vercel:

| Variável | Descrição |
|----------|-----------|
| `GROQ_API_KEY` | Chave da API Groq |

---

## 📊 Status

- ✅ `groq-proxy` - Análise com IA
- ✅ `web-search-proxy` - Análise com busca web

---

## 🔗 Links

- **Frontend:** [SICOSI Extensão](https://github.com/andreascavalcantetrabalho/SICOSI-Sistema-de-Compras-Sustentaveis-Inteligente-modular)
- **Backend:** [SICOSI Backend](https://github.com/andreascavalcantetrabalho/SICOSI-Backend)
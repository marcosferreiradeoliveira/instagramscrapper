import { NextResponse } from 'next/server';

type StageDecision = 'discard' | 'manual_review' | 'scrape_posts';
type PotentialLevel = 'baixo' | 'medio' | 'alto';

interface InstagramProfileData {
  username: string;
  nome_perfil: string;
  bio: string;
  seguidores: number;
  seguindo: number;
  total_posts: number;
  link_bio: string;
  categoria: string;
  cidade: string;
  is_business: boolean;
}

interface Stage3Analysis {
  score: number;
  decision: StageDecision;
  signals: string[];
  pain_points: string[];
}

interface LeadClassifierResult {
  is_valid_business: boolean;
  business_confidence: number;
  commercial_signals: string[];
  likely_pains: string[];
  potential_level: PotentialLevel;
  decision: StageDecision;
  recommended_posts_to_scrape: number;
  reason: string;
}

interface ScrapedPost {
  caption: string;
  likes: number;
  comments: number;
  timestamp: string;
  type: string;
}

/** Catálogo fixo de dores (blocos) — a IA principal só deve escolher desta lista. */
const PAIN_BLOCKS = [
  'sem landing page',
  'landing ruim',
  'sem CTA',
  'sem oferta',
  'sem funil',
  'sem CRM',
  'sem automação',
  'bio fraca',
  'posicionamento fraco',
  'sem prova social',
  'dependência de orgânico',
  'sem segmentação',
  'sem retenção',
  'sem upsell',
  'sem follow-up',
  'resposta lenta',
  'sem tracking',
  'sem SEO',
  'sem Google otimizado',
  'conteúdo sem estratégia',
  'engajamento baixo',
  'engajamento sem conversão',
  'branding fraco',
  'sem diferenciação',
  'proposta confusa',
  'sem processo comercial',
  'sem escala',
  'sem captura de leads',
  'link ruim',
  'sem autoridade'
] as const;

interface FullAnalysisInput {
  empresa: string;
  nicho: string;
  cidade: string;
  bio: string;
  link_bio: string;
  seguidores: number;
  posts: ScrapedPost[];
  dados_google: Record<string, unknown>;
  pre_analysis: {
    score: number;
    decision: StageDecision;
    signals: string[];
    pain_points: string[];
    lead_classifier: LeadClassifierResult;
  };
  pain_blocks_catalog: readonly string[];
}

interface FollowupMessage {
  numero: number;
  mensagem: string;
  prova: string;
  cta: string;
}

interface MessagesBlock {
  mensagem_inicial: string;
  followups: FollowupMessage[];
}

interface FullAnalysisOutput {
  diagnostico: string;
  maturidade_digital: string;
  potencial_comercial: string;
  dores_detectadas: string[];
  onde_perde_dinheiro: string[];
  programa_recomendado: string;
  messages: MessagesBlock;
}

interface SystemFinalOutput {
  lead: Record<string, unknown>;
  score: number;
  pre_analysis: Record<string, unknown>;
  decision: string;
  posts: ScrapedPost[];
  analysis: {
    diagnostico: string;
    maturidade_digital: string;
    potencial_comercial: string;
    dores_detectadas: string[];
    onde_perde_dinheiro: string[];
    programa_recomendado: string;
  } | null;
  messages: MessagesBlock | null;
}

function filterToPainCatalog(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item).trim().toLowerCase())
    .map((lower) => PAIN_BLOCKS.find((b) => b.toLowerCase() === lower) || '')
    .filter(Boolean);
}

function normalizeFollowupMessage(raw: unknown, index: number): FollowupMessage {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const n = Number(o.numero);
    return {
      numero: Number.isFinite(n) && n > 0 ? n : index + 1,
      mensagem: String(o.mensagem ?? '').trim(),
      prova: String(o.prova ?? '').trim(),
      cta: String(o.cta ?? '').trim()
    };
  }
  return { numero: index + 1, mensagem: String(raw ?? '').trim(), prova: '', cta: '' };
}

function normalizeMessagesBlock(raw: unknown): MessagesBlock {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const followRaw = Array.isArray(r.followups) ? r.followups : [];
  const followups = followRaw.map((item, i) => normalizeFollowupMessage(item, i));

  return {
    mensagem_inicial: String(r.mensagem_inicial ?? '').trim(),
    followups
  };
}

function normalizeFullAnalysisOutput(raw: unknown): FullAnalysisOutput {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const messagesRaw = r.messages;
  let messages: MessagesBlock;
  if (messagesRaw && typeof messagesRaw === 'object') {
    messages = normalizeMessagesBlock(messagesRaw);
  } else {
    const legacyFollowups = Array.isArray(r.followups)
      ? (r.followups as unknown[]).map((item, i) => normalizeFollowupMessage(item, i))
      : [];
    messages = {
      mensagem_inicial: String(r.mensagem_inicial ?? '').trim(),
      followups: legacyFollowups
    };
  }

  return {
    diagnostico: String(r.diagnostico ?? '').trim(),
    maturidade_digital: String(r.maturidade_digital ?? '').trim(),
    potencial_comercial: String(r.potencial_comercial ?? '').trim(),
    dores_detectadas: filterToPainCatalog(r.dores_detectadas),
    onde_perde_dinheiro: filterToPainCatalog(r.onde_perde_dinheiro),
    programa_recomendado: String(r.programa_recomendado ?? '').trim(),
    messages
  };
}

function buildAnalysisCoreOnly(full: FullAnalysisOutput): SystemFinalOutput['analysis'] {
  return {
    diagnostico: full.diagnostico,
    maturidade_digital: full.maturidade_digital,
    potencial_comercial: full.potencial_comercial,
    dores_detectadas: full.dores_detectadas,
    onde_perde_dinheiro: full.onde_perde_dinheiro,
    programa_recomendado: full.programa_recomendado
  };
}

function buildSystemFinalOutput(
  instagramUrl: string,
  profile: InstagramProfileData,
  stageAnalysis: Stage3Analysis,
  leadClassifier: LeadClassifierResult,
  posts: ScrapedPost[],
  fullAnalysis: FullAnalysisOutput | null
): SystemFinalOutput {
  return {
    lead: {
      instagram_url: instagramUrl,
      username: profile.username,
      nome_perfil: profile.nome_perfil,
      bio: profile.bio,
      link_bio: profile.link_bio,
      cidade: profile.cidade,
      nicho: profile.categoria,
      seguidores: profile.seguidores,
      seguindo: profile.seguindo,
      total_posts: profile.total_posts,
      is_business: profile.is_business
    },
    score: stageAnalysis.score,
    pre_analysis: {
      score: stageAnalysis.score,
      decision: leadClassifier.decision,
      signals: stageAnalysis.signals,
      pain_points: stageAnalysis.pain_points,
      lead_classifier: leadClassifier
    },
    decision: leadClassifier.decision,
    posts,
    analysis: fullAnalysis ? buildAnalysisCoreOnly(fullAnalysis) : null,
    messages: fullAnalysis ? fullAnalysis.messages : null
  };
}

function buildFullAnalysisInput(
  profile: InstagramProfileData,
  posts: ScrapedPost[],
  analysis: Stage3Analysis,
  leadClassifier: LeadClassifierResult
): FullAnalysisInput {
  return {
    empresa: profile.nome_perfil || profile.username || '',
    nicho: profile.categoria || '',
    cidade: profile.cidade || '',
    bio: profile.bio || '',
    link_bio: profile.link_bio || '',
    seguidores: profile.seguidores,
    posts,
    dados_google: {},
    pre_analysis: {
      score: analysis.score,
      decision: leadClassifier.decision,
      signals: analysis.signals,
      pain_points: analysis.pain_points,
      lead_classifier: leadClassifier
    },
    pain_blocks_catalog: PAIN_BLOCKS
  };
}

async function runMainAiFullAnalysis(input: FullAnalysisInput, apiKey: string): Promise<FullAnalysisOutput | null> {
  try {
    const userPrompt = `Você é a IA principal de análise comercial para prospecção outbound.

REGRAS:
- Use apenas dados fornecidos no JSON de entrada.
- Não invente fatos (empresa, cidade, métricas) que não estejam no input.
- Seja objetivo e acionável.
- Para dores_detectadas e onde_perde_dinheiro: use APENAS strings que existam exatamente em pain_blocks_catalog (pode repetir no máximo o necessário; não crie novos rótulos).

INPUT:
${JSON.stringify(input, null, 2)}

OUTPUT (apenas JSON válido, sem markdown):
{
  "diagnostico": "",
  "maturidade_digital": "",
  "potencial_comercial": "",
  "dores_detectadas": [],
  "onde_perde_dinheiro": [],
  "programa_recomendado": "",
  "messages": {
    "mensagem_inicial": "",
    "followups": [
      { "numero": 1, "mensagem": "", "prova": "", "cta": "" }
    ]
  }
}

Geração de mensagem (Etapa 8): em messages, produza mensagem inicial curta e follow-ups com prova social leve (só se derivável dos dados) e CTA claro; não invente métricas ou cases inexistentes no input.`;

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Você gera análises comerciais e bloco messages (mensagem_inicial + followups com numero, mensagem, prova, cta) em JSON. Respeita pain_blocks_catalog para dores. Responde apenas JSON válido.'
          },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!aiRes.ok) {
      console.error('Main AI full analysis error:', await aiRes.text());
      return null;
    }

    const aiData = await aiRes.json();
    const rawContent = aiData?.choices?.[0]?.message?.content;
    if (!rawContent) return null;
    const parsed = JSON.parse(rawContent);
    return normalizeFullAnalysisOutput(parsed);
  } catch (error) {
    console.error('Main AI full analysis failed:', error);
    return null;
  }
}

function clampConfidence(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return Number(num.toFixed(2));
}

function normalizeInstagramUrl(rawValue: unknown): string | null {
  if (rawValue === null || rawValue === undefined) return null;

  let raw = String(rawValue).trim();
  if (!raw) return null;

  raw = raw.replace(/^@+/, '');
  raw = raw.replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/+$/, '');

  if (!raw) return null;

  if (raw.toLowerCase().includes('instagram.com/')) {
    const withProtocol = raw.startsWith('http') ? raw : `https://${raw}`;
    const match = withProtocol.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
    if (!match?.[1]) return null;
    return `https://www.instagram.com/${match[1]}/`;
  }

  if (/^[a-zA-Z0-9._]{1,30}$/.test(raw)) {
    return `https://www.instagram.com/${raw}/`;
  }

  return null;
}

function extractUsernameFromInstagramUrl(igUrl: string): string | null {
  const match = igUrl.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
  return match?.[1] || null;
}

function decodeEscapedUnicode(text: string): string {
  return text.replace(/\\u([\dA-Fa-f]{4})/g, (_, group) => String.fromCharCode(parseInt(group, 16)));
}

function parseCountLabel(rawText: string): number {
  const cleaned = rawText.trim().toLowerCase().replace(/\s+/g, '');
  if (!cleaned) return 0;

  const suffix = cleaned.endsWith('k') || cleaned.endsWith('m') ? cleaned.slice(-1) : '';
  const numericPart = suffix ? cleaned.slice(0, -1) : cleaned;
  const normalized = numericPart.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;

  if (suffix === 'k') return Math.round(parsed * 1000);
  if (suffix === 'm') return Math.round(parsed * 1000000);
  return Math.round(parsed);
}

function getRecommendedPostsCount(score: number): number {
  if (score >= 17) return 10;
  if (score >= 13) return 7;
  if (score >= 10) return 5;
  return 0;
}

function mapPotentialLevel(score: number, seguidores: number): PotentialLevel {
  if (score >= 14 || seguidores >= 1000) return 'alto';
  if (score >= 10 || seguidores >= 301) return 'medio';
  return 'baixo';
}

function normalizePotentialLevel(value: unknown): PotentialLevel {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'alto') return 'alto';
  if (raw === 'medio' || raw === 'médio') return 'medio';
  return 'baixo';
}

function normalizeDecision(value: unknown): StageDecision {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'scrape_posts') return 'scrape_posts';
  if (raw === 'manual_review') return 'manual_review';
  return 'discard';
}

function applyFinalDecisionLogic(score: number, decision: StageDecision): StageDecision {
  if (score < 7) return 'discard';
  if (score >= 10 && decision === 'scrape_posts') return 'scrape_posts';
  if (score >= 10 && decision === 'manual_review') return 'manual_review';
  return 'manual_review';
}

function mapPostType(rawType: string | undefined, isVideo: boolean | undefined): string {
  if (isVideo) return 'video';
  if (!rawType) return 'image';
  if (rawType === 'GraphSidecar') return 'carousel';
  if (rawType === 'GraphVideo') return 'video';
  return 'image';
}

function extractPostsFromTimelineEdges(edges: unknown): ScrapedPost[] {
  if (!Array.isArray(edges)) return [];

  return edges
    .map((edge: any): ScrapedPost | null => {
      const node = edge?.node;
      if (!node) return null;

      const rawTimestamp = node.taken_at_timestamp;
      const timestamp = Number.isFinite(rawTimestamp)
        ? new Date(Number(rawTimestamp) * 1000).toISOString()
        : '';

      return {
        caption: node?.edge_media_to_caption?.edges?.[0]?.node?.text || '',
        likes: Number(node?.edge_liked_by?.count || node?.like_count || 0),
        comments: Number(node?.edge_media_to_comment?.count || node?.comment_count || 0),
        timestamp,
        type: mapPostType(node?.__typename, node?.is_video)
      };
    })
    .filter((post): post is ScrapedPost => post !== null);
}

function buildStage3Analysis(profile: InstagramProfileData, hasProfilePicture: boolean): Stage3Analysis {
  let score = 0;
  const signals: string[] = [];
  const painPoints: string[] = [];

  const bioLower = profile.bio.toLowerCase();
  const nomeLower = profile.nome_perfil.toLowerCase();
  const categoriaLower = profile.categoria.toLowerCase();

  const businessKeywords = [
    'atendimento', 'agendamento', 'consultoria', 'serviços', 'servico', 'loja', 'delivery', 'clínica',
    'clinica', 'oficial', 'empresa', 'studio', 'estética', 'estetica', 'frete', 'orçamento', 'orcamento'
  ];
  const ctaKeywords = ['clique', 'agende', 'chame', 'fale', 'compre', 'reserve', 'saiba mais', 'link na bio', 'solicite'];
  const contactKeywords = ['whatsapp', 'whats', 'contato', 'telefone', 'tel', 'direct', 'dm'];
  const offerKeywords = ['promo', 'desconto', 'orçamento', 'orcamento', 'pacote', 'planos', 'preço', 'preco'];
  const premiumKeywords = ['luxo', 'premium', 'alto padrão', 'high ticket', 'exclusivo', 'sofisticado'];

  const hasCommercialBio = businessKeywords.some(keyword => bioLower.includes(keyword)) || profile.categoria.length > 0;
  const hasContact = contactKeywords.some(keyword => bioLower.includes(keyword));
  const hasCTA = ctaKeywords.some(keyword => bioLower.includes(keyword));
  const hasOffer = offerKeywords.some(keyword => bioLower.includes(keyword));
  const hasServiceDescription = businessKeywords.some(keyword => bioLower.includes(keyword) || categoriaLower.includes(keyword));
  const hasLocation = !!profile.cidade || /\b(sp|rj|mg|rs|sc|pr|go|ba|pe|ce|es|df)\b/i.test(profile.bio);
  const isPremiumNiche = premiumKeywords.some(keyword => bioLower.includes(keyword) || categoriaLower.includes(keyword) || nomeLower.includes(keyword));
  const hasBranding = hasProfilePicture && profile.nome_perfil.length >= 3 && profile.bio.length >= 20;
  const nomeCoerente = profile.nome_perfil.length >= 3 && profile.nome_perfil.toLowerCase() !== profile.username.toLowerCase();
  const negocioReal = profile.is_business || !!profile.categoria || hasCommercialBio;

  // Validacao
  if (negocioReal) {
    score += 3;
    signals.push('negócio real (+3)');
  }
  if (hasProfilePicture) {
    score += 1;
    signals.push('foto de perfil (+1)');
  }
  if (nomeCoerente) {
    score += 2;
    signals.push('nome coerente (+2)');
  }
  if (hasCommercialBio) {
    score += 2;
    signals.push('bio comercial (+2)');
  }
  if (profile.total_posts >= 4) {
    score += 1;
    signals.push('4+ posts (+1)');
  }
  if (profile.total_posts >= 8) {
    score += 2;
    signals.push('8+ posts (+2)');
  }

  // Comercial
  if (profile.link_bio) {
    score += 2;
    signals.push('link na bio (+2)');
  }
  if (hasContact) {
    score += 2;
    signals.push('WhatsApp/contato (+2)');
  }
  if (hasCTA) {
    score += 2;
    signals.push('CTA (+2)');
  }
  if (hasServiceDescription) {
    score += 2;
    signals.push('serviço descrito (+2)');
  }
  if (hasLocation) {
    score += 1;
    signals.push('localização (+1)');
  }

  // Potencial
  if (profile.seguidores >= 1000) {
    score += 3;
    signals.push('1000+ seguidores (+3)');
  } else if (profile.seguidores >= 301) {
    score += 2;
    signals.push('301+ seguidores (+2)');
  } else if (profile.seguidores >= 101) {
    score += 1;
    signals.push('101+ seguidores (+1)');
  }
  if (isPremiumNiche) {
    score += 3;
    signals.push('nicho premium (+3)');
  }
  if (hasBranding) {
    score += 2;
    signals.push('branding ok (+2)');
  }

  // Dores prováveis (não entram no score final, mas são reportadas)
  if (!hasCTA) painPoints.push('sem CTA');
  if (!hasOffer) painPoints.push('sem oferta');
  if (profile.bio.length < 20 || ['empreendedor', 'criador', 'digital', 'marketing'].includes(bioLower.trim())) {
    painPoints.push('bio genérica');
  }
  if (!profile.link_bio) painPoints.push('sem link');
  if (!profile.categoria && !hasServiceDescription) painPoints.push('posicionamento fraco');

  let decision: StageDecision = 'scrape_posts';
  if (score < 7) decision = 'discard';
  else if (score <= 9) decision = 'manual_review';

  return {
    score,
    decision,
    signals,
    pain_points: painPoints
  };
}

function buildRuleBasedLeadClassifier(profile: InstagramProfileData, analysis: Stage3Analysis): LeadClassifierResult {
  const knownDataSignals = [
    profile.nome_perfil ? 1 : 0,
    profile.bio ? 1 : 0,
    profile.total_posts > 0 ? 1 : 0,
    profile.seguidores > 0 ? 1 : 0,
    profile.is_business || !!profile.categoria ? 1 : 0,
    profile.link_bio ? 1 : 0
  ];
  const confidenceRaw = knownDataSignals.reduce((sum, item) => sum + item, 0) / knownDataSignals.length;
  const businessConfidence = Number(confidenceRaw.toFixed(2));
  const isValidBusiness = businessConfidence >= 0.4 && analysis.score >= 7;
  const potentialLevel = mapPotentialLevel(analysis.score, profile.seguidores);

  let baseDecision: StageDecision = analysis.decision;
  if (analysis.score >= 10) {
    const hasCoreData = Boolean(profile.nome_perfil && profile.bio && profile.total_posts > 0);
    baseDecision = hasCoreData && businessConfidence >= 0.55 ? 'scrape_posts' : 'manual_review';
  }

  // Lógica final de decisão pedida
  const finalDecision = applyFinalDecisionLogic(analysis.score, baseDecision);

  const recommendedPostsToScrape = finalDecision === 'scrape_posts' ? getRecommendedPostsCount(analysis.score) : 0;
  const reason = finalDecision === 'discard'
    ? 'Score baixo para justificar custo de scraping de posts.'
    : finalDecision === 'manual_review'
      ? 'Perfil com sinais mistos ou dados insuficientes; revisar antes de investir em scraping.'
      : `Perfil qualificado para scraping de posts com prioridade de custo (${recommendedPostsToScrape} posts).`;

  return {
    is_valid_business: isValidBusiness,
    business_confidence: businessConfidence,
    commercial_signals: analysis.signals,
    likely_pains: analysis.pain_points,
    potential_level: potentialLevel,
    decision: finalDecision,
    recommended_posts_to_scrape: recommendedPostsToScrape,
    reason
  };
}

function normalizeLeadClassifierPayload(raw: any, profile: InstagramProfileData, analysis: Stage3Analysis): LeadClassifierResult {
  const normalizedDecision = applyFinalDecisionLogic(analysis.score, normalizeDecision(raw?.decision));
  const recommendedFromDecision = normalizedDecision === 'scrape_posts' ? getRecommendedPostsCount(analysis.score) : 0;
  const rawRecommended = Number(raw?.recommended_posts_to_scrape);
  const recommendedPostsToScrape =
    normalizedDecision === 'scrape_posts'
      ? (Number.isFinite(rawRecommended) && rawRecommended > 0 ? Math.round(rawRecommended) : recommendedFromDecision)
      : 0;

  const commercialSignals = Array.isArray(raw?.commercial_signals)
    ? raw.commercial_signals.map((item: unknown) => String(item)).filter(Boolean)
    : analysis.signals;

  const likelyPains = Array.isArray(raw?.likely_pains)
    ? raw.likely_pains.map((item: unknown) => String(item)).filter(Boolean)
    : analysis.pain_points;

  const reason = String(raw?.reason || '').trim() || (
    normalizedDecision === 'discard'
      ? 'Score baixo para justificar custo de scraping de posts.'
      : normalizedDecision === 'manual_review'
        ? 'Perfil com sinais mistos ou dados insuficientes; revisar antes de investir em scraping.'
        : `Perfil qualificado para scraping de posts com prioridade de custo (${recommendedPostsToScrape} posts).`
  );

  return {
    is_valid_business: Boolean(raw?.is_valid_business),
    business_confidence: clampConfidence(raw?.business_confidence),
    commercial_signals: commercialSignals,
    likely_pains: likelyPains,
    potential_level: normalizePotentialLevel(raw?.potential_level),
    decision: normalizedDecision,
    recommended_posts_to_scrape: recommendedPostsToScrape,
    reason
  };
}

async function runMiniAiLeadClassifier(profile: InstagramProfileData, analysis: Stage3Analysis, apiKey: string): Promise<LeadClassifierResult | null> {
  try {
    const prompt = `ROLE:
Você é um classificador comercial de leads para prospecção outbound.

OBJETIVO:
Decidir se vale a pena fazer scraping dos posts.

REGRAS:
- usar apenas dados fornecidos
- não inventar
- ser objetivo
- priorizar economia de custo

CRITÉRIOS:
- é negócio real?
- tem sinais comerciais?
- tem potencial?
- há dores prováveis?
- vale investir scraping?

OUTPUT JSON:
{
  "is_valid_business": true,
  "business_confidence": 0.0,
  "commercial_signals": [],
  "likely_pains": [],
  "potential_level": "baixo|medio|alto",
  "decision": "discard|manual_review|scrape_posts",
  "recommended_posts_to_scrape": 0,
  "reason": ""
}

INPUT:
${JSON.stringify({ dados_do_perfil: profile, score: analysis.score, sinais_camada_1: analysis.signals, dores_camada_1: analysis.pain_points }, null, 2)}

LÓGICA FINAL DE DECISÃO
Se score >= 10 E decision = scrape_posts -> scrape_posts
Se score >= 10 E decision = manual_review -> manual_review
Se score < 7 -> discard

Retorne apenas JSON válido, sem markdown.`;

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Você é um classificador comercial rigoroso para outbound. Sempre responde apenas JSON válido.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!aiRes.ok) {
      console.error('Mini AI classifier error:', await aiRes.text());
      return null;
    }

    const aiData = await aiRes.json();
    const rawContent = aiData?.choices?.[0]?.message?.content;
    if (!rawContent) return null;

    const parsed = JSON.parse(rawContent);
    return normalizeLeadClassifierPayload(parsed, profile, analysis);
  } catch (error) {
    console.error('Mini AI classifier failed:', error);
    return null;
  }
}

async function scrapeInstagramProfile(instagramUrl: string): Promise<{ profile: InstagramProfileData; analysis: Stage3Analysis; posts: ScrapedPost[] }> {
  const username = extractUsernameFromInstagramUrl(instagramUrl);
  if (!username) {
    throw new Error('Username do Instagram inválido');
  }

  const baseProfile: InstagramProfileData = {
    username,
    nome_perfil: '',
    bio: '',
    seguidores: 0,
    seguindo: 0,
    total_posts: 0,
    link_bio: '',
    categoria: '',
    cidade: '',
    is_business: false
  };

  let hasProfilePicture = false;
  let profile = { ...baseProfile };
  let posts: ScrapedPost[] = [];

  try {
    const profileRes = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://www.instagram.com/${username}/`
      },
      cache: 'no-store'
    });

    if (profileRes.ok) {
      const profileJson = await profileRes.json();
      const user = profileJson?.data?.user;
      if (user) {
        const bioLinks = Array.isArray(user.bio_links) ? user.bio_links : [];
        const firstBioLink = bioLinks[0]?.url || user.external_url || '';
        const cityFromAddress =
          user?.business_address_json?.city_name ||
          user?.business_address_json?.city ||
          (typeof user?.business_address_json === 'string' ? user.business_address_json : '');

        profile = {
          username: user.username || username,
          nome_perfil: user.full_name || '',
          bio: user.biography || '',
          seguidores: Number(user.edge_followed_by?.count || user.follower_count || 0),
          seguindo: Number(user.edge_follow?.count || user.following_count || 0),
          total_posts: Number(user.edge_owner_to_timeline_media?.count || user.media_count || 0),
          link_bio: firstBioLink || '',
          categoria: user.category_name || user.business_category_name || '',
          cidade: cityFromAddress || '',
          is_business: Boolean(user.is_business_account || user.is_professional_account || user.business_category_name)
        };
        hasProfilePicture = Boolean(user.profile_pic_url_hd || user.profile_pic_url);
        posts = extractPostsFromTimelineEdges(user?.edge_owner_to_timeline_media?.edges);
      }
    }
  } catch (error) {
    console.error('Instagram API profile fetch failed:', error);
  }

  // HTML fallback for fields missing in API response
  if (!profile.nome_perfil || profile.seguidores === 0 || profile.total_posts === 0) {
    try {
      const htmlRes = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        redirect: 'follow',
        cache: 'no-store'
      });

      if (htmlRes.ok) {
        const html = await htmlRes.text();

        const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i)?.[1] || '';
        const ogDescription = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i)?.[1] || '';
        const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i)?.[1] || '';
        const fullNameFromTitle = ogTitle.match(/^(.*?)\s+\(@/i)?.[1]?.trim() || '';
        const fullNameFromTitleTag = html.match(/<title>(.*?)\s+\(@/i)?.[1]?.trim() || '';
        const bioFromDescription = ogDescription.match(/- (.*)$/)?.[1]?.trim() || '';

        const followersFromMeta =
          ogDescription.match(/([\d.,kKmM]+)\s+Followers/i)?.[1] ||
          ogDescription.match(/([\d.,kKmM]+)\s+seguidores/i)?.[1] ||
          '';
        const followingFromMeta =
          ogDescription.match(/([\d.,kKmM]+)\s+Following/i)?.[1] ||
          ogDescription.match(/([\d.,kKmM]+)\s+seguindo/i)?.[1] ||
          '';
        const postsFromMeta =
          ogDescription.match(/([\d.,kKmM]+)\s+Posts/i)?.[1] ||
          ogDescription.match(/([\d.,kKmM]+)\s+publicações/i)?.[1] ||
          ogDescription.match(/([\d.,kKmM]+)\s+publicacoes/i)?.[1] ||
          '';

        const followersFromJson =
          html.match(/"edge_followed_by":\{"count":(\d+)\}/)?.[1] ||
          html.match(/"follower_count":(\d+)/)?.[1] ||
          '';
        const followingFromJson =
          html.match(/"edge_follow":\{"count":(\d+)\}/)?.[1] ||
          html.match(/"following_count":(\d+)/)?.[1] ||
          '';
        const postsFromJson =
          html.match(/"edge_owner_to_timeline_media":\{"count":(\d+)\}/)?.[1] ||
          html.match(/"media_count":(\d+)/)?.[1] ||
          '';

        const externalUrlEscaped = html.match(/"external_url":"([^"]+)"/)?.[1] || '';
        const categoryEscaped = html.match(/"category_name":"([^"]*)"/)?.[1] || '';
        const biographyEscaped = html.match(/"biography":"([^"]*)"/)?.[1] || '';

        const externalUrl = decodeEscapedUnicode(externalUrlEscaped).replace(/\\\//g, '/');
        const category = decodeEscapedUnicode(categoryEscaped).replace(/\\\//g, '/');
        const biographyFromScript = decodeEscapedUnicode(biographyEscaped).replace(/\\\//g, '/');

        if (!hasProfilePicture && ogImage) hasProfilePicture = true;
        if (!profile.nome_perfil && fullNameFromTitle) profile.nome_perfil = fullNameFromTitle;
        if (!profile.nome_perfil && fullNameFromTitleTag) profile.nome_perfil = fullNameFromTitleTag;
        if (!profile.bio && biographyFromScript) profile.bio = biographyFromScript;
        if (!profile.bio && bioFromDescription) profile.bio = bioFromDescription;
        if (!profile.seguidores && followersFromMeta) profile.seguidores = parseCountLabel(followersFromMeta);
        if (!profile.seguidores && followersFromJson) profile.seguidores = parseCountLabel(followersFromJson);
        if (!profile.seguindo && followingFromMeta) profile.seguindo = parseCountLabel(followingFromMeta);
        if (!profile.seguindo && followingFromJson) profile.seguindo = parseCountLabel(followingFromJson);
        if (!profile.total_posts && postsFromMeta) profile.total_posts = parseCountLabel(postsFromMeta);
        if (!profile.total_posts && postsFromJson) profile.total_posts = parseCountLabel(postsFromJson);
        if (!profile.link_bio && externalUrl) profile.link_bio = externalUrl;
        if (!profile.categoria && category) profile.categoria = category;
        if (!profile.nome_perfil) profile.nome_perfil = username;
      }
    } catch (error) {
      console.error('Instagram HTML fallback failed:', error);
    }
  }

  const analysis = buildStage3Analysis(profile, hasProfilePicture);
  return { profile, analysis, posts };
}

export async function POST(req: Request) {
  try {
    const { url, apiKey, instagramUrl } = await req.json();

    const normalizedInputInstagram = normalizeInstagramUrl(instagramUrl);
    const hasUrlInput = Boolean(url && String(url).trim());

    if (!hasUrlInput && !normalizedInputInstagram) {
      return NextResponse.json({ error: 'URL do site ou Instagram é obrigatório' }, { status: 400 });
    }

    let detectedInstagram: string | null = normalizedInputInstagram;

    if (hasUrlInput) {
      // Clean the URL
      let targetUrl = String(url).trim();
      if (!targetUrl.startsWith('http')) {
        targetUrl = 'http://' + targetUrl;
      }

      // Fetch the URL content (the company's website)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 seconds timeout to prevent 504 Gateway Timeouts
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        redirect: 'follow',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (!detectedInstagram) {
          return NextResponse.json({ error: `Falha ao acessar o site: HTTP ${response.status}` }, { status: response.status });
        }
      } else {
        const html = await response.text();

        // If an OpenAI API Key is provided, let's use it for smarter extraction
        if (apiKey && String(apiKey).startsWith('sk-')) {
          // Basic sanitization to save context length: remove scripts, styles, svgs and tags, keeping only text and hrefs
          const cleanHtml = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
            .substring(0, 20000); // Take first ~20k chars to be safe on token limits

          try {
            const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o-mini', // Cheap, fast, and good enough for this
                messages: [
                  {
                    role: 'system',
                    content: 'You are a data extractor. Look at the following messy HTML/text of a company website. Find the PRIMARY official Instagram profile URL for this company. Ignore dummy links, sharer links, or templates. Return ONLY the exact https URL of the Instagram profile. If you absolutely cannot find any valid Instagram URL, return the word "null" and nothing else.'
                  },
                  {
                    role: 'user',
                    content: cleanHtml
                  }
                ],
                temperature: 0
              })
            });

            if (gptRes.ok) {
              const gptData = await gptRes.json();
              const gptLink = gptData.choices?.[0]?.message?.content?.trim();
              const normalizedGptLink = normalizeInstagramUrl(gptLink);
              if (normalizedGptLink) {
                detectedInstagram = normalizedGptLink;
              }
            } else {
              console.error('OpenAI Error:', await gptRes.text());
            }
          } catch (err) {
            console.error('Failed to query OpenAI:', err);
          }
        }

        // ======================================
        // FALLBACK: Pure Regex extraction
        // ======================================
        if (!detectedInstagram) {
          // Regex to find instagram URLs
          const igRegex = /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.]+/gi;
          const matches = html.match(igRegex) || [];

          if (matches.length > 0) {
            // Filter out common non-profile links
            const invalidPaths = ['/p/', '/reel/', '/explore/', '/about/', '/developer/', '/tags/', '/locations/', '/directory/'];
            const profileLinks = matches.filter(link => {
              const lowerLink = link.toLowerCase();
              return !invalidPaths.some(path => lowerLink.includes(path));
            });

            const uniqueLinks = [...new Set(profileLinks.length > 0 ? profileLinks : matches)];
            detectedInstagram = normalizeInstagramUrl(uniqueLinks[0] || null);
          }
        }
      }
    }

    if (!detectedInstagram) {
      return NextResponse.json({
        instagram: null,
        profile: null,
        analysis: null,
        lead_classifier: null,
        posts: [],
        full_analysis: null,
        final_output: null,
        pain_blocks_catalog: [...PAIN_BLOCKS]
      });
    }

    const { profile, analysis, posts } = await scrapeInstagramProfile(detectedInstagram);
    const aiClassifier =
      apiKey && String(apiKey).startsWith('sk-')
        ? await runMiniAiLeadClassifier(profile, analysis, String(apiKey))
        : null;
    const leadClassifier = aiClassifier || buildRuleBasedLeadClassifier(profile, analysis);
    const finalAnalysis: Stage3Analysis = {
      ...analysis,
      decision: leadClassifier.decision
    };
    const postsToReturn = leadClassifier.decision === 'scrape_posts'
      ? posts.slice(0, leadClassifier.recommended_posts_to_scrape)
      : [];

    let fullAnalysis: FullAnalysisOutput | null = null;
    if (apiKey && String(apiKey).startsWith('sk-') && leadClassifier.decision !== 'discard') {
      const fullInput = buildFullAnalysisInput(profile, postsToReturn, finalAnalysis, leadClassifier);
      fullAnalysis = await runMainAiFullAnalysis(fullInput, String(apiKey));
    }

    const finalOutput = buildSystemFinalOutput(
      detectedInstagram,
      profile,
      finalAnalysis,
      leadClassifier,
      postsToReturn,
      fullAnalysis
    );

    return NextResponse.json({
      instagram: detectedInstagram,
      profile,
      analysis: finalAnalysis,
      lead_classifier: leadClassifier,
      posts: postsToReturn,
      full_analysis: fullAnalysis,
      final_output: finalOutput,
      pain_blocks_catalog: [...PAIN_BLOCKS]
    });
  } catch (error: any) {
    console.error('Scraping error:', error);
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return NextResponse.json({ error: 'Tempo limite excedido ao carregar o site (site muito lento ou fora do ar)' }, { status: 504 });
    }
    return NextResponse.json({ error: error.message || 'Erro ao acessar o site' }, { status: 500 });
  }
}


import { NextResponse } from 'next/server';

type StageDecision = 'discard' | 'manual_review' | 'next_stage';

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

  let decision: StageDecision = 'next_stage';
  if (score < 7) decision = 'discard';
  else if (score <= 9) decision = 'manual_review';

  return {
    score,
    decision,
    signals,
    pain_points: painPoints
  };
}

async function scrapeInstagramProfile(instagramUrl: string): Promise<{ profile: InstagramProfileData; analysis: Stage3Analysis }> {
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
        const fullNameFromTitle = ogTitle.match(/^(.*?)\s+\(@/i)?.[1]?.trim() || '';
        const bioFromDescription = ogDescription.match(/- (.*)$/)?.[1]?.trim() || '';

        const followersFromMeta = ogDescription.match(/([\d.,kKmM]+)\s+Followers/i)?.[1] || '';
        const followingFromMeta = ogDescription.match(/([\d.,kKmM]+)\s+Following/i)?.[1] || '';
        const postsFromMeta = ogDescription.match(/([\d.,kKmM]+)\s+Posts/i)?.[1] || '';

        const externalUrlEscaped = html.match(/"external_url":"([^"]+)"/)?.[1] || '';
        const categoryEscaped = html.match(/"category_name":"([^"]*)"/)?.[1] || '';
        const biographyEscaped = html.match(/"biography":"([^"]*)"/)?.[1] || '';

        const externalUrl = decodeEscapedUnicode(externalUrlEscaped).replace(/\\\//g, '/');
        const category = decodeEscapedUnicode(categoryEscaped).replace(/\\\//g, '/');
        const biographyFromScript = decodeEscapedUnicode(biographyEscaped).replace(/\\\//g, '/');

        if (!profile.nome_perfil && fullNameFromTitle) profile.nome_perfil = fullNameFromTitle;
        if (!profile.bio && biographyFromScript) profile.bio = biographyFromScript;
        if (!profile.bio && bioFromDescription) profile.bio = bioFromDescription;
        if (!profile.seguidores && followersFromMeta) profile.seguidores = parseCountLabel(followersFromMeta);
        if (!profile.seguindo && followingFromMeta) profile.seguindo = parseCountLabel(followingFromMeta);
        if (!profile.total_posts && postsFromMeta) profile.total_posts = parseCountLabel(postsFromMeta);
        if (!profile.link_bio && externalUrl) profile.link_bio = externalUrl;
        if (!profile.categoria && category) profile.categoria = category;
        if (!profile.nome_perfil) profile.nome_perfil = username;
      }
    } catch (error) {
      console.error('Instagram HTML fallback failed:', error);
    }
  }

  const analysis = buildStage3Analysis(profile, hasProfilePicture);
  return { profile, analysis };
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
        analysis: null
      });
    }

    const { profile, analysis } = await scrapeInstagramProfile(detectedInstagram);

    return NextResponse.json({
      instagram: detectedInstagram,
      profile,
      analysis
    });
  } catch (error: any) {
    console.error('Scraping error:', error);
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return NextResponse.json({ error: 'Tempo limite excedido ao carregar o site (site muito lento ou fora do ar)' }, { status: 504 });
    }
    return NextResponse.json({ error: error.message || 'Erro ao acessar o site' }, { status: 500 });
  }
}


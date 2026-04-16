import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url, apiKey } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL do site é obrigatória' }, { status: 400 });
    }

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
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json({ error: `Falha ao acessar o site: HTTP ${response.status}` }, { status: response.status });
    }

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
          let gptLink = gptData.choices?.[0]?.message?.content?.trim();
          
          if (gptLink && gptLink !== 'null' && gptLink.startsWith('http')) {
             return NextResponse.json({ instagram: gptLink });
          }
        } else {
          console.error("OpenAI Error:", await gptRes.text());
        }
      } catch (err) {
        console.error("Failed to query OpenAI:", err);
      }
    }

    // ======================================
    // FALLBACK: Pure Regex extraction
    // ======================================

    // Regex to find instagram URLs
    const igRegex = /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.]+/gi;
    let matches = html.match(igRegex) || [];

    if (matches && matches.length > 0) {
      // Filter out common non-profile links
      const invalidPaths = ['/p/', '/reel/', '/explore/', '/about/', '/developer/', '/tags/', '/locations/', '/directory/'];
      const profileLinks = matches.filter(link => {
        const lowerLink = link.toLowerCase();
        return !invalidPaths.some(path => lowerLink.includes(path));
      });
      
      const uniqueLinks = [...new Set(profileLinks.length > 0 ? profileLinks : matches)];
      const igLink = uniqueLinks.length > 0 ? uniqueLinks[0] : null;

      return NextResponse.json({ instagram: igLink });
    }

    return NextResponse.json({ instagram: null });
  } catch (error: any) {
    console.error('Scraping error:', error);
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return NextResponse.json({ error: 'Tempo limite excedido ao carregar o site (site muito lento ou fora do ar)' }, { status: 504 });
    }
    return NextResponse.json({ error: error.message || 'Erro ao acessar o site' }, { status: 500 });
  }
}


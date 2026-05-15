/**
 * Instagram profile + posts via Apify actor apify/instagram-profile-scraper.
 * Requires APIFY_API_TOKEN in server environment.
 */

export interface ApifyInstagramProfile {
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

export interface ApifyInstagramPost {
  caption: string;
  likes: number;
  comments: number;
  timestamp: string;
  type: string;
}

export interface ApifyInstagramScrapeResult {
  profile: ApifyInstagramProfile;
  posts: ApifyInstagramPost[];
  hasProfilePicture: boolean;
}

const ACTOR_ID = 'apify~instagram-profile-scraper';
const SYNC_TIMEOUT_SECS = 120;

function mapApifyPostType(rawType: unknown): string {
  const t = String(rawType || '').toLowerCase();
  if (t.includes('video') || t === 'graphvideo') return 'video';
  if (t.includes('sidecar') || t.includes('carousel')) return 'carousel';
  return 'image';
}

function mapApifyPosts(raw: unknown): ApifyInstagramPost[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): ApifyInstagramPost | null => {
      if (!item || typeof item !== 'object') return null;
      const p = item as Record<string, unknown>;
      return {
        caption: String(p.caption ?? '').trim(),
        likes: Number(p.likesCount ?? p.likes ?? 0) || 0,
        comments: Number(p.commentsCount ?? p.comments ?? 0) || 0,
        timestamp: String(p.timestamp ?? p.takenAt ?? '').trim(),
        type: mapApifyPostType(p.type ?? p.__typename)
      };
    })
    .filter((post): post is ApifyInstagramPost => post !== null);
}

function mapApifyProfileItem(item: Record<string, unknown>, fallbackUsername: string): ApifyInstagramScrapeResult | null {
  const username = String(item.username || fallbackUsername).trim();
  if (!username) return null;

  const about =
    item.about && typeof item.about === 'object'
      ? (item.about as Record<string, unknown>)
      : null;

  const cidade =
    String(about?.country ?? about?.city_name ?? item.businessAddress?.city ?? '').trim();

  const profile: ApifyInstagramProfile = {
    username,
    nome_perfil: String(item.fullName ?? item.full_name ?? username).trim(),
    bio: String(item.biography ?? item.bio ?? '').trim(),
    seguidores: Number(item.followersCount ?? item.followers ?? 0) || 0,
    seguindo: Number(item.followsCount ?? item.following ?? 0) || 0,
    total_posts: Number(item.postsCount ?? item.posts ?? 0) || 0,
    link_bio: String(item.externalUrl ?? item.external_url ?? '').trim(),
    categoria: String(item.businessCategoryName ?? item.category ?? '').trim(),
    cidade,
    is_business: Boolean(item.isBusinessAccount ?? item.is_business_account)
  };

  const hasProfilePicture = Boolean(
    item.profilePicUrlHD ||
    item.profilePicUrl ||
    item.profile_pic_url_hd ||
    item.profile_pic_url
  );

  const posts = mapApifyPosts(item.latestPosts ?? item.latest_posts ?? item.posts);

  return { profile, posts, hasProfilePicture };
}

export function getApifyApiToken(): string | null {
  const token = process.env.APIFY_API_TOKEN?.trim();
  return token || null;
}

export async function fetchInstagramViaApify(
  username: string,
  instagramUrl: string
): Promise<ApifyInstagramScrapeResult | null> {
  const token = getApifyApiToken();
  if (!token) return null;

  const profileUrl = instagramUrl.startsWith('http')
    ? instagramUrl
    : `https://www.instagram.com/${username}/`;

  const endpoint = new URL(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`
  );
  endpoint.searchParams.set('token', token);
  endpoint.searchParams.set('timeout', String(SYNC_TIMEOUT_SECS));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), (SYNC_TIMEOUT_SECS + 15) * 1000);

  try {
    const res = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernames: [username],
        directUrls: [profileUrl],
        resultsLimit: 12
      }),
      signal: controller.signal,
      cache: 'no-store'
    });

    if (!res.ok) {
      console.error('Apify Instagram scraper error:', res.status, await res.text());
      return null;
    }

    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      console.error('Apify Instagram scraper returned empty dataset');
      return null;
    }

    const first = items[0];
    if (!first || typeof first !== 'object') return null;

    return mapApifyProfileItem(first as Record<string, unknown>, username);
  } catch (error) {
    console.error('Apify Instagram scraper failed:', error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

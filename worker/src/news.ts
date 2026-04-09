/**
 * Economic News Fetcher.
 * Collects news from Vietnamese and international RSS feeds.
 *
 * Sources:
 *   🇻🇳 VN: CafeF, VnExpress, VietStock
 *   🌍 International: Reuters, CNBC, CoinDesk
 */

export interface NewsItem {
    title: string;
    link: string;
    source: string;
    category: string;
    pubDate: string;
}

interface RssFeed {
    url: string;
    source: string;
    category: string;
}

const RSS_FEEDS: RssFeed[] = [
    // 🇻🇳 Vietnamese sources
    {
        url: "https://cafef.vn/rss/chung-khoan.rss",
        source: "CafeF",
        category: "📈 Chứng khoán",
    },
    {
        url: "https://cafef.vn/rss/kinh-te-vi-mo.rss",
        source: "CafeF",
        category: "🏛️ Kinh tế vĩ mô",
    },
    {
        url: "https://cafef.vn/rss/bat-dong-san.rss",
        source: "CafeF",
        category: "🏠 Bất động sản",
    },
    {
        url: "https://vnexpress.net/rss/kinh-doanh.rss",
        source: "VnExpress",
        category: "💼 Kinh doanh",
    },
    {
        url: "https://vnexpress.net/rss/the-gioi.rss",
        source: "VnExpress",
        category: "🌍 Thế giới",
    },
    // 🌍 International sources
    {
        url: "https://feeds.reuters.com/reuters/businessNews",
        source: "Reuters",
        category: "🌐 Business",
    },
    {
        url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
        source: "CNBC",
        category: "📊 Markets",
    },
    {
        url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
        source: "CoinDesk",
        category: "₿ Crypto",
    },
];

/** Fetch news from all RSS feeds, returning up to `maxPerSource` items per feed. */
export async function fetchNews(maxPerSource = 3): Promise<NewsItem[]> {
    const results = await Promise.allSettled(
        RSS_FEEDS.map((feed) => fetchRssFeed(feed, maxPerSource)),
    );

    const allNews: NewsItem[] = [];
    for (const result of results) {
        if (result.status === "fulfilled") {
            allNews.push(...result.value);
        }
    }

    // Sort by publication date (newest first)
    allNews.sort(
        (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
    );

    // Cap at 20 items total
    return allNews.slice(0, 20);
}

/** Parse a single RSS feed. */
async function fetchRssFeed(
    feed: RssFeed,
    maxItems: number,
): Promise<NewsItem[]> {
    try {
        const res = await fetch(feed.url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (compatible; VNStockBot/1.0; +https://github.com)",
                Accept: "application/rss+xml, application/xml, text/xml",
            },
            cf: { cacheTtl: 300 }, // Cache RSS for 5 min to avoid hammering
        });

        if (!res.ok) {
            console.log(`[News] ${feed.source} HTTP ${res.status}`);
            return [];
        }

        const xml = await res.text();
        const items = parseRssXml(xml, feed, maxItems);
        console.log(`[News] ${feed.source}: ${items.length} items`);
        return items;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[News] ${feed.source} error: ${msg}`);
        return [];
    }
}

/** Basic RSS XML parser (no dependencies — CF Workers can't use DOM parser for XML). */
function parseRssXml(
    xml: string,
    feed: RssFeed,
    maxItems: number,
): NewsItem[] {
    const items: NewsItem[] = [];

    // Extract <item> or <entry> blocks
    const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
    const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    const regex = xml.includes("<entry") ? entryRegex : itemRegex;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(xml)) !== null && items.length < maxItems) {
        const block = match[1];

        const title = extractTag(block, "title");
        const link =
            extractTag(block, "link") || extractAttr(block, "link", "href");
        const pubDate =
            extractTag(block, "pubDate") ||
            extractTag(block, "published") ||
            extractTag(block, "updated") ||
            "";

        if (title && title.length > 5) {
            items.push({
                title: decodeHtmlEntities(title).trim(),
                link: link || "",
                source: feed.source,
                category: feed.category,
                pubDate,
            });
        }
    }

    return items;
}

/** Extract text content from an XML tag. */
function extractTag(xml: string, tag: string): string {
    // Handle CDATA
    const cdataRegex = new RegExp(
        `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
        "i",
    );
    const cdataMatch = cdataRegex.exec(xml);
    if (cdataMatch) return cdataMatch[1];

    // Handle regular content
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
    const match = regex.exec(xml);
    return match ? match[1].replace(/<[^>]+>/g, "") : "";
}

/** Extract attribute value from a self-closing tag. */
function extractAttr(xml: string, tag: string, attr: string): string {
    const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i");
    const match = regex.exec(xml);
    return match ? match[1] : "";
}

/** Decode common HTML entities. */
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) =>
            String.fromCharCode(parseInt(code, 10)),
        );
}

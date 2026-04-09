/**
 * VN Stock Telegram Bot — Cloudflare Worker Entry Point.
 *
 * Cron triggers (UTC → Vietnam UTC+7):
 *   0 23 * * 1,2,3,4,5  → 6:00 AM VN (Mon–Fri) — Market briefing
 *  30  4 * * 2,3,4,5,6  → 11:30 AM VN — Midday briefing
 *   0  9 * * 2,3,4,5,6  → 4:00 PM VN — Afternoon briefing
 *   0  *  * * *          → Every hour — News digest (24/7)
 */

import type { Env, ReportType } from "./types";
import { fetchMarketData } from "./stock-data";
import { generateBriefing, generateNewsDigest } from "./gemini";
import { fetchNews } from "./news";
import { sendTelegramMessage } from "./telegram";

export default {
    /** Cron trigger handler — main automation entry point. */
    async scheduled(
        event: ScheduledEvent,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<void> {
        // Hourly news cron
        if (event.cron === "0 * * * *") {
            ctx.waitUntil(runNewsDigest(env));
            return;
        }

        // Market report crons
        const reportType = cronToReportType(event.cron);
        ctx.waitUntil(runReport(env, reportType));
    },

    /** HTTP handler — manual trigger + health check. */
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // Health check
        if (url.pathname === "/" || url.pathname === "/health") {
            return new Response(
                JSON.stringify({
                    status: "ok",
                    service: "vn-stock-telegram-bot",
                    crons: [
                        "06:00 VN (market)",
                        "11:30 VN (market)",
                        "16:00 VN (market)",
                        "Every hour (news)",
                    ],
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        }

        // Manual trigger: GET /trigger?type=morning|midday|afternoon
        if (url.pathname === "/trigger") {
            const type = (url.searchParams.get("type") || "morning") as ReportType;
            if (!["morning", "midday", "afternoon"].includes(type)) {
                return new Response(
                    "Invalid type. Use: morning, midday, afternoon",
                    { status: 400 },
                );
            }

            try {
                await runReport(env, type);
                return new Response(`✅ ${type} report sent successfully!`);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return new Response(`❌ Error: ${msg}`, { status: 500 });
            }
        }

        // Manual news trigger: GET /news
        if (url.pathname === "/news") {
            try {
                await runNewsDigest(env);
                return new Response("✅ News digest sent successfully!");
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return new Response(`❌ Error: ${msg}`, { status: 500 });
            }
        }

        return new Response("Not found", { status: 404 });
    },
};

/** Run the full market report pipeline. */
async function runReport(env: Env, reportType: ReportType): Promise<void> {
    const watchlist = env.WATCHLIST.split(",").map((s) => s.trim());

    console.log(`[${reportType}] Starting report pipeline...`);

    const marketData = await fetchMarketData(watchlist);
    console.log(
        `[${reportType}] Got ${marketData.indices.length} indices, ${marketData.watchlist.length} stocks`,
    );

    const briefing = await generateBriefing(
        env.GEMINI_API_KEY,
        env.AI,
        marketData,
        reportType,
    );
    console.log(`[${reportType}] Briefing generated (${briefing.length} chars)`);

    await sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        env.TELEGRAM_CHAT_ID,
        briefing,
    );
    console.log(`[${reportType}] ✅ Report sent!`);
}

/** Run the hourly news digest pipeline. */
async function runNewsDigest(env: Env): Promise<void> {
    console.log("[news] Starting news digest...");

    // Step 1: Fetch latest news from RSS feeds
    const newsItems = await fetchNews(3);
    console.log(`[news] Fetched ${newsItems.length} news items`);

    if (newsItems.length === 0) {
        console.log("[news] No news items found, skipping...");
        return;
    }

    // Step 2: AI summarize and format
    const digest = await generateNewsDigest(
        env.GEMINI_API_KEY,
        env.AI,
        newsItems,
    );
    console.log(`[news] Digest generated (${digest.length} chars)`);

    // Step 3: Send to Telegram
    await sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        env.TELEGRAM_CHAT_ID,
        digest,
    );
    console.log("[news] ✅ News digest sent!");
}

/** Map cron expression to report type. */
function cronToReportType(cron: string): ReportType {
    if (cron.startsWith("0 23")) return "morning";
    if (cron.startsWith("30 4")) return "midday";
    if (cron.startsWith("0 9")) return "afternoon";
    return "morning";
}

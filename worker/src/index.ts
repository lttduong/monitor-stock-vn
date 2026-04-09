/**
 * VN Stock Telegram Bot — Cloudflare Worker Entry Point.
 *
 * Cron triggers (UTC → Vietnam UTC+7):
 *   0 23 * * 0-4  → 6:00 AM VN (Mon–Fri)
 *  30  4 * * 1-5  → 11:30 AM VN
 *   0  9 * * 1-5  → 4:00 PM VN
 */

import type { Env, ReportType } from "./types";
import { fetchMarketData } from "./stock-data";
import { generateBriefing } from "./gemini";
import { sendTelegramMessage } from "./telegram";

export default {
    /** Cron trigger handler — main automation entry point. */
    async scheduled(
        event: ScheduledEvent,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<void> {
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
                    crons: ["06:00 VN", "11:30 VN", "16:00 VN"],
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        }

        // Manual trigger: GET /trigger?type=morning|midday|afternoon
        if (url.pathname === "/trigger") {
            const type = (url.searchParams.get("type") || "morning") as ReportType;
            if (!["morning", "midday", "afternoon"].includes(type)) {
                return new Response("Invalid type. Use: morning, midday, afternoon", {
                    status: 400,
                });
            }

            try {
                await runReport(env, type);
                return new Response(`✅ ${type} report sent successfully!`);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return new Response(`❌ Error: ${msg}`, { status: 500 });
            }
        }

        return new Response("Not found", { status: 404 });
    },
};

/** Run the full report pipeline: fetch data → AI analysis → send to Telegram. */
async function runReport(env: Env, reportType: ReportType): Promise<void> {
    const watchlist = env.WATCHLIST.split(",").map((s) => s.trim());

    console.log(`[${reportType}] Starting report pipeline...`);

    // Step 1: Fetch real-time market data
    console.log(`[${reportType}] Fetching market data...`);
    const marketData = await fetchMarketData(watchlist);
    console.log(
        `[${reportType}] Got ${marketData.indices.length} indices, ${marketData.watchlist.length} stocks`,
    );

    // Step 2: Generate AI briefing
    console.log(`[${reportType}] Generating AI briefing...`);
    const briefing = await generateBriefing(
        env.GEMINI_API_KEY,
        marketData,
        reportType,
    );
    console.log(`[${reportType}] Briefing generated (${briefing.length} chars)`);

    // Step 3: Send to Telegram
    console.log(`[${reportType}] Sending to Telegram...`);
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, briefing);
    console.log(`[${reportType}] ✅ Report sent!`);
}

/** Map cron expression to report type. */
function cronToReportType(cron: string): ReportType {
    // 0 23 * * 0-4 → 6:00 AM VN → morning
    if (cron.startsWith("0 23")) return "morning";
    // 30 4 * * 1-5 → 11:30 AM VN → midday
    if (cron.startsWith("30 4")) return "midday";
    // 0 9 * * 1-5 → 4:00 PM VN → afternoon
    if (cron.startsWith("0 9")) return "afternoon";
    // Default fallback
    return "morning";
}

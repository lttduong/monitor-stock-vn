// VN Stock Telegram Bot — Cloudflare Worker Entry Point.
// Crons: Market (6h/11h30/16h VN), News+Macro (10min), Foreign (12h/17h VN)

import type { Env, ReportType } from "./types";
import { fetchMarketData, fetchForeignFlow } from "./stock-data";
import { fetchMacroData } from "./macro-data";
import {
    generateBriefing,
    generateNewsDigest,
    generateMacroReport,
    generateForeignFlowReport,
} from "./gemini";
import { fetchNews, getFeeds } from "./news";
import { sendTelegramMessage } from "./telegram";
import { snapshotDailyVolumes, getVolumeSpikes, type VolumeSpike } from "./volume-tracker";

const FOREIGN_CRON = "0 5,10 * * 2,3,4,5,6";

export default {
    async scheduled(
        event: ScheduledEvent,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<void> {
        console.log(`[cron] Triggered: ${event.cron}`);

        // Market report crons (check specific first)
        const reportType = cronToReportType(event.cron);
        if (reportType) {
            ctx.waitUntil(
                runReport(env, reportType).catch((e) =>
                    console.log(`[cron] ${reportType} failed: ${e}`),
                ),
            );
            return;
        }

        // Foreign flow (12h + 17h VN)
        if (event.cron === FOREIGN_CRON) {
            ctx.waitUntil(
                runForeignFlowReport(env).catch((e) =>
                    console.log(`[cron] foreign failed: ${e}`),
                ),
            );
            return;
        }

        // Every 10 min: news + macro at even VN hours
        const utcHour = new Date().getUTCHours();
        const utcMin = new Date().getUTCMinutes();
        const macroHours = [1, 3, 5, 7, 9, 11, 13, 15];

        if (macroHours.includes(utcHour) && utcMin < 10) {
            ctx.waitUntil(
                runMacroReport(env).catch((e) =>
                    console.log(`[cron] macro failed: ${e}`),
                ),
            );
        }

        ctx.waitUntil(
            runNewsDigest(env).catch((e) =>
                console.log(`[cron] news failed: ${e}`),
            ),
        );
    },

    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/" || url.pathname === "/health") {
            return new Response(
                JSON.stringify({
                    status: "ok",
                    service: "vn-stock-telegram-bot",
                    reports: {
                        market: ["06:00", "11:30", "16:00"],
                        news: "Every 10 min",
                        macro: "Every 2h (8-22h VN)",
                        foreign: ["12:00", "17:00"],
                    },
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        }

        if (url.pathname === "/trigger") {
            const type = (url.searchParams.get("type") || "morning") as ReportType;
            if (!["morning", "midday", "afternoon"].includes(type)) {
                return new Response("Invalid type. Use: morning, midday, afternoon", { status: 400 });
            }
            try {
                await runReport(env, type);
                return new Response(`✅ ${type} report sent!`);
            } catch (err) { return errResponse(err); }
        }

        if (url.pathname === "/news") {
            try {
                await runNewsDigest(env);
                return new Response("✅ News digest sent!");
            } catch (err) { return errResponse(err); }
        }

        if (url.pathname === "/macro") {
            try {
                await runMacroReport(env);
                return new Response("✅ Macro report sent!");
            } catch (err) { return errResponse(err); }
        }

        if (url.pathname === "/foreign") {
            try {
                await runForeignFlowReport(env);
                return new Response("✅ Foreign flow report sent!");
            } catch (err) { return errResponse(err); }
        }

        if (url.pathname === "/snapshot") {
            try {
                const count = await snapshotDailyVolumes(env.DB);
                return new Response(`✅ Volume snapshot: ${count} stocks saved!`);
            } catch (err) { return errResponse(err); }
        }

        if (url.pathname === "/spikes") {
            try {
                const spikes = await getVolumeSpikes(env.DB);
                return new Response(JSON.stringify(spikes, null, 2), {
                    headers: { "Content-Type": "application/json" },
                });
            } catch (err) { return errResponse(err); }
        }

        // ── Feed management ────────────────────────────
        if (url.pathname === "/feeds") {
            // GET: list all feeds
            if (request.method === "GET") {
                try {
                    const result = await env.DB
                        .prepare("SELECT id, url, source, category, enabled, created_at FROM rss_feeds ORDER BY source")
                        .all();
                    return new Response(JSON.stringify(result.results, null, 2), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (err) { return errResponse(err); }
            }

            // POST: add a feed { url, source, category }
            if (request.method === "POST") {
                try {
                    const body = (await request.json()) as { url: string; source: string; category: string };
                    if (!body.url || !body.source || !body.category) {
                        return new Response('{"error": "url, source, category required"}', { status: 400 });
                    }
                    await env.DB
                        .prepare("INSERT INTO rss_feeds (url, source, category) VALUES (?, ?, ?)")
                        .bind(body.url, body.source, body.category)
                        .run();
                    return new Response(`\u2705 Feed added: ${body.source} — ${body.url}`);
                } catch (err) { return errResponse(err); }
            }

            // DELETE: remove by id ?id=N or disable ?id=N&disable=1
            if (request.method === "DELETE") {
                const id = url.searchParams.get("id");
                if (!id) return new Response('{"error": "id required"}', { status: 400 });
                try {
                    await env.DB.prepare("DELETE FROM rss_feeds WHERE id = ?").bind(id).run();
                    return new Response(`\u2705 Feed ${id} deleted`);
                } catch (err) { return errResponse(err); }
            }
        }

        return new Response("Not found", { status: 404 });
    },
};

// ── Pipelines ──────────────────────────────────────────

async function runReport(env: Env, reportType: ReportType): Promise<void> {
    const watchlist = env.WATCHLIST.split(",").map((s) => s.trim());
    console.log(`[${reportType}] Starting report...`);

    const marketData = await fetchMarketData(watchlist);

    // Morning report: include volume spike alerts
    let volumeSpikes: VolumeSpike[] = [];
    if (reportType === "morning") {
        try {
            volumeSpikes = await getVolumeSpikes(env.DB);
            console.log(`[${reportType}] Found ${volumeSpikes.length} volume spikes`);
        } catch (err) {
            console.log(`[${reportType}] Volume spikes query failed: ${err}`);
        }
    }

    // Afternoon report: also snapshot daily volumes
    if (reportType === "afternoon") {
        try {
            const saved = await snapshotDailyVolumes(env.DB);
            console.log(`[${reportType}] Volume snapshot: ${saved} stocks`);
        } catch (err) {
            console.log(`[${reportType}] Volume snapshot failed: ${err}`);
        }
    }

    const briefing = await generateBriefing(
        env.GEMINI_API_KEY, env.AI, marketData, reportType, volumeSpikes,
    );
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, briefing);
    console.log(`[${reportType}] ✅ Sent!`);
}

async function runNewsDigest(env: Env): Promise<void> {
    console.log("[news] Starting...");
    const newsItems = await fetchNews(5, env.DB);
    if (newsItems.length === 0) { console.log("[news] No items, skip"); return; }

    const digest = await generateNewsDigest(env.GEMINI_API_KEY, env.AI, newsItems);
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, digest);
    console.log("[news] ✅ Sent!");
}

async function runMacroReport(env: Env): Promise<void> {
    console.log("[macro] Starting...");
    const [macroData, newsItems] = await Promise.all([fetchMacroData(), fetchNews(3, env.DB)]);
    console.log(`[macro] FX: ${macroData.fx.usdVnd} | Gold: $${macroData.gold.xauUsd}`);

    const report = await generateMacroReport(env.GEMINI_API_KEY, env.AI, macroData, newsItems);
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, report);
    console.log("[macro] ✅ Sent!");
}

async function runForeignFlowReport(env: Env): Promise<void> {
    console.log("[foreign] Starting...");
    const flowData = await fetchForeignFlow();
    console.log(`[foreign] Buy: ${flowData.topBuy.length} | Sell: ${flowData.topSell.length}`);

    const report = await generateForeignFlowReport(env.GEMINI_API_KEY, env.AI, flowData);
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, report);
    console.log("[foreign] ✅ Sent!");
}

// ── Helpers ────────────────────────────────────────────

function cronToReportType(cron: string): ReportType | null {
    if (cron.startsWith("0 23")) return "morning";
    if (cron.startsWith("30 4")) return "midday";
    if (cron.startsWith("0 9")) return "afternoon";
    return null;
}

function errResponse(err: unknown): Response {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`❌ Error: ${msg}`, { status: 500 });
}

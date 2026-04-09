/**
 * VN Stock Market Data Fetcher.
 * Uses TCBS and VCI public HTTP APIs to get real-time data.
 */

import type {
    StockSnapshot,
    MarketIndex,
    SectorPerformance,
    MarketData,
} from "./types";

const TCBS_BASE = "https://apipubaws.tcbs.com.vn";
const VCI_BASE = "https://trading-service.vci.com.vn";

/** Fetch all market data needed for the AI briefing. */
export async function fetchMarketData(
    watchlist: string[],
): Promise<MarketData> {
    const now = new Date();
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const timestamp = vnTime.toISOString().replace("T", " ").slice(0, 16);

    // Run fetches in parallel for speed
    const [indices, watchlistData, topMovers, sectors] = await Promise.allSettled([
        fetchMarketIndices(),
        fetchPriceBoard(watchlist),
        fetchTopMovers(),
        fetchSectorPerformance(),
    ]);

    const allStocks = topMovers.status === "fulfilled" ? topMovers.value : [];
    const topGainers = [...allStocks]
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 5);
    const topLosers = [...allStocks]
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 5);

    return {
        timestamp,
        indices: indices.status === "fulfilled" ? indices.value : [],
        watchlist: watchlistData.status === "fulfilled" ? watchlistData.value : [],
        topGainers,
        topLosers,
        sectors: sectors.status === "fulfilled" ? sectors.value : [],
    };
}

/** Fetch VN-Index, HNX-Index, UPCOM from TCBS. */
async function fetchMarketIndices(): Promise<MarketIndex[]> {
    const indexCodes = ["VNINDEX", "HNXINDEX", "UPINDEX"];
    const results: MarketIndex[] = [];

    for (const code of indexCodes) {
        try {
            const today = new Date();
            const vnToday = new Date(today.getTime() + 7 * 60 * 60 * 1000);
            const dateStr = vnToday.toISOString().slice(0, 10);

            const url = `${TCBS_BASE}/stock-insight/v2/stock/bars?ticker=${code}&type=stock&resolution=D&from=${dateToUnix(dateStr, -5)}&to=${dateToUnix(dateStr, 1)}`;
            const res = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
            });

            if (!res.ok) continue;

            const data = (await res.json()) as {
                data: Array<{
                    close: number;
                    open: number;
                    high: number;
                    low: number;
                    volume: number;
                }>;
            };

            if (data.data && data.data.length > 0) {
                const latest = data.data[data.data.length - 1];
                const prev = data.data.length > 1 ? data.data[data.data.length - 2] : latest;
                const change = latest.close - prev.close;
                const changePct = prev.close > 0 ? (change / prev.close) * 100 : 0;

                results.push({
                    name: code.replace("INDEX", "-Index").replace("UP-Index", "UPCOM"),
                    value: latest.close,
                    change: Math.round(change * 100) / 100,
                    changePercent: Math.round(changePct * 100) / 100,
                    volume: latest.volume,
                });
            }
        } catch {
            // Skip failed index
        }
    }

    return results;
}

/** Fetch current prices for watchlist stocks via TCBS. */
async function fetchPriceBoard(symbols: string[]): Promise<StockSnapshot[]> {
    const results: StockSnapshot[] = [];

    // Fetch in batches of 5 to avoid overloading
    const batches = chunk(symbols, 5);

    for (const batch of batches) {
        const promises = batch.map(async (symbol) => {
            try {
                const today = new Date();
                const vnToday = new Date(today.getTime() + 7 * 60 * 60 * 1000);
                const dateStr = vnToday.toISOString().slice(0, 10);

                const url = `${TCBS_BASE}/stock-insight/v2/stock/bars?ticker=${symbol}&type=stock&resolution=D&from=${dateToUnix(dateStr, -5)}&to=${dateToUnix(dateStr, 1)}`;
                const res = await fetch(url, {
                    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
                });

                if (!res.ok) return null;

                const data = (await res.json()) as {
                    data: Array<{
                        close: number;
                        open: number;
                        high: number;
                        low: number;
                        volume: number;
                    }>;
                };

                if (data.data && data.data.length > 0) {
                    const latest = data.data[data.data.length - 1];
                    const prev = data.data.length > 1 ? data.data[data.data.length - 2] : latest;
                    const change = latest.close - prev.close;
                    const changePct = prev.close > 0 ? (change / prev.close) * 100 : 0;

                    return {
                        symbol,
                        price: latest.close * 1000,
                        change: Math.round(change * 1000),
                        changePercent: Math.round(changePct * 100) / 100,
                        volume: latest.volume,
                        high: latest.high * 1000,
                        low: latest.low * 1000,
                    };
                }
                return null;
            } catch {
                return null;
            }
        });

        const batchResults = await Promise.all(promises);
        results.push(...batchResults.filter((r): r is StockSnapshot => r !== null));
    }

    return results;
}

/** Fetch top movers from TCBS screening API. */
async function fetchTopMovers(): Promise<StockSnapshot[]> {
    try {
        const url = `${TCBS_BASE}/tcanalysis/v1/rating/detail/list?sectorName=&page=0&size=30&order=changePricePercent1Day`;
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        });

        if (!res.ok) return [];

        const data = (await res.json()) as {
            data: Array<{
                ticker: string;
                closePrice: number;
                priceChange1Day: number;
                changePricePercent1Day: number;
                avgVolume10Day: number;
                highPrice52Week: number;
                lowPrice52Week: number;
            }>;
        };

        if (!data.data) return [];

        return data.data.map((item) => ({
            symbol: item.ticker,
            price: item.closePrice * 1000,
            change: Math.round(item.priceChange1Day * 1000),
            changePercent: Math.round(item.changePricePercent1Day * 100) / 100,
            volume: item.avgVolume10Day,
            high: item.highPrice52Week * 1000,
            low: item.lowPrice52Week * 1000,
        }));
    } catch {
        return [];
    }
}

/** Fetch sector/industry performance from TCBS. */
async function fetchSectorPerformance(): Promise<SectorPerformance[]> {
    try {
        const url = `${TCBS_BASE}/tcanalysis/v1/industry`;
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        });

        if (!res.ok) return [];

        const data = (await res.json()) as Array<{
            industry: string;
            changePercent: number;
            tickers: string[];
        }>;

        if (!Array.isArray(data)) return [];

        return data
            .map((sector) => ({
                name: sector.industry || "Unknown",
                changePercent: Math.round((sector.changePercent || 0) * 100) / 100,
                topStocks: (sector.tickers || []).slice(0, 3),
            }))
            .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
            .slice(0, 8);
    } catch {
        return [];
    }
}

// ── Utilities ──────────────────────────────────────────

function dateToUnix(dateStr: string, offsetDays: number): number {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + offsetDays);
    return Math.floor(d.getTime() / 1000);
}

function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

/**
 * Macro Economic Data Fetcher.
 * Collects FX rates, gold/silver prices from free public APIs.
 *
 * Sources:
 *   💱 FX Rates: open.er-api.com (free, no key)
 *   🥇 Gold/Silver: gold-api.com (free, no key)
 */

export interface MacroData {
    timestamp: string;
    fx: {
        usdVnd: number;
        eurVnd: number;
        usdJpy: number;
        dxyApprox: number; // USD index estimate from JPY/EUR
    };
    gold: {
        xauUsd: number;       // Gold $/oz
        xauVnd: number;       // Gold VND/lượng (est.)
        xagUsd: number;       // Silver $/oz
    };
    // Oil + rates will come from AI + news context
}

const FX_API = "https://open.er-api.com/v6/latest/USD";
const GOLD_API = "https://api.gold-api.com/price";

/** Fetch all macro indicators in parallel. */
export async function fetchMacroData(): Promise<MacroData> {
    const now = new Date();
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const timestamp = vnTime.toISOString().replace("T", " ").slice(0, 16);

    const [fxResult, goldResult, silverResult] = await Promise.allSettled([
        fetchFxRates(),
        fetchCommodityPrice("XAU"),
        fetchCommodityPrice("XAG"),
    ]);

    const fx = fxResult.status === "fulfilled"
        ? fxResult.value
        : { usdVnd: 0, eurVnd: 0, usdJpy: 0, dxyApprox: 0 };

    const xauUsd = goldResult.status === "fulfilled" ? goldResult.value : 0;
    const xagUsd = silverResult.status === "fulfilled" ? silverResult.value : 0;

    // Gold VND/lượng estimate: 1 lượng = 1.2057 troy oz
    const xauVnd = fx.usdVnd > 0
        ? Math.round(xauUsd * 1.2057 * fx.usdVnd / 1_000_000) // millions VND
        : 0;

    return {
        timestamp,
        fx,
        gold: { xauUsd, xauVnd, xagUsd },
    };
}

/** Fetch FX rates from open.er-api.com (free, 1500 req/mo). */
async function fetchFxRates(): Promise<MacroData["fx"]> {
    const res = await fetch(FX_API, {
        headers: { "User-Agent": "VNStockBot/1.0" },
        cf: { cacheTtl: 600 }, // Cache 10 min
    });

    if (!res.ok) {
        console.log(`[Macro] FX API HTTP ${res.status}`);
        return { usdVnd: 0, eurVnd: 0, usdJpy: 0, dxyApprox: 0 };
    }

    const data = (await res.json()) as {
        rates: Record<string, number>;
    };

    const vnd = data.rates.VND || 0;
    const eur = data.rates.EUR || 1;
    const jpy = data.rates.JPY || 0;

    // Approximate DXY from EUR (EUR is ~57.6% of DXY basket)
    const eurUsd = 1 / eur;
    const dxyApprox = Math.round(100 / (eurUsd ** 0.576) * 100) / 100;

    return {
        usdVnd: Math.round(vnd * 100) / 100,
        eurVnd: Math.round((vnd / eur) * 100) / 100,
        usdJpy: Math.round(jpy * 100) / 100,
        dxyApprox,
    };
}

/** Fetch commodity price from gold-api.com (free, ~300 req/mo). */
async function fetchCommodityPrice(symbol: string): Promise<number> {
    try {
        const res = await fetch(`${GOLD_API}/${symbol}`, {
            headers: { "User-Agent": "VNStockBot/1.0" },
            cf: { cacheTtl: 600 },
        });

        if (!res.ok) {
            console.log(`[Macro] ${symbol} API HTTP ${res.status}`);
            return 0;
        }

        const data = (await res.json()) as {
            price?: number;
            error?: string;
        };

        if (data.error) {
            console.log(`[Macro] ${symbol} error: ${data.error}`);
            return 0;
        }

        return data.price || 0;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[Macro] ${symbol} fetch error: ${msg}`);
        return 0;
    }
}

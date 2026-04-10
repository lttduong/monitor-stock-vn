/**
 * Volume Tracker — D1-backed daily volume storage and spike detection.
 *
 * Data Source: VNDirect dchart API (TradingView-compatible, free, no auth)
 *   Supports: HOSE, HNX, UPCOM stocks
 *
 * Pipeline:
 *   1. snapshotDailyVolumes() — fetch + store today's volume for all tracked stocks
 *   2. getVolumeSpikes() — query D1 for stocks where 5d avg > 150% of 30d avg
 */

const VNDIRECT_CHART = "https://dchart-api.vndirect.com.vn/dchart/history";

export interface VolumeSpike {
    symbol: string;
    sector: string;
    closePrice: number;
    avgVol5d: number;
    avgVol30d: number;
    spikeRatio: number;   // avg5d / avg30d (>1.5 = spike)
    volumeToday: number;
}

interface TrackedStock {
    symbol: string;
    sector: string;
}

/** Snapshot today's volume for all tracked stocks → D1. */
export async function snapshotDailyVolumes(db: D1Database): Promise<number> {
    const stocks = await getTrackedStocks(db);
    console.log(`[volume] Snapshotting ${stocks.length} stocks via VNDirect...`);

    const today = getVnDateStr();
    let saved = 0;

    // Process in batches of 10 to avoid overloading
    const batches = chunk(stocks, 10);
    for (const batch of batches) {
        const results = await Promise.allSettled(
            batch.map((s) => fetchStockBar(s.symbol)),
        );

        const stmts: D1PreparedStatement[] = [];
        for (let i = 0; i < batch.length; i++) {
            const result = results[i];
            if (result.status !== "fulfilled" || !result.value) continue;

            const { close, volume } = result.value;
            stmts.push(
                db
                    .prepare(
                        "INSERT OR REPLACE INTO daily_volumes (symbol, date, close_price, volume) VALUES (?, ?, ?, ?)",
                    )
                    .bind(batch[i].symbol, today, close, volume),
            );
            saved++;
        }

        if (stmts.length > 0) {
            await db.batch(stmts);
        }
    }

    // Cleanup old data (keep 60 days)
    await db
        .prepare("DELETE FROM daily_volumes WHERE date < date(?, '-60 days')")
        .bind(today)
        .run();

    console.log(`[volume] Saved ${saved}/${stocks.length} stocks for ${today}`);
    return saved;
}

/** Query D1 for volume spikes: 5-day avg > 150% of 30-day avg. */
export async function getVolumeSpikes(db: D1Database): Promise<VolumeSpike[]> {
    const today = getVnDateStr();

    const query = `
    SELECT
      s.symbol,
      s.sector,
      v5.avg_vol AS avg_vol_5d,
      v30.avg_vol AS avg_vol_30d,
      v5.avg_vol / v30.avg_vol AS spike_ratio,
      latest.close_price,
      latest.volume AS volume_today
    FROM stocks s
    JOIN (
      SELECT symbol, AVG(volume) AS avg_vol
      FROM daily_volumes
      WHERE date > date(?, '-5 days')
      GROUP BY symbol
      HAVING COUNT(*) >= 3
    ) v5 ON s.symbol = v5.symbol
    JOIN (
      SELECT symbol, AVG(volume) AS avg_vol
      FROM daily_volumes
      WHERE date > date(?, '-30 days')
      GROUP BY symbol
      HAVING COUNT(*) >= 10
    ) v30 ON s.symbol = v30.symbol
    LEFT JOIN (
      SELECT symbol, close_price, volume
      FROM daily_volumes
      WHERE date = (SELECT MAX(date) FROM daily_volumes WHERE symbol = daily_volumes.symbol)
    ) latest ON s.symbol = latest.symbol
    WHERE v30.avg_vol > 0
      AND v5.avg_vol / v30.avg_vol > 1.5
    ORDER BY spike_ratio DESC
    LIMIT 20;
  `;

    const result = await db
        .prepare(query)
        .bind(today, today)
        .all<{
            symbol: string;
            sector: string;
            avg_vol_5d: number;
            avg_vol_30d: number;
            spike_ratio: number;
            close_price: number;
            volume_today: number;
        }>();

    return (result.results || []).map((row) => ({
        symbol: row.symbol,
        sector: row.sector,
        closePrice: row.close_price || 0,
        avgVol5d: Math.round(row.avg_vol_5d),
        avgVol30d: Math.round(row.avg_vol_30d),
        spikeRatio: Math.round(row.spike_ratio * 100) / 100,
        volumeToday: row.volume_today || 0,
    }));
}

/** Get all tracked stocks from D1. */
async function getTrackedStocks(db: D1Database): Promise<TrackedStock[]> {
    const result = await db
        .prepare("SELECT symbol, sector FROM stocks ORDER BY symbol")
        .all<TrackedStock>();
    return result.results || [];
}

/**
 * Fetch latest daily bar from VNDirect dchart API.
 * Returns TradingView-format: { c:[], h:[], l:[], o:[], v:[], t:[], s:"ok" }
 */
async function fetchStockBar(
    symbol: string,
): Promise<{ close: number; volume: number } | null> {
    try {
        const now = Math.floor(Date.now() / 1000);
        const from = now - 7 * 86400; // 7 days to ensure at least 1 trading day

        const url = `${VNDIRECT_CHART}?resolution=D&symbol=${symbol}&from=${from}&to=${now}`;
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
        });

        if (!res.ok) {
            console.log(`[volume] ${symbol} HTTP ${res.status}`);
            return null;
        }

        const data = (await res.json()) as {
            s: string;
            c?: number[];
            v?: number[];
        };

        if (data.s !== "ok" || !data.c?.length || !data.v?.length) return null;

        // Get latest bar
        const lastIdx = data.c.length - 1;
        return {
            close: data.c[lastIdx],
            volume: data.v[lastIdx],
        };
    } catch {
        return null;
    }
}

// ── Helpers ────────────────────────────────────────────

function getVnDateStr(): string {
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return vn.toISOString().slice(0, 10);
}

function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

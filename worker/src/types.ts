/** Environment bindings for the Cloudflare Worker. */
export interface Env {
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_CHAT_ID: string;
    GEMINI_API_KEY: string;
    WATCHLIST: string;
}

export type ReportType = "morning" | "midday" | "afternoon";

/** Raw price row from VCI price board API. */
export interface VciPriceRow {
    sym: string;
    c: number;    // close / match price
    f: number;    // floor
    r: number;    // ref
    lastPrice: number;
    lastVolume: number;
    ot: string;   // change type CE/FL/UP/DN
    changePc: number; // percent change
    change: number;
    vol: number;  // total volume
    highPrice: number;
    lowPrice: number;
}

/** Processed stock snapshot. */
export interface StockSnapshot {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    high: number;
    low: number;
}

/** Market index data point. */
export interface MarketIndex {
    name: string;
    value: number;
    change: number;
    changePercent: number;
    volume: number;
}

/** Sector performance entry. */
export interface SectorPerformance {
    name: string;
    changePercent: number;
    topStocks: string[];
}

/** Aggregated market data fed to Gemini. */
export interface MarketData {
    timestamp: string;
    indices: MarketIndex[];
    watchlist: StockSnapshot[];
    topGainers: StockSnapshot[];
    topLosers: StockSnapshot[];
    sectors: SectorPerformance[];
}

/** Gemini API response structure. */
export interface GeminiResponse {
    candidates?: Array<{
        content: {
            parts: Array<{ text: string }>;
        };
    }>;
    error?: { message: string; code: number };
}

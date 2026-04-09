/**
 * AI Briefing Generator.
 * Generates Vietnamese stock market briefings.
 *
 * Strategy:
 *   1. Try direct Google Gemini API
 *   2. If geo-restricted, fall back to Cloudflare Workers AI (native binding)
 */

import type { MarketData, ReportType, GeminiResponse } from "./types";
import type { NewsItem } from "./news";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.5-flash";

/** Generate AI analysis from market data. */
export async function generateBriefing(
    geminiApiKey: string,
    ai: Ai | undefined,
    marketData: MarketData,
    reportType: ReportType,
): Promise<string> {
    const prompt = buildPrompt(marketData, reportType);
    return await callAI(geminiApiKey, ai, prompt);
}

/** Generate AI news digest from RSS items. */
export async function generateNewsDigest(
    geminiApiKey: string,
    ai: Ai | undefined,
    newsItems: NewsItem[],
): Promise<string> {
    const prompt = buildNewsPrompt(newsItems);
    return await callAI(geminiApiKey, ai, prompt);
}

/** Try Gemini first, fall back to Workers AI. */
async function callAI(
    geminiApiKey: string,
    ai: Ai | undefined,
    prompt: string,
): Promise<string> {
    try {
        return await callGemini(geminiApiKey, prompt);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[Gemini] Failed: ${msg}`);

        if (
            msg.includes("location is not supported") ||
            msg.includes("RESOURCE_EXHAUSTED") ||
            msg.includes("429")
        ) {
            if (ai) {
                console.log("[AI] Falling back to Cloudflare Workers AI...");
                return await callWorkersAI(ai, prompt);
            }
            throw new Error(
                "Gemini geo-restricted and Workers AI binding not configured.",
            );
        }

        throw err;
    }
}

/** Direct Google Gemini API call. */
async function callGemini(apiKey: string, prompt: string): Promise<string> {
    const url = `${GEMINI_API}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            topP: 0.9,
        },
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as GeminiResponse;
    if (data.error) throw new Error(`Gemini error: ${data.error.message}`);

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned empty response");
    return text;
}

/** Cloudflare Workers AI native binding call. */
async function callWorkersAI(ai: Ai, prompt: string): Promise<string> {
    const result = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
            {
                role: "system",
                content:
                    "Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam. Viết báo cáo bằng tiếng Việt, với emoji phong phú và format HTML cho Telegram (<b>, <i>, <code> tags).",
            },
            { role: "user", content: prompt },
        ],
        max_tokens: 2048,
        temperature: 0.7,
    });

    // Workers AI returns { response: string } for text generation
    const text =
        typeof result === "string"
            ? result
            : (result as { response?: string }).response;

    if (!text) throw new Error("Workers AI returned empty response");
    return text;
}

/** Build the prompt with real-time data context. */
function buildPrompt(data: MarketData, reportType: ReportType): string {
    const reportLabels: Record<ReportType, string> = {
        morning: "BÁO CÁO BUỔI SÁNG 🌅 (Trước giờ mở sàn)",
        midday: "BÁO CÁO GIỮA PHIÊN 🕐 (Giữa phiên giao dịch)",
        afternoon: "BÁO CÁO CUỐI NGÀY 🌆 (Sau giờ đóng sàn)",
    };

    const reportHints: Record<ReportType, string> = {
        morning:
            "Tập trung vào: dự báo phiên hôm nay, tin tức vĩ mô qua đêm, chiến lược giao dịch sáng nay.",
        midday:
            "Tập trung vào: diễn biến phiên sáng, dòng tiền đang chảy vào đâu, cơ hội/rủi ro phiên chiều.",
        afternoon:
            "Tập trung vào: tổng kết phiên, top tăng/giảm, dòng tiền, outlook phiên ngày mai.",
    };

    let indicesBlock = "";
    if (data.indices.length > 0) {
        indicesBlock = data.indices
            .map(
                (i) =>
                    `  - ${i.name}: ${i.value.toFixed(2)} (${i.change >= 0 ? "+" : ""}${i.change.toFixed(2)}, ${i.changePercent >= 0 ? "+" : ""}${i.changePercent.toFixed(2)}%) | Vol: ${formatVol(i.volume)}`,
            )
            .join("\n");
    } else {
        indicesBlock = "  (Không có dữ liệu chỉ số)";
    }

    let watchlistBlock = "";
    if (data.watchlist.length > 0) {
        watchlistBlock = data.watchlist
            .map(
                (s) =>
                    `  - ${s.symbol}: ${formatPrice(s.price)} (${s.changePercent >= 0 ? "+" : ""}${s.changePercent}%) | Vol: ${formatVol(s.volume)}`,
            )
            .join("\n");
    } else {
        watchlistBlock = "  (Không có dữ liệu danh mục)";
    }

    const gainersBlock =
        data.topGainers.length > 0
            ? data.topGainers
                .map(
                    (s) =>
                        `  - ${s.symbol}: ${formatPrice(s.price)} (+${s.changePercent}%)`,
                )
                .join("\n")
            : "  (Không có dữ liệu)";

    const losersBlock =
        data.topLosers.length > 0
            ? data.topLosers
                .map(
                    (s) =>
                        `  - ${s.symbol}: ${formatPrice(s.price)} (${s.changePercent}%)`,
                )
                .join("\n")
            : "  (Không có dữ liệu)";

    let sectorsBlock = "";
    if (data.sectors.length > 0) {
        sectorsBlock = data.sectors
            .map(
                (s) =>
                    `  - ${s.name}: ${s.changePercent >= 0 ? "+" : ""}${s.changePercent}% | Top: ${s.topStocks.join(", ")}`,
            )
            .join("\n");
    } else {
        sectorsBlock = "  (Không có dữ liệu ngành)";
    }

    return `Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam. Viết báo cáo BẰNG TIẾNG VIỆT, sử dụng emoji phong phú, format đẹp cho Telegram (HTML tags: <b>, <i>, <code>).

📌 LOẠI BÁO CÁO: ${reportLabels[reportType]}
📅 Thời gian: ${data.timestamp} (Giờ Việt Nam)
💡 ${reportHints[reportType]}

═══════════════════════════════════
📊 DỮ LIỆU THỊ TRƯỜNG THỰC TẾ:
═══════════════════════════════════

🏛️ CHỈ SỐ THỊ TRƯỜNG:
${indicesBlock}

📋 DANH MỤC THEO DÕI:
${watchlistBlock}

🔥 TOP TĂNG GIÁ:
${gainersBlock}

📉 TOP GIẢM GIÁ:
${losersBlock}

🏭 HIỆU SUẤT TỪNG NGÀNH:
${sectorsBlock}

═══════════════════════════════════
📝 YÊU CẦU BÁO CÁO:
═══════════════════════════════════

Viết báo cáo với các phần sau, mỗi phần có emoji header:

1. 🏛️ <b>VĨ MÔ & THỊ TRƯỜNG</b>
   - Phân tích chỉ số VN-Index, HNX, UPCOM
   - Nhận xét về dòng tiền, thanh khoản
   - Bối cảnh vĩ mô (USD, lãi suất, Fed nếu liên quan)

2. 📊 <b>XU HƯỚNG NGÀNH</b>
   - Ngành nào đang hot? Ngành nào suy yếu?
   - Phân tích dòng tiền vào từng ngành

3. 🔥 <b>CƠ HỘI HÀNG ĐẦU</b>
   - 3-5 cổ phiếu đáng chú ý với lý do cụ thể
   - Mức giá vào/ra gợi ý (nếu có)

4. ⚠️ <b>RỦI RO CẦN LƯU Ý</b>
   - Rủi ro thị trường hiện tại
   - Cổ phiếu cần tránh hoặc cẩn trọng

5. 💡 <b>CHIẾN LƯỢC</b>
   - Gợi ý chiến lược ngắn hạn
   - Tỷ trọng cổ phiếu/tiền mặt gợi ý

QUAN TRỌNG:
- Dùng HTML tags (<b>, <i>, <code>) KHÔNG dùng Markdown
- Viết ngắn gọn, dễ đọc trên điện thoại
- Thêm emoji phong phú 🎯📈📉💰🔥⚡💎🚀⚠️🛡️
- KHÔNG dùng bảng, chỉ dùng list
- Tổng độ dài tối đa 3000 ký tự
- Kết thúc bằng dòng: "🤖 <i>VN Stock AI — Powered by Gemini</i>"`;
}

function formatPrice(price: number): string {
    if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(2)}M`;
    if (price >= 1_000) return `${(price / 1_000).toFixed(1)}K`;
    return price.toFixed(0);
}

function formatVol(vol: number): string {
    if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
    return vol.toString();
}

/** Build news digest prompt from RSS items. */
function buildNewsPrompt(newsItems: NewsItem[]): string {
    const now = new Date();
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const timestamp = vnTime.toISOString().replace("T", " ").slice(0, 16);

    const newsBlock = newsItems
        .map(
            (item, i) =>
                `${i + 1}. [${item.category}] ${item.source}\n   "${item.title}"\n   ${item.link}`,
        )
        .join("\n\n");

    return `Bạn là biên tập viên tin tức kinh tế. Viết bản tin tổng hợp BẰNG TIẾNG VIỆT, format HTML cho Telegram.

📅 Thời gian: ${timestamp} (Giờ Việt Nam)

═══════════════════════════════════
📰 TIN TỨC MỚI NHẤT:
═══════════════════════════════════

${newsBlock}

═══════════════════════════════════
📝 YÊU CẦU:
═══════════════════════════════════

Viết bản tin tổng hợp với format:

1. Header: "📰 <b>TIN TỨC KINH TẾ - [giờ]h</b>"

2. Chọn 5-8 tin QUAN TRỌNG NHẤT từ danh sách trên, nhóm theo chủ đề:
   - 🏛️ Vĩ mô / Chính sách
   - 📈 Chứng khoán / Thị trường
   - 🏠 Bất động sản
   - ₿ Crypto / Blockchain
   - 🌍 Kinh tế quốc tế
   - 💼 Doanh nghiệp

3. Mỗi tin viết 1-2 dòng TÓM TẮT ngắn gọn (không copy nguyên title)

4. Cuối bản tin thêm:
   - 💡 <b>Điểm nhấn</b>: 1 câu tóm tắt xu hướng chung
   - ⚡ <b>Cần theo dõi</b>: 1-2 điều cần chú ý tiếp

QUAN TRỌNG:
- Dùng HTML tags (<b>, <i>, <code>) KHÔNG dùng Markdown
- Viết TÓM TẮT, không copy nguyên tiêu đề
- Thêm emoji phong phú
- Tổng độ dài tối đa 2500 ký tự
- Kết thúc: "🤖 <i>VN Stock AI — Bản tin mỗi giờ</i>"`;
}


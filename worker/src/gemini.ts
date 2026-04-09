/**
 * Google Gemini AI integration.
 * Generates Vietnamese stock market briefings from real-time data.
 */

import type { MarketData, ReportType, GeminiResponse } from "./types";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-2.5-pro-preview-05-06";

/** Generate AI analysis from market data. */
export async function generateBriefing(
    apiKey: string,
    marketData: MarketData,
    reportType: ReportType,
): Promise<string> {
    const prompt = buildPrompt(marketData, reportType);

    const url = `${GEMINI_API}/models/${MODEL}:generateContent?key=${apiKey}`;
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

    if (data.error) {
        throw new Error(`Gemini error: ${data.error.message}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error("Gemini returned empty response");
    }

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

    // Format indices
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

    // Format watchlist
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

    // Format top gainers/losers
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

    // Format sectors
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

// ── Formatting helpers ─────────────────────────────────

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

/**
 * Telegram Bot API client.
 * Sends messages to a chat, auto-splits long messages.
 */

const TELEGRAM_API = "https://api.telegram.org";
const MAX_MESSAGE_LENGTH = 4096;

export async function sendTelegramMessage(
    botToken: string,
    chatId: string,
    text: string,
): Promise<void> {
    const chunks = splitMessage(text);

    for (const chunk of chunks) {
        const url = `${TELEGRAM_API}/bot${botToken}/sendMessage`;
        const body = {
            chat_id: chatId,
            text: chunk,
            parse_mode: "HTML",
            disable_web_page_preview: true,
        };

        const res = await fetchWithRetry(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Telegram API error ${res.status}: ${err}`);
        }

        // Small delay between chunks to avoid rate limiting
        if (chunks.length > 1) {
            await sleep(500);
        }
    }
}

/** Split text into chunks respecting Telegram's 4096 char limit. */
function splitMessage(text: string): string[] {
    if (text.length <= MAX_MESSAGE_LENGTH) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= MAX_MESSAGE_LENGTH) {
            chunks.push(remaining);
            break;
        }

        // Find a good split point (newline near the limit)
        let splitAt = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
        if (splitAt < MAX_MESSAGE_LENGTH * 0.5) {
            splitAt = MAX_MESSAGE_LENGTH;
        }

        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt);
    }

    return chunks;
}

/** Fetch with 1 retry on failure. */
async function fetchWithRetry(
    url: string,
    init: RequestInit,
    retries = 1,
): Promise<Response> {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, init);
            if (res.ok || i === retries) return res;
            await sleep(1000);
        } catch (err) {
            if (i === retries) throw err;
            await sleep(1000);
        }
    }
    throw new Error("fetchWithRetry: unreachable");
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

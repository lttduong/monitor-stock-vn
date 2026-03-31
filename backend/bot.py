"""
VN Stock Tracker — Telegram Bot
Sends VN stock market updates to Telegram.
Supports: market overview, stock details, finance, volume, funds, news.

Usage:
    1. Copy .env.example to .env and fill in your bot token & chat ID
    2. Run: python bot.py
"""

import os
import logging
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from services.stock_data import StockDataService
from services.message_formatter import MessageFormatter

# ── Load Config ────────────────────────────────────────
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
WATCHLIST = [
    s.strip()
    for s in os.getenv("WATCHLIST", "VCB,FPT,HPG,VNM,VHM,TCB,MWG,VPB,MBB,ACB").split(",")
]
MORNING_H = int(os.getenv("MORNING_REPORT_HOUR", "8"))
MORNING_M = int(os.getenv("MORNING_REPORT_MINUTE", "30"))
MIDDAY_H = int(os.getenv("MIDDAY_REPORT_HOUR", "11"))
MIDDAY_M = int(os.getenv("MIDDAY_REPORT_MINUTE", "30"))
EVENING_H = int(os.getenv("EVENING_REPORT_HOUR", "15"))
EVENING_M = int(os.getenv("EVENING_REPORT_MINUTE", "30"))

# ── Logger ─────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# ── Services ───────────────────────────────────────────
data_service = StockDataService()
formatter = MessageFormatter()

# ── Sample news data ───────────────────────────────────
SAMPLE_NEWS = [
    {
        "title": "VN-Index vượt mốc 1.300 điểm trong phiên giao dịch đầu tuần",
        "title_en": "VN-Index surpasses 1,300 points in first trading session of the week",
        "source": "CafeF", "category": "market", "date": "2026-03-31",
    },
    {
        "title": "Khối ngoại mua ròng hơn 500 tỷ đồng trong tuần qua",
        "title_en": "Foreign investors net buy over 500 billion VND last week",
        "source": "VnExpress", "category": "foreign_flow", "date": "2026-03-30",
    },
    {
        "title": "FPT công bố kết quả kinh doanh quý I/2026 tăng trưởng 25%",
        "title_en": "FPT reports Q1/2026 business results with 25% growth",
        "source": "VietStock", "category": "earnings", "date": "2026-03-29",
    },
    {
        "title": "NHNN giữ nguyên lãi suất điều hành, hỗ trợ thị trường tài chính",
        "title_en": "SBV maintains policy rate, supporting financial markets",
        "source": "CafeF", "category": "macro", "date": "2026-03-28",
    },
    {
        "title": "Dòng tiền đổ mạnh vào nhóm cổ phiếu công nghệ Việt Nam",
        "title_en": "Strong capital flows into Vietnam technology stocks",
        "source": "CafeF", "category": "sector", "date": "2026-03-27",
    },
    {
        "title": "Quỹ ETF VanEck tiếp tục rót vốn vào thị trường Việt Nam",
        "title_en": "VanEck ETF continues to pour capital into Vietnam market",
        "source": "VnExpress", "category": "fund", "date": "2026-03-26",
    },
]


# ═══════════════════════════════════════════════════════
#  COMMAND HANDLERS
# ═══════════════════════════════════════════════════════

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command."""
    await update.message.reply_text(
        formatter.format_help(),
        parse_mode="HTML",
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command."""
    await update.message.reply_text(
        formatter.format_help(),
        parse_mode="HTML",
    )


async def cmd_market(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /market — Market overview for watchlist stocks."""
    await update.message.reply_text("⏳ <i>Fetching market data...</i>", parse_mode="HTML")
    try:
        price_df = data_service.get_price_board(WATCHLIST)
        msg = formatter.format_market_overview(price_df, WATCHLIST)
        await update.message.reply_text(msg, parse_mode="HTML")
    except Exception as e:
        logger.error(f"Market error: {e}")
        await update.message.reply_text(f"❌ Error fetching market data: {e}")


async def cmd_price(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /price SYMBOL — Quick price check."""
    if not context.args:
        await update.message.reply_text("Usage: /price VCB")
        return

    symbol = context.args[0].upper()
    await update.message.reply_text(f"⏳ <i>Fetching price for {symbol}...</i>", parse_mode="HTML")
    try:
        price_df = data_service.get_price_board([symbol])
        msg = formatter.format_market_overview(price_df, [symbol])
        await update.message.reply_text(msg, parse_mode="HTML")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {e}")


async def cmd_detail(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /detail SYMBOL — Detailed stock information."""
    if not context.args:
        await update.message.reply_text("Usage: /detail VCB")
        return

    symbol = context.args[0].upper()
    await update.message.reply_text(f"⏳ <i>Loading details for {symbol}...</i>", parse_mode="HTML")
    try:
        overview = data_service.get_stock_overview(symbol)
        history = data_service.get_stock_history(symbol, days=30)
        msg = formatter.format_stock_detail(symbol, overview, history)
        await update.message.reply_text(msg, parse_mode="HTML")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {e}")


async def cmd_finance(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /finance SYMBOL — Financial report."""
    if not context.args:
        await update.message.reply_text("Usage: /finance VCB")
        return

    symbol = context.args[0].upper()
    await update.message.reply_text(f"⏳ <i>Loading financials for {symbol}...</i>", parse_mode="HTML")
    try:
        ratios = data_service.get_ratios(symbol)
        income = data_service.get_income_statement(symbol)
        msg = formatter.format_finance_report(symbol, ratios, income)
        await update.message.reply_text(msg, parse_mode="HTML")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {e}")


async def cmd_ratios(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /ratios SYMBOL — Financial ratios only."""
    if not context.args:
        await update.message.reply_text("Usage: /ratios VCB")
        return

    symbol = context.args[0].upper()
    await update.message.reply_text(f"⏳ <i>Loading ratios for {symbol}...</i>", parse_mode="HTML")
    try:
        ratios = data_service.get_ratios(symbol)
        import pandas as pd
        msg = formatter.format_finance_report(symbol, ratios, pd.DataFrame())
        await update.message.reply_text(msg, parse_mode="HTML")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {e}")


async def cmd_volume(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /volume [SYMBOL] — Volume analysis."""
    symbols = [context.args[0].upper()] if context.args else WATCHLIST
    await update.message.reply_text("⏳ <i>Analyzing volumes...</i>", parse_mode="HTML")
    try:
        analyses = []
        for s in symbols[:10]:
            analysis = data_service.get_volume_analysis(s)
            if "error" not in analysis:
                analyses.append(analysis)
        msg = formatter.format_volume_report(analyses)
        await update.message.reply_text(msg, parse_mode="HTML")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {e}")


async def cmd_funds(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /funds — Mutual fund listings."""
    await update.message.reply_text("⏳ <i>Loading fund data...</i>", parse_mode="HTML")
    try:
        funds = data_service.get_fund_listing(top_n=10)
        msg = formatter.format_fund_report(funds)
        await update.message.reply_text(msg, parse_mode="HTML")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {e}")


async def cmd_news(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /news — Latest market news."""
    msg = formatter.format_news_report(SAMPLE_NEWS)
    await update.message.reply_text(msg, parse_mode="HTML")


async def cmd_watchlist(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /watchlist — Show current watchlist."""
    msg = formatter.format_watchlist(WATCHLIST)
    await update.message.reply_text(msg, parse_mode="HTML")


async def cmd_addwatch(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /addwatch SYMBOL — Add stock to watchlist."""
    if not context.args:
        await update.message.reply_text("Usage: /addwatch VCB")
        return
    symbol = context.args[0].upper()
    if symbol not in WATCHLIST:
        WATCHLIST.append(symbol)
        await update.message.reply_text(
            f"✅ Added <b>{symbol}</b> to watchlist\n\n"
            f"📋 Watchlist: {', '.join(WATCHLIST)}",
            parse_mode="HTML",
        )
    else:
        await update.message.reply_text(f"ℹ️ {symbol} is already in your watchlist")


async def cmd_rmwatch(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /rmwatch SYMBOL — Remove stock from watchlist."""
    if not context.args:
        await update.message.reply_text("Usage: /rmwatch VCB")
        return
    symbol = context.args[0].upper()
    if symbol in WATCHLIST:
        WATCHLIST.remove(symbol)
        await update.message.reply_text(
            f"🗑️ Removed <b>{symbol}</b> from watchlist\n\n"
            f"📋 Watchlist: {', '.join(WATCHLIST)}",
            parse_mode="HTML",
        )
    else:
        await update.message.reply_text(f"ℹ️ {symbol} is not in your watchlist")


# ═══════════════════════════════════════════════════════
#  SCHEDULED REPORTS
# ═══════════════════════════════════════════════════════

async def scheduled_morning_report(context: ContextTypes.DEFAULT_TYPE):
    """Morning report — market overview + news."""
    logger.info("Sending morning report...")
    try:
        # News
        news_msg = formatter.format_news_report(SAMPLE_NEWS)
        await context.bot.send_message(
            chat_id=CHAT_ID, text=news_msg, parse_mode="HTML"
        )

        # Market overview
        price_df = data_service.get_price_board(WATCHLIST)
        market_msg = formatter.format_market_overview(price_df, WATCHLIST)
        await context.bot.send_message(
            chat_id=CHAT_ID, text=market_msg, parse_mode="HTML"
        )
    except Exception as e:
        logger.error(f"Morning report error: {e}")


async def scheduled_midday_report(context: ContextTypes.DEFAULT_TYPE):
    """Midday report — price update + volume highlights."""
    logger.info("Sending midday report...")
    try:
        # Price update
        price_df = data_service.get_price_board(WATCHLIST)
        market_msg = formatter.format_market_overview(price_df, WATCHLIST)
        await context.bot.send_message(
            chat_id=CHAT_ID, text=market_msg, parse_mode="HTML"
        )

        # Volume analysis
        analyses = []
        for s in WATCHLIST[:5]:  # Top 5 from watchlist
            analysis = data_service.get_volume_analysis(s)
            if "error" not in analysis:
                analyses.append(analysis)
        if analyses:
            vol_msg = formatter.format_volume_report(analyses)
            await context.bot.send_message(
                chat_id=CHAT_ID, text=vol_msg, parse_mode="HTML"
            )
    except Exception as e:
        logger.error(f"Midday report error: {e}")


async def scheduled_evening_report(context: ContextTypes.DEFAULT_TYPE):
    """Evening report — full summary with finance highlights."""
    logger.info("Sending evening report...")
    try:
        # Market close summary
        price_df = data_service.get_price_board(WATCHLIST)
        market_msg = formatter.format_market_overview(price_df, WATCHLIST)
        await context.bot.send_message(
            chat_id=CHAT_ID, text=market_msg, parse_mode="HTML"
        )

        # Volume analysis
        analyses = []
        for s in WATCHLIST[:10]:
            analysis = data_service.get_volume_analysis(s)
            if "error" not in analysis:
                analyses.append(analysis)
        if analyses:
            vol_msg = formatter.format_volume_report(analyses)
            await context.bot.send_message(
                chat_id=CHAT_ID, text=vol_msg, parse_mode="HTML"
            )

        # Fund update (weekly on Monday)
        from datetime import datetime
        if datetime.now().weekday() == 0:
            funds = data_service.get_fund_listing(top_n=10)
            fund_msg = formatter.format_fund_report(funds)
            await context.bot.send_message(
                chat_id=CHAT_ID, text=fund_msg, parse_mode="HTML"
            )
    except Exception as e:
        logger.error(f"Evening report error: {e}")


# ═══════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════

def main():
    """Start the bot."""
    if not BOT_TOKEN or BOT_TOKEN == "YOUR_BOT_TOKEN_HERE":
        print("=" * 50)
        print("❌  TELEGRAM BOT TOKEN NOT CONFIGURED!")
        print("=" * 50)
        print()
        print("Please set up your .env file:")
        print("  1. Copy .env.example to .env")
        print("     cp ../.env.example ../.env")
        print()
        print("  2. Create a bot via @BotFather on Telegram")
        print("  3. Paste the token in .env as TELEGRAM_BOT_TOKEN")
        print()
        print("  4. Get your Chat ID via @userinfobot on Telegram")
        print("  5. Paste it in .env as TELEGRAM_CHAT_ID")
        print()
        print("  6. Run again: python bot.py")
        print("=" * 50)
        return

    print("🚀 Starting VN Stock Tracker Bot...")
    print(f"📋 Watchlist: {', '.join(WATCHLIST)}")
    print(f"⏰ Morning report:  {MORNING_H:02d}:{MORNING_M:02d}")
    print(f"⏰ Midday report:   {MIDDAY_H:02d}:{MIDDAY_M:02d}")
    print(f"⏰ Evening report:  {EVENING_H:02d}:{EVENING_M:02d}")
    print()

    # Build application
    app = Application.builder().token(BOT_TOKEN).build()

    # Register command handlers
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("market", cmd_market))
    app.add_handler(CommandHandler("price", cmd_price))
    app.add_handler(CommandHandler("detail", cmd_detail))
    app.add_handler(CommandHandler("finance", cmd_finance))
    app.add_handler(CommandHandler("ratios", cmd_ratios))
    app.add_handler(CommandHandler("volume", cmd_volume))
    app.add_handler(CommandHandler("funds", cmd_funds))
    app.add_handler(CommandHandler("news", cmd_news))
    app.add_handler(CommandHandler("watchlist", cmd_watchlist))
    app.add_handler(CommandHandler("addwatch", cmd_addwatch))
    app.add_handler(CommandHandler("rmwatch", cmd_rmwatch))

    # Schedule reports (only if CHAT_ID is set)
    if CHAT_ID and CHAT_ID != "YOUR_CHAT_ID_HERE":
        job_queue = app.job_queue

        # Morning report — daily at configured time (Mon-Fri)
        from datetime import time as dt_time
        import pytz

        tz = pytz.timezone("Asia/Ho_Chi_Minh")

        job_queue.run_daily(
            scheduled_morning_report,
            time=dt_time(hour=MORNING_H, minute=MORNING_M, tzinfo=tz),
            days=(0, 1, 2, 3, 4),  # Mon-Fri
            name="morning_report",
        )

        job_queue.run_daily(
            scheduled_midday_report,
            time=dt_time(hour=MIDDAY_H, minute=MIDDAY_M, tzinfo=tz),
            days=(0, 1, 2, 3, 4),
            name="midday_report",
        )

        job_queue.run_daily(
            scheduled_evening_report,
            time=dt_time(hour=EVENING_H, minute=EVENING_M, tzinfo=tz),
            days=(0, 1, 2, 3, 4),
            name="evening_report",
        )

        print("✅ Scheduled reports configured (Mon-Fri)")
    else:
        print("⚠️  CHAT_ID not set — scheduled reports disabled")
        print("   Set TELEGRAM_CHAT_ID in .env for auto-reports")

    print()
    print("✅ Bot is running! Send /help to your bot on Telegram.")
    print("   Press Ctrl+C to stop.")

    # Start polling
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()

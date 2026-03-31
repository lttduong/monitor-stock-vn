"""
Telegram Message Formatter — Formats stock data into beautiful Telegram messages.
Uses HTML parse mode for rich formatting.
"""

import pandas as pd
from typing import Dict, List, Any
from datetime import datetime


class MessageFormatter:
    """Formats stock data into Telegram-friendly HTML messages."""

    @staticmethod
    def format_number(n, decimals=0) -> str:
        if n is None or (isinstance(n, float) and pd.isna(n)):
            return "—"
        n = float(n)
        if abs(n) >= 1e12:
            return f"{n/1e12:.2f}T"
        if abs(n) >= 1e9:
            return f"{n/1e9:.2f}B"
        if abs(n) >= 1e6:
            return f"{n/1e6:.2f}M"
        if abs(n) >= 1e3:
            return f"{n/1e3:.1f}K"
        if decimals > 0:
            return f"{n:.{decimals}f}"
        return f"{n:,.0f}"

    @staticmethod
    def change_emoji(val) -> str:
        if val is None:
            return "⚪"
        val = float(val)
        if val > 0:
            return "🟢"
        elif val < 0:
            return "🔴"
        return "🟡"

    @staticmethod
    def trend_bar(val, max_val=100, width=10) -> str:
        """Create a simple text-based progress bar."""
        if val is None or max_val == 0:
            return "░" * width
        ratio = min(abs(float(val)) / float(max_val), 1.0)
        filled = int(ratio * width)
        return "█" * filled + "░" * (width - filled)

    # ── Market Overview Report ─────────────────────────

    def format_market_overview(self, price_data: pd.DataFrame, watchlist: List[str]) -> str:
        """Format a comprehensive market overview message."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        msg = f"📊 <b>VN STOCK MARKET UPDATE</b>\n"
        msg += f"🕐 <i>{now}</i>\n"
        msg += "━" * 32 + "\n\n"

        if price_data.empty:
            msg += "⚠️ <i>Unable to fetch market data at this time.</i>\n"
            return msg

        # Try to find relevant columns
        cols = {}
        for c in price_data.columns:
            cl = str(c).lower().replace(" ", "_")
            if "listing_symbol" in cl or cl == "ticker" or cl == "symbol":
                cols["symbol"] = c
            elif "match_price" in cl or cl == "close" or cl == "price":
                cols["price"] = c
            elif "price_change" in cl or cl == "change":
                cols["change"] = c
            elif "percent_change" in cl or "pct" in cl:
                cols["pct"] = c
            elif "total_volume" in cl or cl == "volume":
                cols["volume"] = c
            elif "highest_price" in cl or cl == "high":
                cols["high"] = c
            elif "lowest_price" in cl or cl == "low":
                cols["low"] = c

        for _, row in price_data.iterrows():
            symbol = str(row.get(cols.get("symbol", ""), "---"))
            if symbol not in watchlist and watchlist:
                continue

            price = row.get(cols.get("price", ""), 0)
            change = row.get(cols.get("change", ""), 0)
            pct = row.get(cols.get("pct", ""), 0)
            volume = row.get(cols.get("volume", ""), 0)
            high = row.get(cols.get("high", ""), 0)
            low = row.get(cols.get("low", ""), 0)

            emoji = self.change_emoji(change)
            change_str = f"+{change}" if change and float(change) > 0 else str(change)
            pct_str = f"+{pct:.2f}%" if pct and float(pct) > 0 else f"{pct:.2f}%" if pct else "0.00%"

            msg += f"{emoji} <b>{symbol}</b>\n"
            msg += f"   💰 Price: <code>{self.format_number(price)}</code>"
            msg += f"  ({change_str} | {pct_str})\n"
            msg += f"   📊 Vol: <code>{self.format_number(volume)}</code>"
            msg += f"  H: <code>{self.format_number(high)}</code>"
            msg += f"  L: <code>{self.format_number(low)}</code>\n\n"

        msg += "━" * 32 + "\n"
        msg += "🤖 <i>VN Stock Tracker Bot</i>"
        return msg

    # ── Stock Detail Report ────────────────────────────

    def format_stock_detail(self, symbol: str, overview: Dict, history: pd.DataFrame) -> str:
        """Format detailed stock information."""
        msg = f"🔍 <b>STOCK DETAIL: {symbol}</b>\n"
        msg += "━" * 32 + "\n\n"

        # Overview
        if overview and "error" not in overview:
            name = overview.get("short_name") or overview.get("organ_name") or overview.get("company_name") or ""
            exchange = overview.get("exchange", "")
            industry = overview.get("industry", "")
            market_cap = overview.get("market_cap", 0)

            msg += f"🏢 <b>{name}</b>\n"
            if exchange:
                msg += f"📍 Exchange: {exchange}\n"
            if industry:
                msg += f"🏭 Industry: {industry}\n"
            if market_cap:
                msg += f"💎 Market Cap: <code>{self.format_number(market_cap)}</code>\n"
            msg += "\n"

        # Price summary from history
        if not history.empty:
            close_col = None
            for c in history.columns:
                if str(c).lower() == "close":
                    close_col = c
                    break

            if close_col:
                closes = history[close_col].astype(float)
                latest = closes.iloc[-1]
                prev = closes.iloc[-2] if len(closes) > 1 else latest
                change = latest - prev
                pct = (change / prev * 100) if prev != 0 else 0
                high_52 = closes.max()
                low_52 = closes.min()

                msg += f"📈 <b>Price Summary (30D)</b>\n"
                msg += f"   Latest: <code>{self.format_number(latest)}</code>"
                msg += f"  {self.change_emoji(change)} {change:+.0f} ({pct:+.2f}%)\n"
                msg += f"   30D High: <code>{self.format_number(high_52)}</code>\n"
                msg += f"   30D Low:  <code>{self.format_number(low_52)}</code>\n\n"

        msg += "━" * 32 + "\n"
        msg += "🤖 <i>VN Stock Tracker Bot</i>"
        return msg

    # ── Finance Report ─────────────────────────────────

    def format_finance_report(
        self, symbol: str, ratios: pd.DataFrame, income: pd.DataFrame
    ) -> str:
        """Format financial analysis report."""
        msg = f"💰 <b>FINANCIAL REPORT: {symbol}</b>\n"
        msg += "━" * 32 + "\n\n"

        # Key Ratios
        if not ratios.empty:
            msg += "📊 <b>Key Ratios</b>\n"
            # Show last row (most recent period)
            latest = ratios.iloc[-1] if len(ratios) > 0 else None
            if latest is not None:
                for col in ratios.columns[:12]:  # Limit to top 12 ratios
                    val = latest.get(col)
                    if val is not None and not (isinstance(val, float) and pd.isna(val)):
                        col_name = str(col).replace("_", " ").title()
                        if isinstance(val, (int, float)):
                            msg += f"   • {col_name}: <code>{val:.4f}</code>\n"
                        else:
                            msg += f"   • {col_name}: <code>{val}</code>\n"
            msg += "\n"

        # Income highlights
        if not income.empty:
            msg += "📈 <b>Income Statement (Latest)</b>\n"
            latest = income.iloc[-1] if len(income) > 0 else None
            if latest is not None:
                for col in income.columns[:8]:
                    val = latest.get(col)
                    if val is not None and not (isinstance(val, float) and pd.isna(val)):
                        col_name = str(col).replace("_", " ").title()
                        if isinstance(val, (int, float)):
                            msg += f"   • {col_name}: <code>{self.format_number(val)}</code>\n"
                        else:
                            msg += f"   • {col_name}: <code>{val}</code>\n"
            msg += "\n"

        if ratios.empty and income.empty:
            msg += "⚠️ <i>No financial data available.</i>\n"

        msg += "━" * 32 + "\n"
        msg += "🤖 <i>VN Stock Tracker Bot</i>"
        return msg

    # ── Volume Report ──────────────────────────────────

    def format_volume_report(self, analyses: List[Dict[str, Any]]) -> str:
        """Format volume analysis for watchlist."""
        msg = "📊 <b>VOLUME ANALYSIS</b>\n"
        msg += f"🕐 <i>{datetime.now().strftime('%Y-%m-%d %H:%M')}</i>\n"
        msg += "━" * 32 + "\n\n"

        if not analyses:
            msg += "⚠️ <i>No volume data available.</i>\n"
            return msg

        for data in analyses:
            if "error" in data:
                continue
            symbol = data["symbol"]
            avg_vol = data["avg_volume"]
            latest_vol = data["latest_volume"]
            ratio = data["volume_ratio"]
            trend = data["trend"]
            spikes = data["spike_count"]

            # Volume ratio indicator
            if ratio > 2:
                vol_emoji = "🔥"
                vol_alert = " <b>HIGH VOLUME!</b>"
            elif ratio > 1.5:
                vol_emoji = "⚡"
                vol_alert = " <b>Above avg</b>"
            elif ratio < 0.5:
                vol_emoji = "💤"
                vol_alert = " <i>Low activity</i>"
            else:
                vol_emoji = "📊"
                vol_alert = ""

            msg += f"{vol_emoji} <b>{symbol}</b>{vol_alert}\n"
            msg += f"   Latest: <code>{self.format_number(latest_vol)}</code>"
            msg += f"  Avg: <code>{self.format_number(avg_vol)}</code>\n"
            msg += f"   Ratio: <code>{ratio}x</code>"
            msg += f"  {trend}"
            msg += f"  Spikes: {spikes}\n"
            msg += f"   {self.trend_bar(ratio, 3)}\n\n"

        msg += "━" * 32 + "\n"
        msg += "🤖 <i>VN Stock Tracker Bot</i>"
        return msg

    # ── Fund Report ────────────────────────────────────

    def format_fund_report(self, funds: pd.DataFrame) -> str:
        """Format mutual fund listing."""
        msg = "🌐 <b>FUND INVESTMENT UPDATE</b>\n"
        msg += f"🕐 <i>{datetime.now().strftime('%Y-%m-%d %H:%M')}</i>\n"
        msg += "━" * 32 + "\n\n"

        if funds.empty:
            msg += "⚠️ <i>No fund data available.</i>\n"
            return msg

        for i, (_, row) in enumerate(funds.iterrows()):
            if i >= 10:  # Max 10 funds per message
                break

            # Try to find common column names
            name = ""
            nav = ""
            fund_type = ""
            for c in funds.columns:
                cl = str(c).lower()
                if "name" in cl and not name:
                    name = str(row[c])[:40]
                elif "nav" in cl and not nav:
                    nav = row[c]
                elif "type" in cl and not fund_type:
                    fund_type = str(row[c])

            if not name:
                name = str(row.iloc[0])[:40] if len(row) > 0 else f"Fund #{i+1}"

            msg += f"🏦 <b>{name}</b>\n"
            if fund_type:
                msg += f"   Type: {fund_type}\n"
            if nav:
                msg += f"   NAV: <code>{self.format_number(nav, 2)}</code>\n"
            msg += "\n"

        msg += "━" * 32 + "\n"
        msg += "🤖 <i>VN Stock Tracker Bot</i>"
        return msg

    # ── News Report ────────────────────────────────────

    def format_news_report(self, news_items: List[Dict[str, Any]]) -> str:
        """Format news update."""
        msg = "📰 <b>MARKET NEWS</b>\n"
        msg += f"🕐 <i>{datetime.now().strftime('%Y-%m-%d %H:%M')}</i>\n"
        msg += "━" * 32 + "\n\n"

        if not news_items:
            msg += "⚠️ <i>No news available.</i>\n"
            return msg

        for i, item in enumerate(news_items[:8]):  # Max 8 news items
            category_emojis = {
                "market": "📈",
                "company": "🏢",
                "sector": "🏭",
                "macro": "🏛️",
                "foreign_flow": "🌍",
                "earnings": "💼",
                "fund": "🏦",
            }
            emoji = category_emojis.get(item.get("category", ""), "📌")
            title = item.get("title", "")
            source = item.get("source", "")
            date = item.get("date", "")

            msg += f"{emoji} <b>{title}</b>\n"
            if item.get("title_en"):
                msg += f"   <i>{item['title_en']}</i>\n"
            msg += f"   📰 {source} • {date}\n\n"

        msg += "━" * 32 + "\n"
        msg += "🤖 <i>VN Stock Tracker Bot</i>"
        return msg

    # ── Help Message ───────────────────────────────────

    @staticmethod
    def format_help() -> str:
        return (
            "🤖 <b>VN Stock Tracker Bot</b>\n"
            "━" * 32 + "\n\n"
            "📌 <b>Available Commands:</b>\n\n"
            "📊 <b>Market & Prices</b>\n"
            "  /market — Market overview (watchlist)\n"
            "  /price VCB — Current price for a stock\n"
            "  /detail VCB — Detailed stock info\n\n"
            "💰 <b>Finance</b>\n"
            "  /finance VCB — Financial report\n"
            "  /ratios VCB — Key financial ratios\n\n"
            "📊 <b>Volume</b>\n"
            "  /volume — Volume analysis (watchlist)\n"
            "  /volume HPG — Volume for specific stock\n\n"
            "🌐 <b>Funds</b>\n"
            "  /funds — Top mutual fund listings\n\n"
            "📰 <b>News</b>\n"
            "  /news — Latest market news\n\n"
            "⚙️ <b>Settings</b>\n"
            "  /watchlist — Show current watchlist\n"
            "  /addwatch VCB — Add stock to watchlist\n"
            "  /rmwatch VCB — Remove from watchlist\n"
            "  /help — Show this help message\n\n"
            "━" * 32 + "\n"
            "💡 <i>Scheduled reports are sent at 8:30, 11:30, and 15:30 daily.</i>"
        )

    @staticmethod
    def format_watchlist(symbols: List[str]) -> str:
        msg = "👀 <b>YOUR WATCHLIST</b>\n"
        msg += "━" * 32 + "\n\n"
        for i, s in enumerate(symbols, 1):
            msg += f"  {i}. <code>{s}</code>\n"
        msg += f"\n📊 Total: {len(symbols)} stocks\n"
        msg += "━" * 32 + "\n"
        msg += "💡 Use /addwatch SYMBOL or /rmwatch SYMBOL to manage"
        return msg

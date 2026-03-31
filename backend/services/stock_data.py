"""
VN Stock Data Service — Collects stock data using vnstock library.
Provides: price history, company overview, financial reports, volume analysis, fund data.
"""

import pandas as pd
import numpy as np
from vnstock import Vnstock, Quote, Company, Finance, Trading
from typing import Dict, List, Any, Optional
import traceback
from datetime import datetime, timedelta


class StockDataService:
    """Unified service for all Vietnamese stock market data."""

    # ── Stock Price & Overview ──────────────────────────

    def get_stock_overview(self, symbol: str) -> Dict[str, Any]:
        """Get company overview for a stock symbol."""
        try:
            company = Company(symbol=symbol, source="TCBS")
            overview = company.overview()
            if overview is not None and not overview.empty:
                return overview.to_dict(orient="records")[0]
            return {"symbol": symbol, "error": "No data"}
        except Exception as e:
            return {"symbol": symbol, "error": str(e)}

    def get_stock_history(
        self, symbol: str, days: int = 30, interval: str = "1D"
    ) -> pd.DataFrame:
        """Get historical price data."""
        try:
            end = datetime.now().strftime("%Y-%m-%d")
            start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
            quote = Quote(symbol=symbol, source="VCI")
            df = quote.history(start=start, end=end, interval=interval)
            return df if df is not None else pd.DataFrame()
        except Exception as e:
            traceback.print_exc()
            return pd.DataFrame()

    def get_price_board(self, symbols: List[str]) -> pd.DataFrame:
        """Get current price board for multiple stocks."""
        try:
            trading = Trading(source="VCI")
            df = trading.price_board(symbols)
            return df if df is not None else pd.DataFrame()
        except Exception as e:
            traceback.print_exc()
            return pd.DataFrame()

    # ── Financial Reports ──────────────────────────────

    def get_income_statement(self, symbol: str, period: str = "year") -> pd.DataFrame:
        """Get income statement."""
        try:
            finance = Finance(symbol=symbol, source="TCBS")
            df = finance.income_statement(period=period)
            return df if df is not None else pd.DataFrame()
        except Exception:
            return pd.DataFrame()

    def get_balance_sheet(self, symbol: str, period: str = "year") -> pd.DataFrame:
        """Get balance sheet."""
        try:
            finance = Finance(symbol=symbol, source="TCBS")
            df = finance.balance_sheet(period=period)
            return df if df is not None else pd.DataFrame()
        except Exception:
            return pd.DataFrame()

    def get_cash_flow(self, symbol: str, period: str = "year") -> pd.DataFrame:
        """Get cash flow statement."""
        try:
            finance = Finance(symbol=symbol, source="TCBS")
            df = finance.cash_flow(period=period)
            return df if df is not None else pd.DataFrame()
        except Exception:
            return pd.DataFrame()

    def get_ratios(self, symbol: str, period: str = "year") -> pd.DataFrame:
        """Get financial ratios."""
        try:
            finance = Finance(symbol=symbol, source="TCBS")
            df = finance.ratio(period=period, lang="en")
            return df if df is not None else pd.DataFrame()
        except Exception:
            return pd.DataFrame()

    # ── Volume Analysis ────────────────────────────────

    def get_volume_analysis(self, symbol: str, days: int = 90) -> Dict[str, Any]:
        """Analyze trading volume patterns."""
        try:
            df = self.get_stock_history(symbol, days=days)
            if df.empty:
                return {"symbol": symbol, "error": "No data"}

            # Find column names (case-insensitive)
            col_map = {}
            for c in df.columns:
                cl = str(c).lower()
                if cl == "volume":
                    col_map["volume"] = c
                elif cl == "close":
                    col_map["close"] = c

            if "volume" not in col_map:
                return {"symbol": symbol, "error": "No volume data"}

            volumes = df[col_map["volume"]].astype(float)
            avg_vol = float(volumes.mean())
            latest_vol = float(volumes.iloc[-1]) if len(volumes) > 0 else 0
            max_vol = float(volumes.max())

            # Volume spikes (> 2x average)
            spike_count = int((volumes > avg_vol * 2).sum())
            vol_ratio = round(latest_vol / avg_vol, 2) if avg_vol > 0 else 0
            trend = "📈 Increasing" if latest_vol > avg_vol else "📉 Decreasing"

            return {
                "symbol": symbol,
                "avg_volume": avg_vol,
                "latest_volume": latest_vol,
                "max_volume": max_vol,
                "volume_ratio": vol_ratio,
                "trend": trend,
                "spike_count": spike_count,
            }
        except Exception as e:
            return {"symbol": symbol, "error": str(e)}

    # ── Fund Data ──────────────────────────────────────

    def get_fund_listing(self, top_n: int = 10) -> pd.DataFrame:
        """Get mutual fund listings."""
        try:
            from vnstock.explorer.fmarket.fund import Fund
            fund = Fund()
            df = fund.listing()
            if df is not None and not df.empty:
                return df.head(top_n)
            return pd.DataFrame()
        except Exception:
            return pd.DataFrame()

    # ── Search ─────────────────────────────────────────

    def search_stocks(self, query: str) -> List[Dict[str, Any]]:
        """Search stocks by symbol or name."""
        try:
            stock = Vnstock()
            df = stock.stock(symbol="ACB", source="VCI").listing.all_symbols()
            if df is not None and not df.empty:
                query_upper = query.upper()
                mask = df.apply(
                    lambda row: any(
                        query_upper in str(val).upper() for val in row.values
                    ),
                    axis=1,
                )
                filtered = df[mask].head(10)
                return filtered.to_dict(orient="records")
            return []
        except Exception:
            return []

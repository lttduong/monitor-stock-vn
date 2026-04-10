-- VN Stock Volume Tracker — D1 Schema
-- Top 100 stocks by liquidity with sector classification

CREATE TABLE IF NOT EXISTS stocks (
  symbol TEXT PRIMARY KEY,
  sector TEXT NOT NULL,
  name TEXT
);

CREATE TABLE IF NOT EXISTS daily_volumes (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  close_price REAL,
  volume INTEGER,
  PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_volumes_date ON daily_volumes(date);
CREATE INDEX IF NOT EXISTS idx_volumes_symbol ON daily_volumes(symbol);

-- Seed top 100 HOSE stocks by liquidity with sector classification
INSERT OR IGNORE INTO stocks (symbol, sector) VALUES
-- Ngân hàng (Banks)
('VCB', 'Ngân hàng'), ('TCB', 'Ngân hàng'), ('MBB', 'Ngân hàng'),
('ACB', 'Ngân hàng'), ('VPB', 'Ngân hàng'), ('BID', 'Ngân hàng'),
('CTG', 'Ngân hàng'), ('STB', 'Ngân hàng'), ('HDB', 'Ngân hàng'),
('TPB', 'Ngân hàng'), ('SHB', 'Ngân hàng'), ('LPB', 'Ngân hàng'),
('MSB', 'Ngân hàng'), ('EIB', 'Ngân hàng'), ('OCB', 'Ngân hàng'),
-- Bất động sản (Real Estate)
('VHM', 'Bất động sản'), ('VIC', 'Bất động sản'), ('NVL', 'Bất động sản'),
('KDH', 'Bất động sản'), ('DXG', 'Bất động sản'), ('PDR', 'Bất động sản'),
('NLG', 'Bất động sản'), ('DIG', 'Bất động sản'), ('KBC', 'Bất động sản'),
('IJC', 'Bất động sản'), ('HDG', 'Bất động sản'), ('VRE', 'Bất động sản'),
-- Chứng khoán (Securities)
('SSI', 'Chứng khoán'), ('VND', 'Chứng khoán'), ('HCM', 'Chứng khoán'),
('VCI', 'Chứng khoán'), ('SHS', 'Chứng khoán'), ('MBS', 'Chứng khoán'),
('FTS', 'Chứng khoán'), ('TVS', 'Chứng khoán'),
-- Thép & Vật liệu (Steel & Materials)
('HPG', 'Thép'), ('HSG', 'Thép'), ('NKG', 'Thép'),
('TLH', 'Thép'), ('SMC', 'Thép'),
-- Công nghệ (Technology)
('FPT', 'Công nghệ'), ('CMG', 'Công nghệ'), ('CTR', 'Công nghệ'),
-- Thực phẩm & Đồ uống (Food & Beverage)
('VNM', 'Thực phẩm'), ('MSN', 'Thực phẩm'), ('SAB', 'Thực phẩm'),
('KDC', 'Thực phẩm'), ('QNS', 'Thực phẩm'),
-- Bán lẻ (Retail)
('MWG', 'Bán lẻ'), ('FRT', 'Bán lẻ'), ('PNJ', 'Bán lẻ'),
('DGW', 'Bán lẻ'),
-- Dầu khí & Năng lượng (Oil & Energy)
('GAS', 'Dầu khí'), ('PLX', 'Dầu khí'), ('PVD', 'Dầu khí'),
('PVS', 'Dầu khí'), ('BSR', 'Dầu khí'), ('POW', 'Điện'),
('GEX', 'Điện'), ('REE', 'Điện'), ('PC1', 'Điện'), ('NT2', 'Điện'),
-- Xây dựng & Hạ tầng (Construction)
('CTD', 'Xây dựng'), ('HHV', 'Xây dựng'), ('VCG', 'Xây dựng'),
('FCN', 'Xây dựng'),
-- Hóa chất & Phân bón (Chemicals)
('DPM', 'Hóa chất'), ('DCM', 'Hóa chất'), ('DGC', 'Hóa chất'),
('CSV', 'Hóa chất'),
-- Logistics & Vận tải (Logistics)
('GMD', 'Logistics'), ('HAH', 'Logistics'), ('VTP', 'Logistics'),
('VOS', 'Logistics'),
-- Thủy sản (Seafood)
('VHC', 'Thủy sản'), ('ANV', 'Thủy sản'), ('IDI', 'Thủy sản'),
-- Cao su & Nông nghiệp (Rubber & Agriculture)
('PHR', 'Cao su'), ('DPR', 'Cao su'), ('HAG', 'Nông nghiệp'),
-- Dệt may (Textiles)
('TCM', 'Dệt may'), ('STK', 'Dệt may'),
-- Bảo hiểm (Insurance)
('BVH', 'Bảo hiểm'), ('BMI', 'Bảo hiểm'),
-- Khác (Others)
('VGC', 'Vật liệu XD'), ('HVN', 'Hàng không'),
('VJC', 'Hàng không'), ('ACV', 'Hàng không'),
('SCS', 'Hàng không'), ('BWE', 'Nước'),
('TNG', 'Dệt may'), ('VIB', 'Ngân hàng'),
('NAB', 'Ngân hàng'), ('BAF', 'Nông nghiệp'),
('DBC', 'Nông nghiệp'), ('PAN', 'Nông nghiệp'),
('VNS', 'Thủy sản'), ('CII', 'Hạ tầng');

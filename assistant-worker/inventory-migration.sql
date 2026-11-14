CREATE TABLE IF NOT EXISTS inventory_products_d1 (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_movements_d1 (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS inventory_movements_d1_created_at
  ON inventory_movements_d1(created_at DESC);

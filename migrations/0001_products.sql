CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  name_en TEXT NOT NULL DEFAULT '' CHECK (length(name_en) <= 120),
  price INTEGER NOT NULL CHECK (price BETWEEN 0 AND 999999999),
  in_stock INTEGER NOT NULL DEFAULT 1 CHECK (in_stock IN (0, 1)),
  image_small_key TEXT NOT NULL UNIQUE,
  image_large_key TEXT NOT NULL UNIQUE,
  image_ratio REAL NOT NULL CHECK (image_ratio BETWEEN 0.2 AND 5),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  ip TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  window_started INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_window ON admin_login_attempts (window_started);

CREATE TABLE IF NOT EXISTS site_profile_images (
  role TEXT PRIMARY KEY CHECK (role IN ('proprietor', 'technician')),
  image_data BLOB NOT NULL,
  image_etag TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) WITHOUT ROWID;

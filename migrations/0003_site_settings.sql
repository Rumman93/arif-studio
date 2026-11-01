CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  shop_name_bn TEXT NOT NULL,
  shop_name_en TEXT NOT NULL,
  proprietor_name_bn TEXT NOT NULL,
  proprietor_name_en TEXT NOT NULL,
  proprietor_phone TEXT NOT NULL,
  servicing_name_bn TEXT NOT NULL,
  servicing_name_en TEXT NOT NULL,
  servicing_phone TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  agent_bkash TEXT NOT NULL DEFAULT '',
  agent_nagad TEXT NOT NULL DEFAULT '',
  agent_rocket TEXT NOT NULL DEFAULT '',
  agent_upay TEXT NOT NULL DEFAULT '',
  facebook TEXT NOT NULL DEFAULT '',
  map_url TEXT NOT NULL,
  address_bn TEXT NOT NULL,
  address_en TEXT NOT NULL,
  hours_open TEXT NOT NULL,
  hours_close TEXT NOT NULL,
  closed_days TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(closed_days)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO site_settings (
  id, shop_name_bn, shop_name_en,
  proprietor_name_bn, proprietor_name_en, proprietor_phone,
  servicing_name_bn, servicing_name_en, servicing_phone,
  email, phone, whatsapp,
  agent_bkash, agent_nagad, agent_rocket, agent_upay,
  facebook, map_url, address_bn, address_en,
  hours_open, hours_close, closed_days
) VALUES (
  1, 'আরিফ স্টুডিও এন্ড টেলিকম', 'Arif Studio & Telecom',
  'আরিফুল ইসলাম', 'Ariful Islam', '01984993221',
  'আশরাফুল', 'Ashraful', '01970779989',
  'arif.patwary35@gmail.com', '01984993221', '01984993221',
  '01970100271', '01750100271', '01639099723', '01970100271',
  '', 'https://maps.app.goo.gl/D1qnpb4jLAiJMfFE9',
  'আয়েশা এম্পোরিয়াম, ফাজিলের ঘাট, দাগনভূঞা, ফেনী',
  'Ayesha Emporium, Faziler Ghat, Daganbhuiyan, Feni',
  '09:00', '22:00', '[]'
);

CREATE TRIGGER IF NOT EXISTS prevent_site_settings_delete
BEFORE DELETE ON site_settings
BEGIN
  SELECT RAISE(ABORT, 'site settings cannot be deleted');
END;

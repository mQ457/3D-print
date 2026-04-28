CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT,
  recipient_name TEXT,
  phone TEXT,
  address_line TEXT NOT NULL,
  city TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_token TEXT NOT NULL,
  card_mask TEXT NOT NULL,
  holder_name TEXT,
  exp_month INTEGER,
  exp_year INTEGER,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_options (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS print_inventory (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  technology_code TEXT,
  material_code TEXT,
  color_code TEXT,
  thickness_mm NUMERIC,
  unit TEXT NOT NULL DEFAULT 'g',
  stock_qty NUMERIC NOT NULL DEFAULT 0,
  reserved_qty NUMERIC NOT NULL DEFAULT 0,
  price_per_cm3 INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_pricing_rules (
  service_type TEXT PRIMARY KEY,
  base_fee INTEGER NOT NULL DEFAULT 0,
  min_price INTEGER NOT NULL DEFAULT 0,
  hour_rate INTEGER NOT NULL DEFAULT 0,
  setup_fee INTEGER NOT NULL DEFAULT 0,
  waste_percent NUMERIC NOT NULL DEFAULT 0,
  support_percent NUMERIC NOT NULL DEFAULT 0,
  machine_hour_rate INTEGER NOT NULL DEFAULT 0,
  default_model_volume_cm3 NUMERIC NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_number TEXT UNIQUE,
  service_type TEXT NOT NULL,
  service_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Новый',
  total_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'RUB',
  details_json TEXT,
  modeling_task TEXT,
  address_id TEXT,
  payment_method_id TEXT,
  file_name TEXT,
  file_path TEXT,
  file_size INTEGER,
  file_ext TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(address_id) REFERENCES user_addresses(id) ON DELETE SET NULL,
  FOREIGN KEY(payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS support_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  sender_id TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(thread_id) REFERENCES support_threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_threads (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  unread_user INTEGER NOT NULL DEFAULT 0,
  unread_admin INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  sender_id TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(thread_id) REFERENCES order_threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  ext TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(message_id) REFERENCES order_messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  admin_id TEXT,
  sender_type TEXT NOT NULL DEFAULT 'admin',
  message TEXT NOT NULL,
  file_name TEXT,
  file_path TEXT,
  file_mime TEXT,
  file_size INTEGER,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON user_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_support_threads_user_id ON support_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_thread_id ON support_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_order_threads_user_id ON order_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_order_threads_last_message_at ON order_threads(last_message_at);
CREATE INDEX IF NOT EXISTS idx_order_messages_thread_id ON order_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_order_attachments_message_id ON order_message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON user_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_options_unique ON service_options(type, code);
CREATE INDEX IF NOT EXISTS idx_print_inventory_type_active ON print_inventory(item_type, active);
CREATE INDEX IF NOT EXISTS idx_print_inventory_tech ON print_inventory(technology_code);
CREATE INDEX IF NOT EXISTS idx_print_inventory_material ON print_inventory(material_code);
CREATE INDEX IF NOT EXISTS idx_print_inventory_sort ON print_inventory(sort_order);

ALTER TABLE print_inventory ADD COLUMN IF NOT EXISTS consumed_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE print_inventory ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC NOT NULL DEFAULT 1000;
ALTER TABLE print_inventory ADD COLUMN IF NOT EXISTS stop_stock_threshold NUMERIC NOT NULL DEFAULT 300;

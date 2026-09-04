SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS rice_and_shine
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rice_and_shine;

-- ----------------------------------------------------------------------------
-- 1. ADMINS
-- Replaces hardcoded ADMIN_EMAIL / ADMIN_PASSWORD constants (FR-01, NFR-04).
-- Accounts are seeded once by the dev team; app never hardcodes credentials.
-- ----------------------------------------------------------------------------
CREATE TABLE admins (
    admin_id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    admin_name          VARCHAR(90)         NOT NULL,
    email               VARCHAR(120)        NOT NULL,
    password_hash       VARCHAR(255)        NOT NULL,   -- bcrypt/argon2 hash, never plaintext
    failed_login_count  TINYINT UNSIGNED    NOT NULL DEFAULT 0,
    locked_until         DATETIME            NULL,        -- UC-04 alt flow 3: 10-min lockout
    last_login          DATETIME            NULL,
    is_active            TINYINT(1)          NOT NULL DEFAULT 1,
    created_at           DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. PASSWORD RESETS
-- Replaces the mocked "Forgot Password" flow with a real, time-limited,
-- single-use token that the app emails to the admin (FR-02).
-- ----------------------------------------------------------------------------
CREATE TABLE password_resets (
    reset_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    admin_id      BIGINT UNSIGNED NOT NULL,
    token_hash    CHAR(64)        NOT NULL,          -- SHA-256 of the emailed code; never store raw token
    expires_at    DATETIME        NOT NULL,           -- e.g. now() + 15 minutes
    used_at       DATETIME        NULL,
    requested_ip  VARCHAR(45)     NULL,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reset_admin FOREIGN KEY (admin_id) REFERENCES admins(admin_id) ON DELETE CASCADE,
    UNIQUE KEY uq_reset_token (token_hash)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 3. CUSTOMERS  (FR-12)
-- ----------------------------------------------------------------------------
CREATE TABLE customers (
    customer_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_name   VARCHAR(90)     NOT NULL,
    phone_number    VARCHAR(30)     NOT NULL,
    address         VARCHAR(150)    NULL,
    classification  ENUM('New','Returning') NOT NULL DEFAULT 'New',
    needs_review    TINYINT(1)      NOT NULL DEFAULT 1,   -- FR-13: new customer flag for admin review
    date_added      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_customer_phone (phone_number),
    INDEX idx_customer_name (customer_name)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 4. BLACKLIST  (FR-14)
-- ----------------------------------------------------------------------------
CREATE TABLE blacklist (
    blacklist_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id       BIGINT UNSIGNED NOT NULL,
    reason            VARCHAR(255)    NOT NULL,
    flagged_by_admin  BIGINT UNSIGNED NULL,
    date_blacklisted  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_blacklist_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    CONSTRAINT fk_blacklist_admin FOREIGN KEY (flagged_by_admin) REFERENCES admins(admin_id) ON DELETE SET NULL,
    UNIQUE KEY uq_blacklist_customer (customer_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 5. CREDIT ACCOUNTS & PAYMENTS  (FR-17)
-- ----------------------------------------------------------------------------
CREATE TABLE credit_accounts (
    credit_account_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id        BIGINT UNSIGNED NOT NULL,
    current_balance    DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    date_last_updated  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_credit_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    UNIQUE KEY uq_credit_customer (customer_id),
    CONSTRAINT chk_credit_balance CHECK (current_balance >= 0)
) ENGINE=InnoDB;

CREATE TABLE credit_payments (
    payment_id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    credit_account_id  BIGINT UNSIGNED NOT NULL,
    amount_paid        DECIMAL(10,2)   NOT NULL,
    recorded_by_admin  BIGINT UNSIGNED NULL,
    date_of_payment    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_account FOREIGN KEY (credit_account_id) REFERENCES credit_accounts(credit_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_admin FOREIGN KEY (recorded_by_admin) REFERENCES admins(admin_id) ON DELETE SET NULL,
    CONSTRAINT chk_payment_positive CHECK (amount_paid > 0)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 6. INVENTORY & DAMAGED STOCK LOG  (FR-15, FR-16, BR-09)
-- ----------------------------------------------------------------------------
CREATE TABLE inventory (
    inventory_id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    rice_variety         VARCHAR(80)     NOT NULL,
    variant               ENUM('Local','Imported') NOT NULL,
    quantity_in_stock    INT             NOT NULL DEFAULT 0,
    unit_price            DECIMAL(10,2)   NOT NULL,
    low_stock_threshold  INT             NOT NULL DEFAULT 5,
    stock_status          ENUM('Available','Low Stock','Out of Stock') NOT NULL DEFAULT 'Available',
    updated_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_inventory_qty CHECK (quantity_in_stock >= 0)
) ENGINE=InnoDB;

CREATE TABLE damaged_stock_log (
    damage_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    inventory_id  BIGINT UNSIGNED NOT NULL,
    admin_id      BIGINT UNSIGNED NULL,
    damage_type   VARCHAR(80)     NOT NULL,    -- e.g. 'Pest infestation', 'Moisture damage'
    qty_damaged   INT             NOT NULL,
    date_logged   DATE            NOT NULL,
    CONSTRAINT fk_damage_inventory FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id) ON DELETE CASCADE,
    CONSTRAINT fk_damage_admin FOREIGN KEY (admin_id) REFERENCES admins(admin_id) ON DELETE SET NULL,
    CONSTRAINT chk_damage_qty CHECK (qty_damaged > 0)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 7. ORDERS & ORDER ITEMS  (FR-03, FR-04, FR-06, FR-07, FR-08, FR-09)
-- ----------------------------------------------------------------------------
CREATE TABLE orders (
    order_id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_code          VARCHAR(20)     NOT NULL,        -- e.g. 'MVB-0003', generated by app/trigger
    customer_id         BIGINT UNSIGNED NOT NULL,
    created_by_admin    BIGINT UNSIGNED NULL,             -- set when admin creates a walk-in order slip (FR-04)
    confirmed_by_admin  BIGINT UNSIGNED NULL,
    fulfillment_method  ENUM('Pickup','In-house Delivery','Own Courier') NOT NULL,
    delivery_address    VARCHAR(150)    NULL,
    delivery_date       DATE            NULL,
    order_status         ENUM('Pending','Confirmed','Cancelled','Out for Delivery','Delivered')
                            NOT NULL DEFAULT 'Pending',
    total_amount          DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    date_created           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    date_confirmed         DATETIME        NULL,
    CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_order_created_admin FOREIGN KEY (created_by_admin) REFERENCES admins(admin_id) ON DELETE SET NULL,
    CONSTRAINT fk_order_confirmed_admin FOREIGN KEY (confirmed_by_admin) REFERENCES admins(admin_id) ON DELETE SET NULL,
    UNIQUE KEY uq_order_code (order_code),
    INDEX idx_order_status_date (order_status, date_created),
    INDEX idx_order_tracking (order_code, customer_id)   -- supports UC-02 lookup by Order ID + phone
) ENGINE=InnoDB;

CREATE TABLE order_items (
    order_item_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id       BIGINT UNSIGNED NOT NULL,
    inventory_id   BIGINT UNSIGNED NOT NULL,
    quantity       INT             NOT NULL,
    unit_price     DECIMAL(10,2)   NOT NULL,   -- price snapshot at time of order
    subtotal       DECIMAL(10,2)   GENERATED ALWAYS AS (quantity * unit_price) STORED,
    CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    CONSTRAINT fk_item_inventory FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id),
    CONSTRAINT chk_item_qty CHECK (quantity > 0)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 8. RECEIPTS  (FR-10, BR-05)
-- ----------------------------------------------------------------------------
CREATE TABLE receipts (
    receipt_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id        BIGINT UNSIGNED NOT NULL,
    total_amount    DECIMAL(10,2)   NOT NULL,
    pdf_path        VARCHAR(255)    NULL,        -- storage path/URL of generated PDF
    date_generated  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_receipt_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    UNIQUE KEY uq_receipt_order (order_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 9. TRANSACTION LOG  (FR-20, BR-11, NFR-05 audit trail)
-- ----------------------------------------------------------------------------
CREATE TABLE transaction_log (
    log_id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    admin_id           BIGINT UNSIGNED NULL,
    customer_id        BIGINT UNSIGNED NULL,
    order_id           BIGINT UNSIGNED NULL,
    action_type        VARCHAR(60)     NOT NULL,   -- e.g. 'ORDER_CONFIRMED', 'STOCK_DEDUCTED', 'DAMAGE_LOGGED'
    affected_table     VARCHAR(60)     NOT NULL,
    affected_record_id BIGINT UNSIGNED NOT NULL,
    description        VARCHAR(255)    NULL,
    datetime           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_log_admin FOREIGN KEY (admin_id) REFERENCES admins(admin_id) ON DELETE SET NULL,
    CONSTRAINT fk_log_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL,
    CONSTRAINT fk_log_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE SET NULL,
    INDEX idx_log_datetime (datetime)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DELIMITER $$

-- Auto-generate human-readable order codes: MVB-0001, MVB-0002, ...
CREATE TRIGGER trg_orders_before_insert
BEFORE INSERT ON orders
FOR EACH ROW
BEGIN
    IF NEW.order_code IS NULL OR NEW.order_code = '' THEN
        SET NEW.order_code = CONCAT('MVB-', LPAD((SELECT AUTO_INCREMENT FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = 'rice_and_shine' AND TABLE_NAME = 'orders'), 4, '0'));
    END IF;
END$$

-- Keep inventory.stock_status in sync whenever quantity changes (FR-15 alt flows)
CREATE TRIGGER trg_inventory_before_update
BEFORE UPDATE ON inventory
FOR EACH ROW
BEGIN
    IF NEW.quantity_in_stock <= 0 THEN
        SET NEW.stock_status = 'Out of Stock';
    ELSEIF NEW.quantity_in_stock <= NEW.low_stock_threshold THEN
        SET NEW.stock_status = 'Low Stock';
    ELSE
        SET NEW.stock_status = 'Available';
    END IF;
END$$

DELIMITER ;

-- ============================================================================
-- REPORT VIEWS  (FR-18 — CSV/PDF export is generated by the app from these)
-- ============================================================================

CREATE OR REPLACE VIEW view_sales_report AS
SELECT
    DATE(o.date_confirmed)              AS sale_date,
    o.order_code,
    c.customer_name,
    inv.rice_variety,
    oi.quantity,
    oi.unit_price,
    oi.subtotal,
    o.fulfillment_method
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN inventory inv ON inv.inventory_id = oi.inventory_id
JOIN customers c ON c.customer_id = o.customer_id
WHERE o.order_status IN ('Confirmed','Out for Delivery','Delivered');

CREATE OR REPLACE VIEW view_inventory_report AS
SELECT
    inventory_id, rice_variety, variant, quantity_in_stock,
    unit_price, stock_status, low_stock_threshold, updated_at
FROM inventory;

CREATE OR REPLACE VIEW view_damage_report AS
SELECT
    d.damage_id, inv.rice_variety, d.damage_type, d.qty_damaged,
    d.date_logged, a.admin_name
FROM damaged_stock_log d
JOIN inventory inv ON inv.inventory_id = d.inventory_id
LEFT JOIN admins a ON a.admin_id = d.admin_id;

CREATE OR REPLACE VIEW view_credit_report AS
SELECT
    ca.credit_account_id, c.customer_name, c.phone_number,
    ca.current_balance, ca.date_last_updated
FROM credit_accounts ca
JOIN customers c ON c.customer_id = ca.customer_id
WHERE ca.current_balance > 0;

CREATE OR REPLACE VIEW view_order_status_report AS
SELECT order_code, order_status, fulfillment_method, delivery_date, date_created, date_confirmed
FROM orders;
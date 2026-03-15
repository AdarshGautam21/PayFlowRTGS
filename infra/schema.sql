CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS accounts (
    id          VARCHAR(36) PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    currency    VARCHAR(10) NOT NULL,
    balance     BIGINT NOT NULL DEFAULT 0,
    version     BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id             VARCHAR(36) PRIMARY KEY,
    payment_id     VARCHAR(36) NOT NULL,
    debit_account  VARCHAR(36) NOT NULL REFERENCES accounts(id),
    credit_account VARCHAR(36) NOT NULL REFERENCES accounts(id),
    amount         BIGINT NOT NULL,
    currency       VARCHAR(10) NOT NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_payment_id ON ledger_entries(payment_id);
CREATE INDEX IF NOT EXISTS idx_ledger_debit ON ledger_entries(debit_account);
CREATE INDEX IF NOT EXISTS idx_ledger_credit ON ledger_entries(credit_account);

-- Seed test accounts
INSERT INTO accounts (id, name, currency, balance) VALUES
    ('acc-barclays-usd',  'Barclays USD Nostro',    'USD', 10000000),
    ('acc-hsbc-usd',      'HSBC USD Nostro',         'USD', 10000000),
    ('acc-jpmorgan-usd',  'JPMorgan USD Nostro',     'USD', 10000000),
    ('acc-deutsche-usd',  'Deutsche Bank USD Nostro','USD', 10000000)
ON CONFLICT DO NOTHING;

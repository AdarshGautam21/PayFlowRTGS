# PayFlow - Distributed Payment Settlement Engine

A production-grade distributed payment settlement platform built across Java, Go, and Python. Implements the full lifecycle of an interbank payment - from ingestion through settlement, exception handling, and real-time visualization.

---

## Live Services

| Service | Language | Port | Purpose |
|---------|----------|------|---------|
| RTGS Settlement Engine | Go | 8082 | Double-entry ledger, payment state machine, atomic settlement |
| Payment Gateway | Java / Spring Boot | 8081 | REST API, Redis rate limiting, Kafka publishing |
| Exception Resolver | Python / FastAPI | 8083 | AI-powered exception investigation and resolution |
| Dashboard | React / Vite | 5173 | Live settlement feed, account balances, exception UI |

---

## Architecture
```
Client
  |
  v
Payment Gateway (Java/Spring Boot) - REST API, rate limiting, idempotency
  |
  v
Kafka - exactly-once payment event streaming
  |
  v
RTGS Settlement Engine (Go) - double-entry ledger, optimistic locking, state machine
  |
  v
PostgreSQL - atomic ledger storage, settlement history
  |
  v
Exception Resolver (Python/FastAPI) - exception classification and resolution
  |
  v
React Dashboard - live feed, metrics, exception UI
```

---

## Core Features

**RTGS Settlement Engine (Go)**
- Double-entry ledger - every payment debits sender and credits receiver atomically
- Payment state machine - RECEIVED, VALIDATED, LIQUIDITY CHECK, PROCESSING, SETTLED, FAILED, DEFERRED
- Optimistic concurrency control - version-based locking handles concurrent settlements without serialization
- Intraday liquidity management - insufficient payments deferred and retried automatically
- Prometheus metrics - settlement count, failure count, latency histogram
- Concurrent settlement - goroutines process multiple payments simultaneously

**Payment Gateway (Java / Spring Boot)**
- ISO 20022 inspired pacs.008 payment ingestion
- Redis-backed distributed rate limiter using Lua scripting for atomic token-bucket operations
- Idempotency key enforcement - duplicate payments rejected at the gateway
- Kafka producer with exactly-once semantics
- Per-client rate limiting - 100 requests per 60 second window

**Exception Resolver (Python / FastAPI)**
- Classifies payment exceptions - insufficient liquidity, duplicate payment, sanctions flag, schema validation, timing issues
- Queries live ledger data to enrich investigation context
- Produces structured resolution reports with root cause, reasoning trail, recommended action, and severity
- Designed for LLM integration via Anthropic API - runs with intelligent mock resolver by default

**React Dashboard**
- Live settlement feed auto-refreshing every 4 seconds
- Account balance visualization with bar charts
- Submit settlements directly from the UI
- Exception resolver UI - submit an exception, get a full resolution report
- Severity-coded resolution reports

---

## Key Technical Decisions

**Why optimistic locking over pessimistic locking?**
Pessimistic locking serializes all concurrent settlements against the same account, destroying throughput. Optimistic locking allows concurrent reads and only conflicts on write. Under realistic payment distributions where most concurrent settlements involve different account pairs, contention is low and throughput stays high.

**Why exactly-once Kafka semantics?**
At-least-once delivery creates duplicate payment risk. At-most-once creates loss risk. Exactly-once is the only acceptable guarantee when moving money - achieved via idempotent producers and idempotency keys at the application layer as a second line of defence.

**Why Go for the settlement core?**
Go's goroutine model handles thousands of concurrent settlement operations with predictable, low-latency garbage collection. In a system where settlement latency directly affects participant liquidity costs, GC pauses matter.

**Why event sourcing for audit?**
A traditional audit table is mutable. An event store is append-only - the history is immutable by design. For regulatory audit trails, immutability is a requirement not a nice-to-have.

---

## Getting Started

**Prerequisites**
- Go 1.22+
- Java 21+
- Python 3.9+
- Docker
- Node.js 18+

**Start infrastructure**
```bash
cd infra && docker-compose up -d postgres redis
```

**Start RTGS engine**
```bash
cd rtgs-core
DATABASE_URL="postgres://payflow:payflow@127.0.0.1:5432/payflow?sslmode=disable" PORT=8082 go run cmd/main.go
```

**Start exception resolver**
```bash
cd exception-resolver
source venv/bin/activate
python3 main.py
```

**Start dashboard**
```bash
cd dashboard
npm run dev
```

**Settle a payment**
```bash
curl -X POST "http://localhost:8082/settle?from=acc-barclays-usd&to=acc-hsbc-usd"
```

**Resolve an exception**
```bash
curl -X POST http://localhost:8083/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "exception_type": "INSUFFICIENT_LIQUIDITY",
    "description": "Payment failed due to low balance",
    "debit_account": "acc-barclays-usd",
    "amount": 99999999,
    "currency": "USD"
  }'
```

**View Prometheus metrics**
```bash
curl http://localhost:8082/metrics | grep payflow
```

---

## Blockchain Parallels

| Blockchain Concept | PayFlow Equivalent |
|---|---|
| Consensus finality | RTGS settlement finality |
| Immutable ledger | Append-only ledger entries |
| Double-spend prevention | Idempotency keys + optimistic locking |
| Smart contract state transitions | Payment state machine |
| Gas limits / throttling | Redis rate limiting |
| Token transfers | Double-entry ledger debits and credits |

---

## Observability

- Prometheus metrics at `http://localhost:8082/metrics`
- Settlement throughput, failure rate, latency histogram
- Per-account balance tracking
- Full payment history via REST API

---

Built by Adarsh Gautam

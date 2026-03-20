from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import psycopg2
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="PayFlow Exception Resolver", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_URL = os.getenv("DATABASE_URL", "postgres://payflow:payflow@127.0.0.1:5432/payflow")

def get_db():
    return psycopg2.connect(DB_URL)

def get_payment_history(payment_id: str = None, limit: int = 20):
    try:
        conn = get_db()
        cur = conn.cursor()
        if payment_id:
            cur.execute(
                """SELECT le.payment_id, le.debit_account, le.credit_account,
                          le.amount, le.currency, le.created_at,
                          da.balance as debit_balance, ca.balance as credit_balance
                   FROM ledger_entries le
                   JOIN accounts da ON da.id = le.debit_account
                   JOIN accounts ca ON ca.id = le.credit_account
                   WHERE le.payment_id = %s""",
                (payment_id,)
            )
        else:
            cur.execute(
                """SELECT le.payment_id, le.debit_account, le.credit_account,
                          le.amount, le.currency, le.created_at,
                          da.balance as debit_balance, ca.balance as credit_balance
                   FROM ledger_entries le
                   JOIN accounts da ON da.id = le.debit_account
                   JOIN accounts ca ON ca.id = le.credit_account
                   ORDER BY le.created_at DESC LIMIT %s""",
                (limit,)
            )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        return []

def get_account_balances():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, name, currency, balance FROM accounts ORDER BY name")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        return []

def mock_resolve(exception_type: str, description: str, amount: float, debit_account: str):
    rules = {
        "INSUFFICIENT_LIQUIDITY": {
            "root_cause": f"Debit account {debit_account} has insufficient funds to cover the payment of {amount}.",
            "resolution": "Top up the debit account liquidity or defer the payment to the next settlement cycle.",
            "reasoning_trail": f"Checked ledger balance for {debit_account}. Current balance is below the required payment amount of {amount}. This is a classic intraday liquidity failure common in RTGS systems.",
            "recommended_action": "Notify the participant treasury desk to inject liquidity or place payment in deferred queue.",
            "severity": "HIGH"
        },
        "DUPLICATE_PAYMENT": {
            "root_cause": "A payment with the same message ID has already been processed in this settlement cycle.",
            "resolution": "Reject the duplicate instruction and notify the originating participant.",
            "reasoning_trail": "Idempotency key check detected a collision. The original payment was already settled successfully. This is likely a retry from a failed network acknowledgment.",
            "recommended_action": "Return pacs.002 rejection with reason code DUPL to the originating institution.",
            "severity": "MEDIUM"
        },
        "SANCTIONS_FLAG": {
            "root_cause": "Counterparty account matched an entry on the OFAC consolidated sanctions list.",
            "resolution": "Block the payment immediately and escalate to compliance team.",
            "reasoning_trail": "Pre-settlement sanctions screening detected a name match against OFAC SDN list. Payment cannot proceed until compliance clears or rejects the transaction.",
            "recommended_action": "Escalate to compliance officer immediately. Do not process. File SAR if required.",
            "severity": "CRITICAL"
        },
        "SCHEMA_VALIDATION": {
            "root_cause": "Payment instruction does not conform to ISO 20022 pacs.008 schema requirements.",
            "resolution": "Return the payment to the originator with a validation error report detailing the failing fields.",
            "reasoning_trail": "Schema validator detected missing or malformed fields in the pacs.008 credit transfer message. Common causes include missing BIC codes, invalid IBAN format, or missing remittance information.",
            "recommended_action": "Send pacs.002 rejection with reason code NARR and list the failing validation rules.",
            "severity": "LOW"
        },
        "TIMING_ISSUE": {
            "root_cause": "Payment instruction received outside the settlement window for today's cycle.",
            "resolution": "Queue the payment for the next available settlement window.",
            "reasoning_trail": "Timestamp analysis shows the payment arrived after the cut-off time for same-day settlement. The instruction is valid but cannot be processed until the next cycle opens.",
            "recommended_action": "Move payment to next-day queue and send acknowledgment to originating institution.",
            "severity": "LOW"
        }
    }
    default = {
        "root_cause": f"Unclassified exception: {description}",
        "resolution": "Manual investigation required by operations team.",
        "reasoning_trail": "Automated resolver could not classify this exception. Escalating to human operator for review.",
        "recommended_action": "Assign to senior operations analyst for investigation.",
        "severity": "MEDIUM"
    }
    return rules.get(exception_type, default)

class ExceptionRequest(BaseModel):
    payment_id: Optional[str] = None
    exception_type: str
    description: str
    debit_account: Optional[str] = None
    credit_account: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = "USD"

class ResolutionReport(BaseModel):
    payment_id: Optional[str]
    exception_type: str
    root_cause: str
    resolution: str
    reasoning_trail: str
    recommended_action: str
    severity: str
    resolved_at: str

@app.post("/resolve", response_model=ResolutionReport)
async def resolve_exception(request: ExceptionRequest):
    result = mock_resolve(
        request.exception_type,
        request.description,
        request.amount or 0,
        request.debit_account or "unknown"
    )
    return ResolutionReport(
        payment_id=request.payment_id,
        exception_type=request.exception_type,
        root_cause=result["root_cause"],
        resolution=result["resolution"],
        reasoning_trail=result["reasoning_trail"],
        recommended_action=result["recommended_action"],
        severity=result["severity"],
        resolved_at=datetime.utcnow().isoformat()
    )

@app.get("/payments")
async def get_payments():
    rows = get_payment_history(limit=20)
    return [
        {
            "payment_id": r[0],
            "debit_account": r[1],
            "credit_account": r[2],
            "amount": r[3],
            "currency": r[4],
            "created_at": str(r[5]),
            "debit_balance": r[6],
            "credit_balance": r[7],
            "status": "SETTLED"
        }
        for r in rows
    ]

@app.get("/accounts")
async def get_accounts():
    rows = get_account_balances()
    return [
        {"id": r[0], "name": r[1], "currency": r[2], "balance": r[3]}
        for r in rows
    ]

@app.get("/health")
async def health():
    return {"status": "ok", "service": "payflow-exception-resolver"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8083)

import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

import { API_RTGS, API_RESOLVER } from "./config";


interface Account {
  id: string;
  name: string;
  currency: string;
  balance: number;
}

interface Payment {
  payment_id: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  currency: string;
  created_at: string;
  status: string;
}

interface Resolution {
  exception_type: string;
  root_cause: string;
  resolution: string;
  reasoning_trail: string;
  recommended_action: string;
  severity: string;
  resolved_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "#1D9E75",
  MEDIUM: "#BA7517",
  HIGH: "#D85A30",
  CRITICAL: "#E24B4A",
};

const EXCEPTION_TYPES = [
  "INSUFFICIENT_LIQUIDITY",
  "DUPLICATE_PAYMENT",
  "SANCTIONS_FLAG",
  "SCHEMA_VALIDATION",
  "TIMING_ISSUE",
];

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [resolving, setResolving] = useState(false);
  const [settling, setSettling] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "resolver">("dashboard");
  const [exceptionType, setExceptionType] = useState(EXCEPTION_TYPES[0]);
  const [fromAccount, setFromAccount] = useState("acc-barclays-usd");
  const [toAccount, setToAccount] = useState("acc-hsbc-usd");
  const [amount, setAmount] = useState("10000");
  const [notification, setNotification] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [accRes, payRes] = await Promise.all([
        fetch(`${API_RESOLVER}/accounts`),
        fetch(`${API_RESOLVER}/payments`),
      ]);
      setAccounts(await accRes.json());
      setPayments(await payRes.json());
    } catch (e) {
      console.error("Fetch error", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const submitSettlement = async () => {
    setSettling(true);
    try {
      const res = await fetch(
        `${API_RTGS}/settle?from=${fromAccount}&to=${toAccount}`,
        { method: "POST" }
      );
      const data = await res.json();
      setNotification(
        res.ok
          ? `Settled: ${data.payment_id?.slice(0, 8)}...`
          : `Failed: ${data}`
      );
      setTimeout(() => setNotification(null), 3000);
      fetchData();
    } catch (e) {
      setNotification("Error connecting to RTGS engine");
    } finally {
      setSettling(false);
    }
  };

  const resolveException = async () => {
    setResolving(true);
    setResolution(null);
    try {
      const res = await fetch(`${API_RESOLVER}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exception_type: exceptionType,
          description: `Exception triggered manually for ${exceptionType}`,
          debit_account: fromAccount,
          credit_account: toAccount,
          amount: parseFloat(amount),
          currency: "USD",
        }),
      });
      setResolution(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setResolving(false);
    }
  };

  const totalVolume = payments.reduce((s, p) => s + p.amount, 0);
  const chartData = accounts.map((a) => ({
    name: a.name.replace(" USD Nostro", "").replace(" Bank", ""),
    balance: Math.round(a.balance / 100),
  }));

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#f8f7f4", color: "#1a1a1a" }}>
      {/* Header */}
      <div style={{ background: "#1a1a1a", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#1D9E75" }} />
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 18, letterSpacing: "-0.5px" }}>PayFlow</span>
          <span style={{ color: "#666", fontSize: 13 }}>RTGS Settlement Engine</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["dashboard", "resolver"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13,
                background: activeTab === tab ? "#1D9E75" : "#2a2a2a",
                color: activeTab === tab ? "#fff" : "#aaa",
                fontWeight: activeTab === tab ? 600 : 400,
              }}
            >
              {tab === "dashboard" ? "Dashboard" : "Exception Resolver"}
            </button>
          ))}
        </div>
      </div>

      {notification && (
        <div style={{ background: "#1D9E75", color: "#fff", textAlign: "center", padding: "8px", fontSize: 13 }}>
          {notification}
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
        {activeTab === "dashboard" ? (
          <>
            {/* Metric Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
              {[
                { label: "Total Settlements", value: payments.length },
                { label: "Total Volume (USD)", value: `$${(totalVolume / 100).toLocaleString()}` },
                { label: "Active Accounts", value: accounts.length },
                { label: "Avg Amount", value: payments.length ? `$${Math.round(totalVolume / payments.length / 100).toLocaleString()}` : "$0" },
              ].map((m) => (
                <div key={m.label} style={{ background: "#fff", borderRadius: 12, padding: "20px 24px", border: "0.5px solid #e5e3dc" }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{m.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 600 }}>{m.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
              {/* Balance Chart */}
              <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "0.5px solid #e5e3dc" }}>
                <div style={{ fontWeight: 600, marginBottom: 20 }}>Account Balances</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Balance"]} />
                    <Bar dataKey="balance" fill="#1D9E75" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* New Settlement */}
              <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "0.5px solid #e5e3dc" }}>
                <div style={{ fontWeight: 600, marginBottom: 20 }}>New Settlement</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <select
                    value={fromAccount}
                    onChange={(e) => setFromAccount(e.target.value)}
                    style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e3dc", fontSize: 13 }}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <select
                    value={toAccount}
                    onChange={(e) => setToAccount(e.target.value)}
                    style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e3dc", fontSize: 13 }}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Amount (cents)"
                    style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e3dc", fontSize: 13 }}
                  />
                  <button
                    onClick={submitSettlement}
                    disabled={settling}
                    style={{
                      padding: "12px", borderRadius: 8, border: "none", cursor: "pointer",
                      background: settling ? "#ccc" : "#1a1a1a", color: "#fff", fontWeight: 600, fontSize: 14
                    }}
                  >
                    {settling ? "Settling..." : "Settle Payment"}
                  </button>
                </div>
              </div>
            </div>

            {/* Payment Feed */}
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "0.5px solid #e5e3dc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{ fontWeight: 600 }}>Live Settlement Feed</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#1D9E75" }} />
                  <span style={{ fontSize: 12, color: "#888" }}>Auto-refreshing</span>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #f0ede6" }}>
                      {["Payment ID", "From", "To", "Amount", "Currency", "Status", "Time"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#888", fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "#aaa" }}>No settlements yet. Submit one above.</td></tr>
                    ) : (
                      payments.map((p) => (
                        <tr key={p.payment_id} style={{ borderBottom: "1px solid #f8f7f4" }}>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#555" }}>{p.payment_id.slice(0, 12)}...</td>
                          <td style={{ padding: "10px 12px" }}>{p.debit_account.replace("acc-", "").replace("-usd", "")}</td>
                          <td style={{ padding: "10px 12px" }}>{p.credit_account.replace("acc-", "").replace("-usd", "")}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 600 }}>${(p.amount / 100).toLocaleString()}</td>
                          <td style={{ padding: "10px 12px" }}>{p.currency}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ background: "#E1F5EE", color: "#0F6E56", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                              {p.status}
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px", color: "#888" }}>{new Date(p.created_at).toLocaleTimeString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          /* Exception Resolver Tab */
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "0.5px solid #e5e3dc" }}>
              <div style={{ fontWeight: 600, marginBottom: 20 }}>Submit Exception</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6 }}>Exception Type</label>
                  <select
                    value={exceptionType}
                    onChange={(e) => setExceptionType(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e3dc", fontSize: 13 }}
                  >
                    {EXCEPTION_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6 }}>Debit Account</label>
                  <select
                    value={fromAccount}
                    onChange={(e) => setFromAccount(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e3dc", fontSize: 13 }}
                  >
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6 }}>Amount (USD cents)</label>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e3dc", fontSize: 13, boxSizing: "border-box" }}
                  />
                </div>
                <button
                  onClick={resolveException}
                  disabled={resolving}
                  style={{
                    padding: "12px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: resolving ? "#ccc" : "#1a1a1a", color: "#fff", fontWeight: 600, fontSize: 14, marginTop: 8
                  }}
                >
                  {resolving ? "Investigating..." : "Resolve Exception"}
                </button>
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "0.5px solid #e5e3dc" }}>
              <div style={{ fontWeight: 600, marginBottom: 20 }}>Resolution Report</div>
              {!resolution ? (
                <div style={{ color: "#aaa", fontSize: 13, textAlign: "center", paddingTop: 60 }}>
                  Submit an exception to see the AI-powered resolution report.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#888" }}>Severity</span>
                    <span style={{
                      background: SEVERITY_COLORS[resolution.severity] + "22",
                      color: SEVERITY_COLORS[resolution.severity],
                      padding: "4px 12px", borderRadius: 20, fontWeight: 600, fontSize: 12
                    }}>
                      {resolution.severity}
                    </span>
                  </div>
                  {[
                    { label: "Root Cause", value: resolution.root_cause },
                    { label: "Resolution", value: resolution.resolution },
                    { label: "Reasoning", value: resolution.reasoning_trail },
                    { label: "Recommended Action", value: resolution.recommended_action },
                  ].map((item) => (
                    <div key={item.label} style={{ borderTop: "1px solid #f0ede6", paddingTop: 12 }}>
                      <div style={{ color: "#888", fontSize: 11, fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</div>
                      <div style={{ lineHeight: 1.6, color: "#333" }}>{item.value}</div>
                    </div>
                  ))}
                  <div style={{ color: "#bbb", fontSize: 11, borderTop: "1px solid #f0ede6", paddingTop: 12 }}>
                    Resolved at {new Date(resolution.resolved_at).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

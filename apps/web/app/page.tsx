"use client";

import { FormEvent, useMemo, useState } from "react";

type DealListItem = {
  id: string;
  dealAddress: string;
  organizerWallet: string;
  title: string;
  status: string;
  minParticipants: number;
  maxParticipants: number;
  currentParticipants: number;
  createdAt: string;
};

type DealDetail = DealListItem & {
  unitPrice: string;
  depositPerParticipant: string;
  depositDeadlineAt: string;
  finalDeadlineAt: string;
  statusReason?: string | null;
  memberships: {
    participantWallet: string;
    role: string;
    joinedAt: string;
  }[];
};

function toIsoLocal(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function HomePage() {
  const initialDeposit = useMemo(() => toIsoLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)), []);
  const initialFinal = useMemo(() => toIsoLocal(new Date(Date.now() + 72 * 60 * 60 * 1000)), []);

  const [createForm, setCreateForm] = useState({
    dealAddress: "0x0000000000000000000000000000000000000000",
    organizerWallet: "0x0000000000000000000000000000000000000000",
    title: "Private Hair Dryer Group Buy",
    inviteCode: "invite-2026-private",
    unitPrice: "70000000",
    depositPerParticipant: "20000000",
    minParticipants: 3,
    maxParticipants: 10,
    depositDeadlineAt: initialDeposit,
    finalDeadlineAt: initialFinal,
    inviteMaxUses: 10
  });

  const [joinForm, setJoinForm] = useState({
    dealAddress: "",
    participantWallet: "0x0000000000000000000000000000000000000000",
    inviteToken: ""
  });

  const [deals, setDeals] = useState<DealListItem[]>([]);
  const [selected, setSelected] = useState<DealDetail | null>(null);
  const [inviteTokenOutput, setInviteTokenOutput] = useState("");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function loadDeals() {
    const res = await fetch("/api/deals");
    const data = await res.json();
    setDeals(data.deals ?? []);
  }

  async function loadDetail(dealAddress: string) {
    const res = await fetch(`/api/deals/${dealAddress}`);
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "failed_to_load_deal");
      return;
    }
    setSelected({ ...data.deal, memberships: data.memberships ?? [] });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const payload = {
        ...createForm,
        depositDeadlineAt: new Date(createForm.depositDeadlineAt).toISOString(),
        finalDeadlineAt: new Date(createForm.finalDeadlineAt).toISOString()
      };
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "create_failed");
        return;
      }
      setInviteTokenOutput(data.inviteToken ?? "");
      setJoinForm((prev) => ({ ...prev, dealAddress: createForm.dealAddress, inviteToken: data.inviteToken ?? "" }));
      setMessage("Deal created/updated. Invite token generated.");
      await loadDeals();
      await loadDetail(createForm.dealAddress);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/deals/${joinForm.dealAddress}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          participantWallet: joinForm.participantWallet,
          inviteToken: joinForm.inviteToken
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "join_failed");
        return;
      }
      setMessage("Participant joined successfully.");
      await loadDeals();
      await loadDetail(joinForm.dealAddress);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="hero card">
        <h1>ArcBuy Private Group-Buy</h1>
        <p className="muted">
          Invite-only deal operations on Arc testnet with Supabase-backed state and production deployment path.
        </p>
        <div className="row">
          <button type="button" onClick={loadDeals} disabled={busy}>
            Refresh Deals
          </button>
        </div>
        {message ? <p className="status">{message}</p> : null}
      </section>

      <section className="grid2">
        <article className="card">
          <h2>Create Private Deal</h2>
          <form onSubmit={handleCreate} className="form">
            <label>
              Deal Address
              <input
                value={createForm.dealAddress}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, dealAddress: e.target.value }))}
                required
              />
            </label>
            <label>
              Organizer Wallet
              <input
                value={createForm.organizerWallet}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, organizerWallet: e.target.value }))}
                required
              />
            </label>
            <label>
              Title
              <input
                value={createForm.title}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                required
              />
            </label>
            <label>
              Invite Code
              <input
                value={createForm.inviteCode}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, inviteCode: e.target.value }))}
                required
              />
            </label>
            <div className="formRow">
              <label>
                Unit Price (minor units)
                <input
                  value={createForm.unitPrice}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, unitPrice: e.target.value }))}
                  required
                />
              </label>
              <label>
                Deposit (minor units)
                <input
                  value={createForm.depositPerParticipant}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, depositPerParticipant: e.target.value }))}
                  required
                />
              </label>
            </div>
            <div className="formRow">
              <label>
                Min Participants
                <input
                  type="number"
                  value={createForm.minParticipants}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, minParticipants: Number(e.target.value) || 1 }))
                  }
                  min={1}
                  required
                />
              </label>
              <label>
                Max Participants
                <input
                  type="number"
                  value={createForm.maxParticipants}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, maxParticipants: Number(e.target.value) || 1 }))
                  }
                  min={1}
                  required
                />
              </label>
            </div>
            <div className="formRow">
              <label>
                Deposit Deadline
                <input
                  type="datetime-local"
                  value={createForm.depositDeadlineAt}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, depositDeadlineAt: e.target.value }))}
                  required
                />
              </label>
              <label>
                Final Deadline
                <input
                  type="datetime-local"
                  value={createForm.finalDeadlineAt}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, finalDeadlineAt: e.target.value }))}
                  required
                />
              </label>
            </div>
            <label>
              Invite Max Uses
              <input
                type="number"
                value={createForm.inviteMaxUses}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, inviteMaxUses: Number(e.target.value) || 1 }))
                }
                min={1}
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              Create Deal
            </button>
          </form>
          {inviteTokenOutput ? (
            <div className="output">
              <p className="label">Invite Token</p>
              <textarea value={inviteTokenOutput} readOnly rows={5} />
            </div>
          ) : null}
        </article>

        <article className="card">
          <h2>Join Private Deal</h2>
          <form onSubmit={handleJoin} className="form">
            <label>
              Deal Address
              <input
                value={joinForm.dealAddress}
                onChange={(e) => setJoinForm((prev) => ({ ...prev, dealAddress: e.target.value }))}
                required
              />
            </label>
            <label>
              Participant Wallet
              <input
                value={joinForm.participantWallet}
                onChange={(e) => setJoinForm((prev) => ({ ...prev, participantWallet: e.target.value }))}
                required
              />
            </label>
            <label>
              Invite Token
              <textarea
                value={joinForm.inviteToken}
                onChange={(e) => setJoinForm((prev) => ({ ...prev, inviteToken: e.target.value }))}
                rows={5}
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              Join Deal
            </button>
          </form>
        </article>
      </section>

      <section className="card">
        <h2>Deals</h2>
        {deals.length === 0 ? <p className="muted">No deals loaded yet.</p> : null}
        <div className="dealList">
          {deals.map((deal) => (
            <button
              className="dealItem"
              key={deal.id}
              type="button"
              onClick={() => loadDetail(deal.dealAddress)}
            >
              <strong>{deal.title}</strong>
              <span>{deal.dealAddress}</span>
              <span>
                {deal.currentParticipants}/{deal.maxParticipants} participants
              </span>
              <span className="pill">{deal.status}</span>
            </button>
          ))}
        </div>
      </section>

      {selected ? (
        <section className="card">
          <h2>Deal Detail</h2>
          <p>
            <strong>{selected.title}</strong>
          </p>
          <p className="muted">{selected.dealAddress}</p>
          <p>
            Status: <span className="pill">{selected.status}</span>
          </p>
          <p>
            Participants: {selected.currentParticipants}/{selected.maxParticipants}
          </p>
          <p>Unit Price: {selected.unitPrice}</p>
          <p>Deposit: {selected.depositPerParticipant}</p>
          <h3>Memberships</h3>
          {selected.memberships.length === 0 ? <p className="muted">No members yet.</p> : null}
          <ul>
            {selected.memberships.map((m) => (
              <li key={`${m.participantWallet}-${m.joinedAt}`}>
                {m.participantWallet} ({m.role})
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

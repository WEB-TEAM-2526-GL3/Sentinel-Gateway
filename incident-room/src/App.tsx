import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type LogAction =
  | 'CREATED'
  | 'MESSAGE'
  | 'ACKNOWLEDGED'
  | 'RESOLVED'
  | 'FALLBACK_ACTIVATED';

interface Incident {
  id: string;
  serviceId: string;
  providerId: string;
  severity: IncidentSeverity;
  reason: string;
  status: IncidentStatus;
  fallbackProviderId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

interface IncidentLog {
  id: number;
  incidentId: string;
  adminId: string;
  adminName: string;
  action: LogAction;
  details: Record<string, unknown>;
  createdAt: string;
}

interface IncidentSnapshot {
  incident: Incident;
  logs: IncidentLog[];
}

interface PresenceAdmin {
  adminId: string;
  adminName: string;
  socketId: string;
}

interface CreateIncidentForm {
  serviceId: string;
  providerId: string;
  severity: IncidentSeverity;
  reason: string;
}

const API_URL =
  import.meta.env.VITE_SENTINEL_API_URL?.replace(/\/$/, '') ??
  'http://localhost:3000';

const initialCreateForm: CreateIncidentForm = {
  serviceId: '22222222-2222-4222-8222-222222222222',
  providerId: '33333333-3333-4333-8333-333333333333',
  severity: 'HIGH',
  reason: 'OpenAI timeout spike',
};

export default function App() {
  const [adminId, setAdminId] = useState('admin-1');
  const [adminName, setAdminName] = useState('Ali');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [snapshot, setSnapshot] = useState<IncidentSnapshot | null>(null);
  const [presence, setPresence] = useState<PresenceAdmin[]>([]);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('Ready');
  const [isJoined, setIsJoined] = useState(false);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [fallback, setFallback] = useState({
    serviceName: 'openai-service',
    fallbackProviderId: '44444444-4444-4444-8444-444444444444',
    fallbackUrl: 'http://gemini.local',
  });
  const socketRef = useRef<Socket | null>(null);

  const selectedIncident = useMemo(
    () => snapshot?.incident ?? incidents.find((incident) => incident.id === selectedId),
    [incidents, selectedId, snapshot],
  );

  useEffect(() => {
    void loadIncidents();
  }, []);

  useEffect(() => {
    const socket = io(`${API_URL}/incident-room`, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socketRef.current = socket;
    socket.on('connect', () => setNotice('Socket connected'));
    socket.on('disconnect', () => {
      setNotice('Socket disconnected');
      setIsJoined(false);
      setPresence([]);
    });
    socket.on('incidentJoined', (payload: IncidentSnapshot & { presence: PresenceAdmin[] }) => {
      setSnapshot({ incident: payload.incident, logs: payload.logs });
      setPresence(payload.presence);
      setIsJoined(true);
      setNotice(`Joined incident ${shortId(payload.incident.id)}`);
    });
    socket.on('presenceUpdated', (payload: { admins: PresenceAdmin[] }) => {
      setPresence(payload.admins);
    });
    socket.on('incidentMessage', (log: IncidentLog) => {
      setSnapshot((current) =>
        current ? { ...current, logs: [...current.logs, log] } : current,
      );
    });
    socket.on('incidentUpdated', (payload: IncidentSnapshot) => {
      setSnapshot(payload);
      setIncidents((current) =>
        current.map((incident) =>
          incident.id === payload.incident.id ? payload.incident : incident,
        ),
      );
      setNotice(`${payload.incident.status} update received`);
    });
    socket.on('incidentError', (payload: { message: string }) => {
      setNotice(payload.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  async function loadIncidents() {
    const data = await request<Incident[]>('/incidents');
    setIncidents(data);

    if (!selectedId && data[0]) {
      setSelectedId(data[0].id);
    }
  }

  async function loadIncident(id: string) {
    setSelectedId(id);
    const data = await request<IncidentSnapshot>(`/incidents/${id}`);
    setSnapshot(data);
    setPresence([]);
    setIsJoined(false);
    setNotice(`Loaded incident ${shortId(id)}`);
  }

  async function createIncident(event: FormEvent) {
    event.preventDefault();
    const data = await request<IncidentSnapshot>('/incidents', {
      method: 'POST',
      body: JSON.stringify({
        ...createForm,
        adminId,
        adminName,
      }),
    });
    setIncidents((current) => [data.incident, ...current]);
    setSelectedId(data.incident.id);
    setSnapshot(data);
    setPresence([]);
    setIsJoined(false);
    setNotice(`Created incident ${shortId(data.incident.id)}`);
  }

  function joinIncident() {
    if (!selectedIncident) return;
    socketRef.current?.emit('joinIncident', {
      incidentId: selectedIncident.id,
      adminId,
      adminName,
    });
  }

  function leaveIncident() {
    if (!selectedIncident) return;
    socketRef.current?.emit('leaveIncident', {
      incidentId: selectedIncident.id,
      adminId,
    });
    setIsJoined(false);
    setPresence([]);
    setNotice(`Left incident ${shortId(selectedIncident.id)}`);
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selectedIncident || !message.trim()) return;
    socketRef.current?.emit('sendMessage', {
      incidentId: selectedIncident.id,
      adminId,
      adminName,
      message: message.trim(),
    });
    setMessage('');
  }

  function emitAction(eventName: 'ackIncident' | 'resolveIncident') {
    if (!selectedIncident) return;
    socketRef.current?.emit(eventName, {
      incidentId: selectedIncident.id,
      adminId,
      adminName,
      notes: eventName === 'ackIncident' ? 'Taking ownership' : 'Traffic stable',
    });
  }

  function activateFallback(event: FormEvent) {
    event.preventDefault();
    if (!selectedIncident) return;
    socketRef.current?.emit('activateFallback', {
      incidentId: selectedIncident.id,
      adminId,
      adminName,
      ...fallback,
    });
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Sentinel Gateway</p>
          <h1>Incident Room</h1>
        </div>
        <div className="admin-strip">
          <label>
            Admin ID
            <input value={adminId} onChange={(event) => setAdminId(event.target.value)} />
          </label>
          <label>
            Admin name
            <input value={adminName} onChange={(event) => setAdminName(event.target.value)} />
          </label>
        </div>
      </header>

      <section className="create-band">
        <form onSubmit={createIncident} className="create-form">
          <label>
            Service ID
            <input
              value={createForm.serviceId}
              onChange={(event) =>
                setCreateForm({ ...createForm, serviceId: event.target.value })
              }
            />
          </label>
          <label>
            Provider ID
            <input
              value={createForm.providerId}
              onChange={(event) =>
                setCreateForm({ ...createForm, providerId: event.target.value })
              }
            />
          </label>
          <label>
            Severity
            <select
              value={createForm.severity}
              onChange={(event) =>
                setCreateForm({
                  ...createForm,
                  severity: event.target.value as IncidentSeverity,
                })
              }
            >
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
              <option>CRITICAL</option>
            </select>
          </label>
          <label className="reason-field">
            Reason
            <input
              value={createForm.reason}
              onChange={(event) =>
                setCreateForm({ ...createForm, reason: event.target.value })
              }
            />
          </label>
          <button type="submit">Create Incident</button>
        </form>
      </section>

      <section className="workspace">
        <aside className="incident-list" aria-label="Incident list">
          <div className="panel-heading">
            <h2>Incidents</h2>
            <button type="button" onClick={() => void loadIncidents()}>
              Refresh
            </button>
          </div>
          <div className="list-stack">
            {incidents.map((incident) => (
              <button
                type="button"
                className={`incident-row ${incident.id === selectedIncident?.id ? 'active' : ''}`}
                key={incident.id}
                onClick={() => void loadIncident(incident.id)}
              >
                <span>{incident.reason}</span>
                <small>{incident.status} · {shortId(incident.id)}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="room-panel">
          <div className="room-header">
            <div>
              <p className="eyebrow">Status</p>
              <h2>{selectedIncident?.reason ?? 'No incident selected'}</h2>
              {selectedIncident && (
                <p className="muted">
                  {selectedIncident.status} · {selectedIncident.severity} · {shortId(selectedIncident.id)}
                </p>
              )}
            </div>
            <div className="actions">
              <button type="button" disabled={!selectedIncident || isJoined} onClick={joinIncident}>
                Join
              </button>
              <button type="button" disabled={!selectedIncident || !isJoined} onClick={leaveIncident}>
                Leave
              </button>
              <button type="button" disabled={!selectedIncident} onClick={() => emitAction('ackIncident')}>
                Acknowledge
              </button>
              <button type="button" disabled={!selectedIncident} onClick={() => emitAction('resolveIncident')}>
                Resolve
              </button>
            </div>
          </div>

          <div className="timeline" aria-live="polite">
            {(snapshot?.logs ?? []).map((log) => (
              <article className="log-entry" key={log.id}>
                <div>
                  <strong>{log.action}</strong>
                  <span>{log.adminName}</span>
                </div>
                <p>{formatLogDetails(log)}</p>
                <time>{new Date(log.createdAt).toLocaleString()}</time>
              </article>
            ))}
          </div>

          <form className="message-form" onSubmit={sendMessage}>
            <input
              placeholder="Write an incident update"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={!selectedIncident || !isJoined}
            />
            <button type="submit" disabled={!selectedIncident || !isJoined}>
              Send
            </button>
          </form>
        </section>

        <aside className="side-panel">
          <h2>Presence</h2>
          <div className="presence-list">
            {presence.length === 0 && <p className="muted">No admins joined.</p>}
            {presence.map((admin) => (
              <div className="presence-row" key={admin.socketId}>
                <span>{admin.adminName}</span>
                <small>{admin.adminId}</small>
              </div>
            ))}
          </div>

          <form className="fallback-form" onSubmit={activateFallback}>
            <h2>Fallback</h2>
            <label>
              Service name
              <input
                value={fallback.serviceName}
                onChange={(event) =>
                  setFallback({ ...fallback, serviceName: event.target.value })
                }
              />
            </label>
            <label>
              Fallback provider ID
              <input
                value={fallback.fallbackProviderId}
                onChange={(event) =>
                  setFallback({ ...fallback, fallbackProviderId: event.target.value })
                }
              />
            </label>
            <label>
              Fallback URL
              <input
                value={fallback.fallbackUrl}
                onChange={(event) =>
                  setFallback({ ...fallback, fallbackUrl: event.target.value })
                }
              />
            </label>
            <button type="submit" disabled={!selectedIncident}>
              Activate Fallback
            </button>
          </form>

          <div className="notice">{notice}</div>
        </aside>
      </section>
    </main>
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatLogDetails(log: IncidentLog): string {
  if (typeof log.details.message === 'string') return log.details.message;
  if (typeof log.details.notes === 'string') return log.details.notes;
  if (typeof log.details.reason === 'string') return log.details.reason;
  if (typeof log.details.fallbackUrl === 'string') {
    return `Fallback URL: ${log.details.fallbackUrl}`;
  }
  return JSON.stringify(log.details);
}

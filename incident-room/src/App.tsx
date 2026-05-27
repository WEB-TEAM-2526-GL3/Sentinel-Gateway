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

const API_URL =
  import.meta.env.VITE_SENTINEL_API_URL?.replace(/\/$/, '') ??
  'http://localhost:3000';

const DEMO_SERVICE_ID = '22222222-2222-4222-8222-222222222222';
const DEMO_PROVIDER_ID = '33333333-3333-4333-8333-333333333333';

export default function App() {
  const [adminName, setAdminName] = useState('Ali');
  const [showAdminDetails, setShowAdminDetails] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [snapshot, setSnapshot] = useState<IncidentSnapshot | null>(null);
  const [presence, setPresence] = useState<PresenceAdmin[]>([]);
  const [reason, setReason] = useState('OpenAI timeout spike');
  const [severity, setSeverity] = useState<IncidentSeverity>('HIGH');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('Ready');
  const [error, setError] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [fallback, setFallback] = useState({
    serviceName: 'openai-service',
    fallbackProviderId: '44444444-4444-4444-8444-444444444444',
    fallbackUrl: 'http://gemini.local',
  });
  const socketRef = useRef<Socket | null>(null);

  const adminId = useMemo(() => makeAdminId(adminName), [adminName]);
  const selectedIncident = useMemo(
    () => snapshot?.incident ?? incidents.find((incident) => incident.id === selectedId),
    [incidents, selectedId, snapshot],
  );

  const canAcknowledge = selectedIncident?.status === 'OPEN';
  const canResolve =
    selectedIncident !== undefined && selectedIncident.status !== 'RESOLVED';

  useEffect(() => {
    void loadIncidents();
  }, []);

  useEffect(() => {
    const socket = io(`${API_URL}/incident-room`, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socketRef.current = socket;
    socket.on('connect', () => setNotice('Realtime connected'));
    socket.on('disconnect', () => {
      setNotice('Realtime disconnected');
      setIsJoined(false);
      setPresence([]);
    });
    socket.on(
      'incidentJoined',
      (payload: IncidentSnapshot & { presence: PresenceAdmin[] }) => {
        setSnapshot({ incident: payload.incident, logs: payload.logs });
        setPresence(payload.presence);
        setIsJoined(true);
        setError('');
        setNotice(`Joined ${shortId(payload.incident.id)}`);
      },
    );
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
      setError('');
      setNotice(`${payload.incident.status} update received`);
    });
    socket.on('incidentError', (payload: { message: string }) => {
      setError(payload.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  async function loadIncidents() {
    try {
      const data = await request<Incident[]>('/incidents');
      setIncidents(data);

      if (!selectedId && data[0]) {
        await loadIncident(data[0].id);
      }
    } catch (loadError) {
      setError(readError(loadError));
    }
  }

  async function loadIncident(id: string) {
    try {
      setSelectedId(id);
      const data = await request<IncidentSnapshot>(`/incidents/${id}`);
      setSnapshot(data);
      setPresence([]);
      setIsJoined(false);
      setError('');
      setNotice(`Loaded ${shortId(id)}`);
    } catch (loadError) {
      setError(readError(loadError));
    }
  }

  async function createIncident(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return;

    try {
      const data = await request<IncidentSnapshot>('/incidents', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: DEMO_SERVICE_ID,
          providerId: DEMO_PROVIDER_ID,
          severity,
          reason: reason.trim(),
          adminId,
          adminName,
        }),
      });

      setIncidents((current) => [data.incident, ...current]);
      setSelectedId(data.incident.id);
      setSnapshot(data);
      setPresence([]);
      setIsJoined(false);
      setReason('');
      setError('');
      setNotice(`Created ${shortId(data.incident.id)}`);
    } catch (createError) {
      setError(readError(createError));
    }
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
    setNotice(`Left ${shortId(selectedIncident.id)}`);
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
        <div className="operator">
          <label>
            Admin name
            <input
              value={adminName}
              onChange={(event) => setAdminName(event.target.value)}
            />
          </label>
          <button
            className="secondary"
            type="button"
            onClick={() => setShowAdminDetails((value) => !value)}
          >
            Details
          </button>
          {showAdminDetails && <span className="admin-id">{adminId}</span>}
        </div>
      </header>

      {(error || notice) && (
        <div className={`notice ${error ? 'error' : ''}`}>
          {error || notice}
        </div>
      )}

      <section className="workspace">
        <aside className="left-panel">
          <form className="quick-create" onSubmit={createIncident}>
            <h2>Create Incident</h2>
            <label>
              Reason
              <input
                placeholder="Describe the incident"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <label>
              Severity
              <select
                value={severity}
                onChange={(event) =>
                  setSeverity(event.target.value as IncidentSeverity)
                }
              >
                <option>LOW</option>
                <option>MEDIUM</option>
                <option>HIGH</option>
                <option>CRITICAL</option>
              </select>
            </label>
            <button type="submit">Create</button>
          </form>

          <div className="list-header">
            <h2>Incidents</h2>
            <button className="secondary" type="button" onClick={() => void loadIncidents()}>
              Refresh
            </button>
          </div>

          <div className="incident-list">
            {incidents.length === 0 && (
              <div className="empty">No incidents yet. Create one to start.</div>
            )}
            {incidents.map((incident) => (
              <button
                type="button"
                className={`incident-row ${incident.id === selectedIncident?.id ? 'active' : ''}`}
                key={incident.id}
                onClick={() => void loadIncident(incident.id)}
              >
                <span>{incident.reason}</span>
                <span className="row-meta">
                  <Badge value={incident.status} />
                  <Badge value={incident.severity} />
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="room">
          {!selectedIncident && (
            <div className="empty hero-empty">
              Select or create an incident to open the room.
            </div>
          )}

          {selectedIncident && (
            <>
              <div className="room-header">
                <div>
                  <p className="eyebrow">Selected incident</p>
                  <h2>{selectedIncident.reason}</h2>
                  <div className="badge-line">
                    <Badge value={selectedIncident.status} />
                    <Badge value={selectedIncident.severity} />
                    <span className="muted">#{shortId(selectedIncident.id)}</span>
                  </div>
                </div>
                <div className="actions">
                  <button type="button" disabled={isJoined} onClick={joinIncident}>
                    Join
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={!isJoined}
                    onClick={leaveIncident}
                  >
                    Leave
                  </button>
                  <button
                    type="button"
                    disabled={!canAcknowledge}
                    onClick={() => emitAction('ackIncident')}
                  >
                    Ack
                  </button>
                  <button
                    type="button"
                    disabled={!canResolve}
                    onClick={() => emitAction('resolveIncident')}
                  >
                    Resolve
                  </button>
                </div>
              </div>

              <div className="presence-strip">
                <strong>Presence</strong>
                {presence.length === 0 ? (
                  <span className="muted">No admins joined.</span>
                ) : (
                  presence.map((admin) => (
                    <span className="presence-pill" key={admin.socketId}>
                      {admin.adminName}
                    </span>
                  ))
                )}
              </div>

              <div className="timeline" aria-live="polite">
                {(snapshot?.logs ?? []).length === 0 && (
                  <div className="empty">No timeline entries yet.</div>
                )}
                {(snapshot?.logs ?? []).map((log) => (
                  <article className="log-entry" key={log.id}>
                    <div className="log-head">
                      <strong>{labelAction(log.action)}</strong>
                      <time>{new Date(log.createdAt).toLocaleTimeString()}</time>
                    </div>
                    <p>{formatLogDetails(log)}</p>
                    <small>{log.adminName}</small>
                  </article>
                ))}
              </div>

              <form className="message-form" onSubmit={sendMessage}>
                <input
                  placeholder={isJoined ? 'Write an update' : 'Join the room to chat'}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  disabled={!isJoined}
                />
                <button type="submit" disabled={!isJoined || !message.trim()}>
                  Send
                </button>
              </form>

              <details className="fallback-box">
                <summary>Fallback controls</summary>
                <form className="fallback-form" onSubmit={activateFallback}>
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
                    Provider ID
                    <input
                      value={fallback.fallbackProviderId}
                      onChange={(event) =>
                        setFallback({
                          ...fallback,
                          fallbackProviderId: event.target.value,
                        })
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
                  <button type="submit" disabled={selectedIncident.status === 'RESOLVED'}>
                    Activate
                  </button>
                </form>
              </details>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function Badge({ value }: { value: IncidentStatus | IncidentSeverity }) {
  return <span className={`badge ${value.toLowerCase()}`}>{value}</span>;
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

function makeAdminId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return slug ? `admin-${slug}` : 'admin-demo';
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

function labelAction(action: LogAction): string {
  if (action === 'FALLBACK_ACTIVATED') return 'Fallback activated';
  return action.charAt(0) + action.slice(1).toLowerCase();
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

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type LogAction =
  | 'CREATED'
  | 'MESSAGE'
  | 'ACKNOWLEDGED'
  | 'RESOLVED';

interface Incident {
  id: string;
  serviceId: string;
  providerId: string;
  severity: IncidentSeverity;
  reason: string;
  status: IncidentStatus;
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
  const [adminName, setAdminName] = useState('Ali' + Math.floor(Math.random() * 10000) );
  const [showAdminDetails, setShowAdminDetails] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [snapshot, setSnapshot] = useState<IncidentSnapshot | null>(null);
  const [presence, setPresence] = useState<PresenceAdmin[]>([]);
  const [reason, setReason] = useState('Error number #'+Math.floor(Math.random() * 100000));
  const [severity, setSeverity] = useState<IncidentSeverity>(  ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][
    Math.floor(Math.random() * 4)
  ] as IncidentSeverity);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('Ready');
  const [error, setError] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const hasConnectedRef = useRef(false);
  const selectedIdRef = useRef('');

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
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const socket = io(`${API_URL}/incident-room`, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socketRef.current = socket;
    socket.on('connect', () => {
      socket.emit('subscribeIncidentFeed');
      setNotice('Realtime connected');

      if (hasConnectedRef.current) {
        void loadIncidents();
      }

      hasConnectedRef.current = true;
    });
    socket.on('disconnect', () => {
      setNotice('Realtime disconnected');
      setIsJoined(false);
      setPresence([]);
    });
    socket.on('incidentCreated', (incident: Incident) => {
      setIncidents((current) => upsertIncident(current, incident));
      setError('');
      setNotice(`New incident ${shortId(incident.id)} received`);
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
        upsertIncident(current, payload.incident),
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

      if (!selectedIdRef.current && data[0]) {
        await loadIncident(data[0].id);
      }
    } catch (loadError) {
      setError(readError(loadError));
    }
  }

  async function loadIncident(id: string) {
    try {
      selectedIdRef.current = id;
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

      setIncidents((current) => upsertIncident(current, data.incident));
      selectedIdRef.current = data.incident.id;
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

              {/* Fallback feature removed */}
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

function upsertIncident(current: Incident[], incident: Incident): Incident[] {
  const index = current.findIndex((item) => item.id === incident.id);

  if (index === -1) {
    return [incident, ...current];
  }

  const next = [...current];
  next[index] = incident;
  return next;
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
  return action.charAt(0) + action.slice(1).toLowerCase();
}

function formatLogDetails(log: IncidentLog): string {
  if (typeof log.details.message === 'string') return log.details.message;
  if (typeof log.details.notes === 'string') return log.details.notes;
  if (typeof log.details.reason === 'string') return log.details.reason;
  return JSON.stringify(log.details);
}

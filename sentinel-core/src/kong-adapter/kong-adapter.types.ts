export interface KongService {
  id: string;
  name: string;
  host: string;
  port: number;
  path: string | null;
  protocol: string;
  enabled: boolean;
  retries: number;
  connect_timeout: number;
  write_timeout: number;
  read_timeout: number;
  created_at: number;
  updated_at: number;
  tags: string[] | null;
}

export interface KongRoute {
  id: string;
  name: string | null;
  paths: string[];
  strip_path: boolean;
  protocols: string[];
  methods: string[] | null;
  hosts: string[] | null;
  preserve_host: boolean;
  regex_priority: number;
  https_redirect_status_code: number;
  service: { id: string };
  created_at: number;
  updated_at: number;
  tags: string[] | null;
}

export interface KongConsumer {
  id: string;
  username: string | null;
  custom_id: string | null;
  created_at: number;
  updated_at: number;
  tags: string[] | null;
}

export interface KongApiKey {
  id: string;
  key: string;
  consumer: { id: string };
  created_at: number;
  tags: string[] | null;
}

export interface KongPlugin {
  id: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  service: { id: string } | null;
  route: { id: string } | null;
  consumer: { id: string } | null;
  protocols: string[];
  created_at: number;
  updated_at: number;
  tags: string[] | null;
}

export interface KongNodeInfo {
  version: string;
  hostname: string;
  node_id: string;
  plugins: {
    available_on_server: Record<string, { priority: number; version: string }>;
    enabled_in_cluster: string[];
  };
}

export interface KongStatus {
  database: { reachable: boolean };
  server: {
    connections_active: number;
    connections_reading: number;
    connections_writing: number;
    connections_waiting: number;
    connections_accepted: number;
    connections_handled: number;
    total_requests: number;
  };
  memory: {
    lua_shared_dicts: Record<
      string,
      { capacity: string; allocated_slabs: string }
    >;
    workers_lua_vms: Array<{ http_allocated_gc: string; pid: number }>;
  };
}

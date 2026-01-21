const API_BASE_URL = '/api';

export interface ServiceHealth {
  name: string;
  description: string;
  status: 'running' | 'stopped' | 'warning' | 'error';
  lastCheck: string;
}

export interface ServerConfig {
  host: string;
  user: string;
  project_path: string;
  server_id?: string;
}

export async function fetchStatus() {
  const response = await fetch(`${API_BASE_URL}/status`);
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
}

export async function fetchServers() {
  const response = await fetch(`${API_BASE_URL}/servers`);
  return response.json();
}

export async function fetchConfig() {
  const response = await fetch(`${API_BASE_URL}/config`);
  return response.json();
}

export async function saveServerConfig(config: any) {
    const response = await fetch(`${API_BASE_URL}/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    return response.json();
}

export async function switchServer(serverId: string) {
    const response = await fetch(`${API_BASE_URL}/servers/switch/${serverId}`, {
        method: 'POST'
    });
    return response.json();
}

export async function restartService(service: string) {
  const response = await fetch(`${API_BASE_URL}/restart`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ service }),
  });
  return response.json();
}

export async function syncCode(scope: string) {
  const response = await fetch(`${API_BASE_URL}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scope }),
  });
  return response.json();
}

export async function buildFrontend(type: string, memory_limit: number = 8192, incremental: boolean = true) {
  const response = await fetch(`${API_BASE_URL}/build`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type, memory_limit, incremental }),
  });
  return response.json();
}

export async function fetchLogs(command: string) {
  const response = await fetch(`${API_BASE_URL}/logs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ command }),
  });
  return response.json();
}

export async function fixScratch() {
  const response = await fetch(`${API_BASE_URL}/fix/scratch`, {
    method: 'POST',
  });
  return response.json();
}

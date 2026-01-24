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

export async function fetchStatus(serverId?: string) {
  const url = serverId 
    ? `${API_BASE_URL}/status?server_id=${encodeURIComponent(serverId)}`
    : `${API_BASE_URL}/status`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const text = await response.text();
  if (!text || text.trim() === '') {
    throw new Error('服务器返回空响应');
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('JSON解析失败:', text);
    throw new Error(`JSON解析失败: ${e}`);
  }
}

export async function fetchServers() {
  const response = await fetch(`${API_BASE_URL}/servers`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const text = await response.text();
  if (!text || text.trim() === '') {
    throw new Error('服务器返回空响应');
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('JSON解析失败:', text);
    throw new Error(`JSON解析失败: ${e}`);
  }
}

export async function fetchConfig() {
  const response = await fetch(`${API_BASE_URL}/config`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const text = await response.text();
  if (!text || text.trim() === '') {
    return {}; // config可能为空，返回空对象
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('JSON解析失败:', text);
    throw new Error(`JSON解析失败: ${e}`);
  }
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

export async function restartProject(serverId: string, startScript?: string) {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/restart-project`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ start_script: startScript }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }));
    throw new Error(errorData.detail || errorData.message || `HTTP ${response.status}`);
  }
  
  return response.json();
}

export async function getRestartLog(serverId: string, lines: number = 100) {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/restart-log?lines=${lines}`);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }));
    throw new Error(errorData.detail || errorData.message || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// 解析启动脚本
export async function parseScript(serverId: string, scriptPath?: string) {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/parse-script`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ script_path: scriptPath }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }));
    throw new Error(errorData.detail || errorData.message || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// 服务操作（启动、停止、重启、状态检查）
export async function serviceOperation(
  serverId: string,
  serviceName: string,
  operation: 'start' | 'stop' | 'restart' | 'status',
  scriptPath?: string
) {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/service-operation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      service_name: serviceName,
      operation: operation,
      script_path: scriptPath,
    }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }));
    throw new Error(errorData.detail || errorData.message || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// 本地服务状态检查（用于 localhost 模式）
export async function localServiceStatus(serviceId: string, checkCommand: string, port?: number) {
  const response = await fetch(`${API_BASE_URL}/services/local/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_id: serviceId, check_command: checkCommand, port }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.detail || `HTTP ${response.status}`);
  }
  return data;
}

// 本地服务操作（启动、停止、重启，用于 localhost 模式）
export async function localServiceOperation(
  serviceId: string,
  operation: 'start' | 'stop' | 'restart',
  command?: string
) {
  const response = await fetch(`${API_BASE_URL}/services/local/operation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_id: serviceId, operation, command: command || '' }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.detail || `HTTP ${response.status}`);
  }
  return data;
}

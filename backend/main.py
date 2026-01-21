from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import sys
import os
import json
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

# Add MCP path to sys.path
# Assuming we run this from /home/sharelgx/MetaSeekOJdev/backend/
# We need to go up one level and then into mcp-servers/code-sync
mcp_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../mcp-servers/code-sync'))
if mcp_path not in sys.path:
    sys.path.append(mcp_path)

try:
    from server import CodeSyncMCP
except ImportError as e:
    print(f"Error importing CodeSyncMCP from {mcp_path}: {e}")
    # Fallback for dev/test if path is wrong
    class CodeSyncMCP:
        def list_servers(self): return {"servers": {}}
        def get_config(self): return {}
        def check_status(self): return {"success": False, "error": "MCP not loaded"}
        def restart_services(self, service): return {"success": False}
        def sync_code(self, scope): return {"success": False}
        def build_react_frontend(self, **kwargs): return {"success": False}
        def build_vue_admin_frontend(self): return {"success": False}
        def ssh_exec(self, cmd): return {"success": False}
        def fix_scratch_editor(self): return {"success": False}

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev, allow all. In prod, specific origins.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MCP instance
# We might want to persist this or re-init per request if it's stateless enough.
# CodeSyncMCP seems to hold state (current server config), so a global instance is better for now.
mcp = CodeSyncMCP()

class CommandRequest(BaseModel):
    command: str

class SyncRequest(BaseModel):
    scope: str

class BuildRequest(BaseModel):
    type: str # 'react' or 'vue'
    memory_limit: Optional[int] = 8192
    incremental: Optional[bool] = True

class RestartRequest(BaseModel):
    service: str

class ServerConfigRequest(BaseModel):
    server_id: str
    name: str
    host: str
    user: str
    password: str
    project_path: str

@app.get("/")
async def root():
    return {"message": "Ops Dashboard API is running"}

@app.get("/api/status")
async def get_status():
    return mcp.check_status()

@app.get("/api/servers")
async def list_servers():
    return mcp.list_servers()

@app.get("/api/config")
async def get_config():
    return mcp.get_config()

@app.post("/api/servers/switch/{server_id}")
async def switch_server(server_id: str):
    return mcp.switch_server(server_id)

@app.post("/api/servers")
async def save_server(config: ServerConfigRequest):
    return mcp.save_server_config(config.server_id, config.dict())

@app.delete("/api/servers/{server_id}")
async def delete_server(server_id: str):
    return mcp.delete_server_config(server_id)

@app.post("/api/sync")
async def sync_code(request: SyncRequest):
    return mcp.sync_code(request.scope)

@app.post("/api/build")
async def build_frontend(request: BuildRequest):
    if request.type == 'react':
        return mcp.build_react_frontend(memory_limit=request.memory_limit, incremental=request.incremental)
    elif request.type == 'vue':
        return mcp.build_vue_admin_frontend()
    else:
        raise HTTPException(status_code=400, detail="Invalid build type")

@app.get("/api/profile")
async def get_profile():
    # Dummy profile for dev
    return {"user": "admin", "role": "admin"}

@app.post("/api/login")
async def login():
    return {"success": True, "token": "dummy-token"}

@app.get("/api/logout")
async def logout():
    return {"success": True}

@app.post("/api/restart")
async def restart_service(request: RestartRequest):
    return mcp.restart_services(request.service)

@app.post("/api/fix/scratch")
async def fix_scratch():
    return mcp.fix_scratch_editor()

@app.post("/api/logs")
async def fetch_logs(request: CommandRequest):
    # Security note: In prod, validate the command or file path strictly.
    # Here we assume internal tool usage.
    # But strictly speaking we should only allow tailing specific files.
    allowed_files = [
        "/tmp/oj_error.log", 
        "/tmp/oj_access.log",
        "/var/log/nginx/error.log",
        "/var/log/nginx/access.log",
        "/tmp/scratch_editor.log",
        "/home/ubuntu/MetaSeekOJ/logs/scratch-runner.log"
    ]
    
    # Simple check if the command is a tail command on allowed files
    # This is a weak check, but better than nothing for now.
    is_allowed = False
    for f in allowed_files:
        if f in request.command and request.command.startswith("tail"):
            is_allowed = True
            break
            
    if not is_allowed:
        return {"success": False, "error": "Command not allowed or file not permitted"}
        
    return mcp.ssh_exec(request.command)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

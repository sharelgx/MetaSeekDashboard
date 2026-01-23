from fastapi import FastAPI, HTTPException, Body, Depends
from fastapi.middleware.cors import CORSMiddleware
import sys
import os
import json
import re
import subprocess
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from ssh_manager import ssh_manager
from database import get_db, engine, Base
from models import ServerConfig

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
    print(f"Using fallback CodeSyncMCP class with PostgreSQL database")
    # Fallback: 使用数据库存储的 CodeSyncMCP 类
    class CodeSyncMCP:
        def __init__(self, db: Session = None):
            """初始化，可以传入数据库会话，如果没有则每次操作时创建"""
            self._db = db
            self._current_server_id = None  # 当前选中的服务器ID
        
        def _get_db(self):
            """获取数据库会话"""
            if self._db:
                return self._db
            # 如果没有传入会话，创建一个新的（用于独立调用）
            from database import SessionLocal
            return SessionLocal()
        
        def list_servers(self, db: Session = None): 
            """列出所有服务器配置"""
            try:
                session = db if db else self._get_db()
                servers = session.query(ServerConfig).filter(ServerConfig.is_active == True).all()
                result = {}
                for server in servers:
                    try:
                        result[server.server_id] = server.to_dict()
                    except Exception as e:
                        print(f"Error converting server {server.server_id} to dict: {e}")
                        # 跳过有问题的服务器配置，继续处理其他服务器
                        continue
                
                if not db:
                    session.close()
                return {"servers": result}
            except Exception as e:
                import traceback
                error_trace = traceback.format_exc()
                print(f"Error listing servers: {e}")
                print(f"Traceback: {error_trace}")
                # 确保返回有效的字典结构
                return {"servers": {}}
        
        def get_config(self):
            """获取当前服务器的配置"""
            if not self._current_server_id:
                return {"error": "未选择服务器"}
            
            try:
                session = self._get_db()
                server = session.query(ServerConfig).filter(
                    ServerConfig.server_id == self._current_server_id,
                    ServerConfig.is_active == True
                ).first()
                
                if server:
                    return server.to_dict()
                return {"error": "服务器不存在"}
            except Exception as e:
                print(f"Error getting config: {e}")
                return {"error": str(e)}
            finally:
                if not self._db:
                    session.close()
        
        def switch_server(self, server_id: str, db: Session = None):
            """切换当前服务器"""
            try:
                session = db if db else self._get_db()
                server = session.query(ServerConfig).filter(
                    ServerConfig.server_id == server_id,
                    ServerConfig.is_active == True
                ).first()
                
                if not server:
                    return {"success": False, "error": f"服务器 {server_id} 不存在"}
                
                self._current_server_id = server_id
                return {"success": True, "message": f"已切换到服务器: {server.name}"}
            except Exception as e:
                print(f"Error switching server: {e}")
                return {"success": False, "error": str(e)}
            finally:
                if not db:
                    session.close()
        
        def save_server_config(self, server_id: str, config: dict, db: Session = None):
            """保存服务器配置"""
            try:
                session = db if db else self._get_db()
                server = session.query(ServerConfig).filter(ServerConfig.server_id == server_id).first()
                
                if server:
                    # 更新现有配置
                    for key, value in config.items():
                        if hasattr(server, key):
                            setattr(server, key, value)
                else:
                    # 创建新配置
                    server = ServerConfig(server_id=server_id, **config)
                    session.add(server)
                
                session.commit()
                return {"success": True, "message": "配置已保存"}
            except Exception as e:
                session.rollback()
                print(f"Error saving server config: {e}")
                return {"success": False, "error": str(e)}
            finally:
                if not db:
                    session.close()
        
        def delete_server_config(self, server_id: str, db: Session = None):
            """删除服务器配置（软删除）"""
            try:
                session = db if db else self._get_db()
                server = session.query(ServerConfig).filter(ServerConfig.server_id == server_id).first()
                
                if server:
                    server.is_active = False
                    session.commit()
                    return {"success": True, "message": "配置已删除"}
                return {"success": False, "error": "服务器不存在"}
            except Exception as e:
                session.rollback()
                print(f"Error deleting server config: {e}")
                return {"success": False, "error": str(e)}
            finally:
                if not db:
                    session.close()
        
        def check_status(self, server_id: str = None, db: Session = None):
            """检查服务器状态"""
            target_server_id = server_id or self._current_server_id
            if not target_server_id:
                return {"success": False, "error": "未指定服务器"}
            
            try:
                session = db if db else self._get_db()
                server = session.query(ServerConfig).filter(
                    ServerConfig.server_id == target_server_id,
                    ServerConfig.is_active == True
                ).first()
                
                if not server:
                    return {"success": False, "error": "服务器不存在"}
                
                # 连接SSH并检查状态
                password = server.password if server.auth_type == "password" else None
                private_key_path = server.private_key_path if server.auth_type == "key" else None
                private_key_content = server.private_key_content if server.auth_type == "key" else None
                
                result = ssh_manager.connect(
                    host=server.host,
                    user=server.user,
                    port=server.port or 22,
                    password=password,
                    private_key_path=private_key_path,
                    private_key_content=private_key_content,
                    timeout=10
                )
                
                if not result.get("success"):
                    return {"success": False, "error": f"SSH连接失败: {result.get('message')}"}
                
                # 执行状态检查命令
                status_command = f"cd {server.project_path} && bash -c 'source /dev/stdin <<< \"$(cat <<EOF\n$(curl -s https://raw.githubusercontent.com/MetaSeekOJ/MetaSeekOJ/main/scripts/check_status.sh 2>/dev/null || echo \"echo \\\"Status check script not available\\\"\")\nEOF\n)\" 2>/dev/null || echo \"Status check failed\"'"
                
                # 简化版本：直接检查常见服务
                check_commands = [
                    "ps aux | grep -E '(python3.*manage.py|nginx|judge|heartbeat)' | grep -v grep || echo 'No services found'",
                    "systemctl status nginx 2>&1 | head -3 || echo 'Nginx not found'",
                    "curl -s http://localhost:8000/api/website/ 2>&1 | head -1 || echo 'API not responding'"
                ]
                
                all_output = []
                for cmd in check_commands:
                    exec_result = ssh_manager.execute_command(f"cd {server.project_path} && {cmd}")
                    if exec_result.get("success"):
                        all_output.append(exec_result.get("stdout", ""))
                
                ssh_manager.close()
                
                return {
                    "success": True,
                    "stdout": "\n".join(all_output),
                    "server_id": target_server_id
                }
            except Exception as e:
                import traceback
                print(f"Error checking status: {e}")
                print(traceback.format_exc())
                return {"success": False, "error": str(e)}
            finally:
                if not db:
                    try:
                        session.close()
                    except:
                        pass
        
        def sync_code(self, scope: str):
            """同步代码（占位实现）"""
            return {"success": False, "error": "功能未实现"}
        
        def build_react_frontend(self, memory_limit: int = 8192, incremental: bool = True):
            """构建React前端（占位实现）"""
            return {"success": False, "error": "功能未实现"}
        
        def build_vue_admin_frontend(self):
            """构建Vue管理后台（占位实现）"""
            return {"success": False, "error": "功能未实现"}
        
        def restart_services(self, service: str):
            """重启服务（占位实现）"""
            return {"success": False, "error": "功能未实现"}
        
        def fix_scratch_editor(self):
            """修复Scratch编辑器（占位实现）"""
            return {"success": False, "error": "功能未实现"}
        
        def ssh_exec(self, command: str):
            """执行SSH命令（占位实现）"""
            return {"success": False, "error": "功能未实现"}

# 初始化数据库表
Base.metadata.create_all(bind=engine)

# 初始化MCP实例
# 使用数据库存储，每次请求时传入数据库会话
mcp = CodeSyncMCP()

app = FastAPI(title="Ops Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev, allow all. In prod, specific origins.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request models
class ServerConfigRequest(BaseModel):
    server_id: str
    name: str
    host: str
    user: str
    port: Optional[int] = 22
    auth_type: str = "password"  # "password" or "key"
    password: Optional[str] = None
    private_key_path: Optional[str] = None
    private_key_content: Optional[str] = None
    project_path: str
    start_script: Optional[str] = None

class SyncRequest(BaseModel):
    scope: str

class BuildRequest(BaseModel):
    type: str  # "react" or "vue"
    memory_limit: Optional[int] = 8192
    incremental: Optional[bool] = True

class RestartRequest(BaseModel):
    service: str

class CommandRequest(BaseModel):
    command: str

class RestartProjectRequest(BaseModel):
    start_script: Optional[str] = None

class BrowsePathRequest(ServerConfigRequest):
    path: Optional[str] = Field(default="/", description="要浏览的路径")

class LoginRequest(BaseModel):
    username: str
    password: str

# 解析启动脚本的请求模型
class ParseScriptRequest(BaseModel):
    script_path: Optional[str] = None  # 如果为空，使用服务器配置中的start_script

# 服务操作请求模型
class ServiceOperationRequest(BaseModel):
    service_name: str
    operation: str  # "start", "stop", "restart", "status"
    script_path: Optional[str] = None

@app.get("/")
async def root():
    return {"message": "Ops Dashboard API is running"}

@app.get("/api/status")
async def get_status(server_id: Optional[str] = None, db: Session = Depends(get_db)):
    """获取服务器状态，可以指定 server_id 或使用当前选中的服务器"""
    return mcp.check_status(server_id=server_id, db=db)

@app.get("/api/servers")
async def list_servers(db: Session = Depends(get_db)):
    try:
        result = mcp.list_servers(db=db)
        return result
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error listing servers: {e}")
        print(f"Traceback: {error_trace}")
        # 返回空列表而不是500错误，避免前端崩溃
        return {"servers": {}}

@app.get("/api/config")
async def get_config():
    return mcp.get_config()

# 注意：更具体的路由必须放在更通用的路由之前
# /api/servers/browse-path 必须在 /api/servers/{server_id} 之前
@app.post("/api/servers/browse-path")
async def browse_path(request: BrowsePathRequest):
    """
    浏览远程服务器目录
    返回指定路径下的文件和文件夹列表
    """
    try:
        # 验证认证信息
        if request.auth_type == "password":
            if not request.password or not request.password.strip():
                raise HTTPException(status_code=422, detail="密码认证模式下，密码不能为空")
        elif request.auth_type == "key":
            if not request.private_key_path and not request.private_key_content:
                raise HTTPException(status_code=422, detail="密钥认证模式下，必须提供私钥路径或私钥内容")
        
        # 根据认证类型选择参数
        password = request.password.strip() if request.auth_type == "password" and request.password else None
        private_key_path = request.private_key_path.strip() if request.private_key_path else None
        private_key_content = request.private_key_content.strip() if request.private_key_content else None
        
        # 连接SSH
        result = ssh_manager.connect(
            host=request.host,
            user=request.user,
            port=request.port or 22,
            password=password,
            private_key_path=private_key_path,
            private_key_content=private_key_content,
            timeout=10
        )
        
        if not result.get("success"):
            # 连接失败，确保清理连接
            try:
                ssh_manager.close()
            except:
                pass
            raise HTTPException(status_code=500, detail=f"SSH连接失败: {result.get('message')}")
        
        # 获取要浏览的路径
        browse_path = request.path if request.path else "/"
        if not browse_path:
            browse_path = "/"
        
        try:
            # 执行 ls 命令列出文件和目录
            # -p 在目录后添加 /，-1 每行一个文件，-a 显示隐藏文件
            command = f"ls -1pa '{browse_path}' 2>/dev/null || echo 'ERROR: Directory not found'"
            exec_result = ssh_manager.execute_command(command)
            
            if not exec_result.get("success") or "ERROR" in exec_result.get("stdout", ""):
                return {
                    "success": False,
                    "message": f"无法访问路径: {browse_path}",
                    "path": browse_path,
                    "items": []
                }
        finally:
            # 确保连接被关闭
            try:
                ssh_manager.close()
            except:
                pass
        
        # 解析输出
        output = exec_result.get("stdout", "")
        items = []
        for line in output.strip().split("\n"):
            if line.strip() and not line.strip().endswith("/.") and not line.strip().endswith("/.."):
                item_name = line.strip().rstrip("/")
                is_directory = line.strip().endswith("/")
                items.append({
                    "name": item_name,
                    "type": "directory" if is_directory else "file",
                    "path": f"{browse_path.rstrip('/')}/{item_name}" if browse_path != "/" else f"/{item_name}"
                })
        
        # 排序：目录在前，文件在后
        items.sort(key=lambda x: (x["type"] != "directory", x["name"].lower()))
        
        return {
            "success": True,
            "path": browse_path,
            "items": items
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error browsing path: {e}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"浏览目录失败: {str(e)}")

@app.post("/api/servers/switch/{server_id}")
async def switch_server(server_id: str, db: Session = Depends(get_db)):
    try:
        result = mcp.switch_server(server_id, db=db)
        if isinstance(result, dict) and result.get("success") is False:
            raise HTTPException(status_code=400, detail=result.get("error") or "切换服务器失败")
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error switching server: {e}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"切换服务器失败: {str(e)}")

@app.post("/api/servers/test-connection")
async def test_connection(config: ServerConfigRequest):
    """
    测试服务器连接
    不保存配置，仅测试连接是否成功
    """
    try:
        # 验证认证信息
        if config.auth_type == "password":
            if not config.password or not config.password.strip():
                return {
                    "success": False,
                    "message": "密码认证模式下，密码不能为空",
                    "error": "password is required for password authentication"
                }
        elif config.auth_type == "key":
            if not config.private_key_path and not config.private_key_content:
                return {
                    "success": False,
                    "message": "密钥认证模式下，必须提供私钥路径或私钥内容",
                    "error": "private_key_path or private_key_content is required for key authentication"
                }
        
        # 根据认证类型选择参数
        password = config.password.strip() if config.auth_type == "password" and config.password else None
        private_key_path = config.private_key_path.strip() if config.private_key_path else None
        private_key_content = config.private_key_content.strip() if config.private_key_content else None
        
        # 尝试连接
        result = ssh_manager.connect(
            host=config.host,
            user=config.user,
            port=config.port or 22,
            password=password,
            private_key_path=private_key_path,
            private_key_content=private_key_content,
            timeout=10
        )
        
        try:
            if result.get("success"):
                # 测试连接是否真的可用
                test_result = ssh_manager.test_connection()
                
                if test_result.get("success"):
                    return {
                        "success": True,
                        "message": "连接测试成功",
                        "output": test_result.get("output", ""),
                        "server_info": test_result.get("output", "").split("\n") if test_result.get("output") else []
                    }
                else:
                    return {
                        "success": False,
                        "message": "连接建立但测试失败",
                        "error": test_result.get("error", "Unknown error")
                    }
            else:
                return {
                    "success": False,
                    "message": result.get("message", "连接失败"),
                    "error": result.get("error", "Unknown error")
                }
        finally:
            # 确保连接被关闭
            try:
                ssh_manager.close()
            except:
                pass
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Test connection error: {e}")
        print(f"Traceback: {error_trace}")
        return {
            "success": False,
            "message": f"连接测试异常: {str(e)}",
            "error": str(e)
        }

@app.post("/api/servers")
async def save_server(config: ServerConfigRequest, db: Session = Depends(get_db)):
    try:
        # 根据认证类型验证必需字段
        if config.auth_type == "password":
            if not config.password or not config.password.strip():
                raise HTTPException(
                    status_code=422, 
                    detail="使用密码认证时，password 字段不能为空"
                )
        elif config.auth_type == "key":
            if not config.private_key_path and not config.private_key_content:
                raise HTTPException(
                    status_code=422,
                    detail="使用密钥认证时，必须提供 private_key_path 或 private_key_content"
                )
        
        # 使用 Pydantic v2 的 model_dump，但保留空字符串的start_script
        config_dict = config.model_dump(exclude_none=True)
        # 确保start_script字段被保存（即使为空字符串）
        if hasattr(config, 'start_script'):
            config_dict['start_script'] = config.start_script or None
        print(f"Saving server config: {config_dict.get('server_id')}, auth_type: {config_dict.get('auth_type')}, start_script: {config_dict.get('start_script')}")
        
        # 清理数据：根据认证类型移除不需要的字段
        if config.auth_type == "password":
            config_dict.pop("private_key_path", None)
            config_dict.pop("private_key_content", None)
        elif config.auth_type == "key":
            config_dict.pop("password", None)
        
        result = mcp.save_server_config(config.server_id, config_dict, db=db)
        
        if not result:
            raise HTTPException(status_code=500, detail="保存配置失败：未返回结果")
        
        # 检查返回结果中是否有错误
        if isinstance(result, dict) and result.get("success") is False:
            error_msg = result.get("error") or result.get("message") or "保存配置失败"
            raise HTTPException(status_code=500, detail=error_msg)
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error saving server config: {e}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"保存配置失败: {str(e)}")

@app.delete("/api/servers/{server_id}")
async def delete_server(server_id: str, db: Session = Depends(get_db)):
    try:
        result = mcp.delete_server_config(server_id, db=db)
        if isinstance(result, dict) and result.get("success") is False:
            raise HTTPException(status_code=400, detail=result.get("error") or "删除服务器配置失败")
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error deleting server config: {e}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"删除服务器配置失败: {str(e)}")

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
async def login(request: LoginRequest):
    # 验证用户名和密码
    valid_credentials = [
        {"username": "admin", "password": "123456"},
        {"username": "root", "password": "123456"}
    ]
    
    for cred in valid_credentials:
        if request.username == cred["username"] and request.password == cred["password"]:
            return {
                "success": True, 
                "token": "admin-token",
                "user": {
                    "username": request.username,
                    "role": "admin"
                }
            }
    
    raise HTTPException(
        status_code=401, 
        detail="用户名或密码错误"
    )

@app.get("/api/logout")
async def logout():
    return {"success": True}

@app.post("/api/restart")
async def restart_service(request: RestartRequest):
    return mcp.restart_services(request.service)

@app.post("/api/servers/{server_id}/restart-project")
async def restart_project(server_id: str, request: Optional[RestartProjectRequest] = None, db: Session = Depends(get_db)):
    """
    重启指定服务器的项目
    执行项目的启动脚本
    """
    try:
        # 获取服务器列表
        servers_result = mcp.list_servers(db=db)
        servers = servers_result.get("servers", {})
        
        if server_id not in servers:
            raise HTTPException(status_code=404, detail=f"服务器 {server_id} 不存在")
        
        server_config = servers[server_id]
        
        # 获取启动脚本路径（支持自定义，默认使用标准路径）
        start_script = request.start_script if request and request.start_script else None
        if not start_script:
            # 默认使用服务器配置中的启动脚本，或使用标准路径
            start_script = server_config.get("start_script") or "/home/sharelgx/MetaSeekOJdev/start_dev.sh"
        
        # 构建完整命令（在后台运行，并重定向输出）
        # 切换到项目目录并执行启动脚本
        project_path = server_config.get("project_path", "")
        log_file = f"/tmp/project_restart_{server_id}.log"
        
        # 清空之前的日志文件，并立即开始写入
        # 使用 nohup 确保进程在 SSH 断开后继续运行
        # 使用 stdbuf -oL -eL 禁用行缓冲，确保输出实时写入
        # 如果系统没有 stdbuf，则使用 script 命令或直接执行
        command = f"""
        cd {project_path} && \\
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始执行启动脚本: {start_script}" > {log_file} && \\
        (nohup bash -c "cd {project_path} && stdbuf -oL -eL bash {start_script} 2>&1 || bash {start_script} 2>&1" >> {log_file} 2>&1 &) && \\
        sleep 0.5 && \\
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 启动脚本已在后台执行" >> {log_file} && \\
        tail -5 {log_file}
        """
        
        # 连接SSH
        password = server_config.get("password") if server_config.get("auth_type") == "password" else None
        private_key_path = server_config.get("private_key_path") if server_config.get("auth_type") == "key" else None
        private_key_content = server_config.get("private_key_content") if server_config.get("auth_type") == "key" else None
        
        result = ssh_manager.connect(
            host=server_config.get("host"),
            user=server_config.get("user"),
            port=server_config.get("port", 22),
            password=password,
            private_key_path=private_key_path,
            private_key_content=private_key_content,
            timeout=10
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=f"SSH连接失败: {result.get('message')}")
        
        # 执行命令
        exec_result = ssh_manager.execute_command(command)
        ssh_manager.close()
        
        if exec_result.get("success"):
            log_file = f"/tmp/project_restart_{server_id}.log"
            return {
                "success": True,
                "message": f"项目重启命令已执行: {server_config.get('name')}",
                "output": exec_result.get("stdout", ""),
                "log_file": log_file
            }
        else:
            return {
                "success": False,
                "message": f"项目重启失败: {exec_result.get('error')}",
                "error": exec_result.get("error"),
                "stderr": exec_result.get("stderr", "")
            }
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error restarting project: {e}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"重启项目失败: {str(e)}")

@app.get("/api/servers/{server_id}/restart-log")
async def get_restart_log(server_id: str, lines: int = 100, db: Session = Depends(get_db)):
    """
    获取指定服务器的重启日志
    返回最近N行的日志内容
    """
    try:
        # 获取服务器列表
        servers_result = mcp.list_servers(db=db)
        servers = servers_result.get("servers", {})
        
        if server_id not in servers:
            raise HTTPException(status_code=404, detail=f"服务器 {server_id} 不存在")
        
        server_config = servers[server_id]
        log_file = f"/tmp/project_restart_{server_id}.log"
        
        # 连接SSH
        password = server_config.get("password") if server_config.get("auth_type") == "password" else None
        private_key_path = server_config.get("private_key_path") if server_config.get("auth_type") == "key" else None
        private_key_content = server_config.get("private_key_content") if server_config.get("auth_type") == "key" else None
        
        result = ssh_manager.connect(
            host=server_config.get("host"),
            user=server_config.get("user"),
            port=server_config.get("port", 22),
            password=password,
            private_key_path=private_key_path,
            private_key_content=private_key_content,
            timeout=10
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=f"SSH连接失败: {result.get('message')}")
        
        # 读取日志文件（如果文件不存在，返回提示信息）
        # 使用更友好的错误处理
        command = f"if [ -f {log_file} ]; then tail -n {lines} {log_file}; else echo '[日志文件尚未创建，请稍候...]'; fi"
        exec_result = ssh_manager.execute_command(command)
        ssh_manager.close()
        
        if exec_result.get("success"):
            return {
                "success": True,
                "log_content": exec_result.get("stdout", ""),
                "log_file": log_file
            }
        else:
            return {
                "success": False,
                "error": exec_result.get("error", "读取日志失败"),
                "log_content": "",
                "log_file": log_file
            }
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error reading restart log: {e}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"读取重启日志失败: {str(e)}")

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

@app.get("/api/health/postgresql")
async def health_check_postgresql():
    """检查PostgreSQL服务状态"""
    try:
        from database import check_database_connection
        if check_database_connection():
            return {"status": "running", "service": "postgresql"}
        else:
            return {"status": "error", "service": "postgresql", "message": "数据库连接失败"}
    except Exception as e:
        return {"status": "error", "service": "postgresql", "message": str(e)}

# 解析启动脚本，提取服务和依赖
def parse_start_script(script_content: str) -> Dict[str, Any]:
    """
    解析启动脚本，提取服务和依赖信息
    返回格式：
    {
        "services": [
            {"name": "PostgreSQL", "type": "dependency", "start_command": "...", "stop_command": "...", "check_command": "..."},
            {"name": "Backend", "type": "service", "start_command": "...", "stop_command": "...", "check_command": "..."}
        ],
        "dependencies": [...]
    }
    """
    services = []
    dependencies = []
    
    # 解析函数定义
    function_pattern = r'^(\w+)\(\)\s*\{'
    functions = {}
    current_function = None
    current_content = []
    
    lines = script_content.split('\n')
    for i, line in enumerate(lines):
        func_match = re.match(function_pattern, line.strip())
        if func_match:
            if current_function:
                functions[current_function] = '\n'.join(current_content)
            current_function = func_match.group(1)
            current_content = []
        elif current_function:
            current_content.append(line)
    
    if current_function:
        functions[current_function] = '\n'.join(current_content)
    
    # 识别服务和依赖
    service_keywords = {
        'postgresql': {'name': 'PostgreSQL', 'type': 'dependency'},
        'backend': {'name': 'Backend', 'type': 'service'},
        'frontend': {'name': 'Frontend', 'type': 'service'},
        'nginx': {'name': 'Nginx', 'type': 'service'},
        'judge': {'name': 'Judge Server', 'type': 'service'},
        'heartbeat': {'name': 'Heartbeat Monitor', 'type': 'service'},
        'scratch': {'name': 'Scratch Runner', 'type': 'service'},
    }
    
    for func_name, func_content in functions.items():
        func_lower = func_name.lower()
        for keyword, info in service_keywords.items():
            if keyword in func_lower:
                # 提取启动命令
                start_patterns = [
                    r'(nohup\s+[^\n&]+)',
                    r'(python3\s+[^\n&]+)',
                    r'(npm\s+run\s+[^\n&]+)',
                    r'(service\s+\w+\s+start)',
                    r'(sudo\s+service\s+\w+\s+start)',
                ]
                
                start_command = None
                for pattern in start_patterns:
                    match = re.search(pattern, func_content, re.MULTILINE)
                    if match:
                        start_command = match.group(1).strip()
                        break
                
                # 提取检查命令
                check_patterns = [
                    r'(pg_isready[^\n]+)',
                    r'(curl\s+[^\n]+)',
                    r'(ps\s+aux\s+\|\s+grep[^\n]+)',
                    r'(check_port\s+\d+)',
                ]
                
                check_command = None
                for pattern in check_patterns:
                    match = re.search(pattern, func_content, re.MULTILINE)
                    if match:
                        check_command = match.group(1).strip()
                        break
                
                service_info = {
                    "name": info['name'],
                    "type": info['type'],
                    "function_name": func_name,
                    "start_command": start_command,
                    "check_command": check_command,
                }
                
                if info['type'] == 'dependency':
                    dependencies.append(service_info)
                else:
                    services.append(service_info)
                break
    
    return {
        "services": services,
        "dependencies": dependencies,
        "functions": list(functions.keys())
    }

@app.post("/api/servers/{server_id}/parse-script")
async def parse_script(server_id: str, request: Optional[ParseScriptRequest] = None, db: Session = Depends(get_db)):
    """
    解析指定服务器的启动脚本，提取服务和依赖信息
    """
    try:
        servers_result = mcp.list_servers(db=db)
        servers = servers_result.get("servers", {})
        
        if server_id not in servers:
            raise HTTPException(status_code=404, detail=f"服务器 {server_id} 不存在")
        
        server_config = servers[server_id]
        
        # 获取启动脚本路径
        script_path = None
        if request and request.script_path:
            script_path = request.script_path
        elif server_config.get("start_script"):
            script_path = server_config.get("start_script")
        else:
            raise HTTPException(status_code=400, detail="未指定启动脚本路径")
        
        project_path = server_config.get("project_path", "")
        
        # 连接SSH并读取脚本内容
        password = server_config.get("password") if server_config.get("auth_type") == "password" else None
        private_key_path = server_config.get("private_key_path") if server_config.get("auth_type") == "key" else None
        private_key_content = server_config.get("private_key_content") if server_config.get("auth_type") == "key" else None
        
        result = ssh_manager.connect(
            host=server_config.get("host"),
            user=server_config.get("user"),
            port=server_config.get("port", 22),
            password=password,
            private_key_path=private_key_path,
            private_key_content=private_key_content,
            timeout=10
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=f"SSH连接失败: {result.get('message')}")
        
        # 读取脚本内容
        read_command = f"cat '{script_path}' 2>/dev/null || echo 'SCRIPT_NOT_FOUND'"
        exec_result = ssh_manager.execute_command(read_command)
        ssh_manager.close()
        
        if not exec_result.get("success") or "SCRIPT_NOT_FOUND" in exec_result.get("stdout", ""):
            raise HTTPException(status_code=404, detail=f"启动脚本不存在: {script_path}")
        
        script_content = exec_result.get("stdout", "")
        
        # 解析脚本
        parsed = parse_start_script(script_content)
        
        return {
            "success": True,
            "script_path": script_path,
            "parsed": parsed
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error parsing script: {e}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"解析启动脚本失败: {str(e)}")

@app.post("/api/servers/{server_id}/service-operation")
async def service_operation_endpoint(server_id: str, request: ServiceOperationRequest, db: Session = Depends(get_db)):
    """
    对指定服务器的服务执行操作（启动、停止、重启、状态检查）
    """
    try:
        servers_result = mcp.list_servers(db=db)
        servers = servers_result.get("servers", {})
        
        if server_id not in servers:
            raise HTTPException(status_code=404, detail=f"服务器 {server_id} 不存在")
        
        server_config = servers[server_id]
        project_path = server_config.get("project_path", "")
        
        # 连接SSH
        password = server_config.get("password") if server_config.get("auth_type") == "password" else None
        private_key_path = server_config.get("private_key_path") if server_config.get("auth_type") == "key" else None
        private_key_content = server_config.get("private_key_content") if server_config.get("auth_type") == "key" else None
        
        result = ssh_manager.connect(
            host=server_config.get("host"),
            user=server_config.get("user"),
            port=server_config.get("port", 22),
            password=password,
            private_key_path=private_key_path,
            private_key_content=private_key_content,
            timeout=10
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=f"SSH连接失败: {result.get('message')}")
        
        # 根据操作类型执行相应命令
        operation = request.operation.lower()
        service_name = request.service_name
        
        # 构建命令（根据服务名称和操作类型）
        command = None
        
        if operation == "status":
            # 健康检查 - 根据服务名称匹配检查命令
            service_lower = service_name.lower()
            if "postgresql" in service_lower or "postgres" in service_lower:
                command = "pg_isready -h localhost -p 5432"
            elif "backend" in service_lower or "django" in service_lower:
                # 只匹配Django Backend (8086端口)，排除Opsdashboard的main.py
                command = "ps aux | grep -E 'python.*manage.py runserver.*8086' | grep -v grep || echo 'NOT_RUNNING'"
            elif "nginx" in service_lower:
                command = "systemctl status nginx 2>&1 | head -3 || service nginx status 2>&1 | head -3"
            elif "dramatiq" in service_lower or ("worker" in service_lower and "dramatiq" in service_lower):
                command = "ps aux | grep -E 'start_dramatiq_worker\\.py|manage\\.py rundramatiq|dramatiq.*judge\\.tasks' | grep -v grep || echo 'NOT_RUNNING'"
            elif "heartbeat" in service_lower:
                command = "ps aux | grep -E 'heartbeat_metaseek_judge\\.py' | grep -v grep || echo 'NOT_RUNNING'"
            elif "scratch.*editor" in service_lower or ("scratch" in service_lower and "editor" in service_lower):
                command = "ps aux | grep -E 'scratch.*8601|webpack.*8601|start-editor\\.sh' | grep -v grep || echo 'NOT_RUNNING'"
            elif "scratch.*runner" in service_lower or ("scratch" in service_lower and "runner" in service_lower):
                # 优先使用端口检查（更可靠），然后检查进程（必须匹配3002端口或scratch-runner）
                # 使用明确的输出格式，确保NOT_RUNNING能正确输出
                # 注意：需要检查进程输出是否为空，不能仅依赖退出码
                command = "if lsof -i:3002 >/dev/null 2>&1; then echo 'RUNNING'; elif [ -n \"$(ps aux | grep -E 'node.*server\\.js.*3002|scratch-runner.*3002|PORT=3002' | grep -v grep | grep -v cursor | head -1)\" ]; then echo 'RUNNING'; else echo 'NOT_RUNNING'; fi"
            elif "judge" in service_lower and "server" in service_lower:
                command = "docker ps | grep -E 'judge|metaseek-judge' || echo 'NOT_RUNNING'"
            elif "vue" in service_lower and "frontend" in service_lower:
                command = "ps aux | grep -E 'vue|webpack.*8081' | grep -v grep || echo 'NOT_RUNNING'"
            elif "react" in service_lower or ("classroom" in service_lower and "8080" in service_lower):
                command = "ps aux | grep -E 'vite.*8080|npm run dev.*--port 8080' | grep -v grep || echo 'NOT_RUNNING'"
            elif "frontend" in service_lower or "vite" in service_lower:
                command = "ps aux | grep -E 'vite|npm.*dev' | grep -v grep || echo 'NOT_RUNNING'"
            else:
                # 通用检查：使用服务名称的关键词
                keywords = []
                if "dramatiq" in service_lower or "worker" in service_lower:
                    keywords.append("start_dramatiq_worker")
                if "heartbeat" in service_lower:
                    keywords.append("heartbeat_metaseek_judge")
                if "scratch" in service_lower:
                    if "editor" in service_lower:
                        keywords.append("scratch.*8601|start-editor")
                    elif "runner" in service_lower:
                        keywords.append("scratch-runner|node.*server\\.js.*3002")
                    else:
                        keywords.append("scratch")
                if keywords:
                    pattern = "|".join(keywords)
                    command = f"ps aux | grep -E '{pattern}' | grep -v grep || echo 'NOT_RUNNING'"
                else:
                    command = f"ps aux | grep -i '{service_name}' | grep -v grep || echo 'NOT_RUNNING'"
        
        elif operation == "start":
            # 启动服务
            service_lower = service_name.lower()
            if "postgresql" in service_lower or "postgres" in service_lower:
                # 使用sudo -S从标准输入读取密码（非交互式）
                command = "echo '123456' | sudo -S service postgresql start 2>/dev/null || (echo '123456' | sudo -S -u postgres /usr/lib/postgresql/12/bin/pg_ctl -D /var/lib/postgresql/12/main start 2>/dev/null || sudo service postgresql start || sudo -u postgres /usr/lib/postgresql/12/bin/pg_ctl -D /var/lib/postgresql/12/main start)"
            elif "backend" in service_lower or "django" in service_lower:
                # Django Backend (端口8086)
                command = f"cd {project_path}/OnlineJudge && nohup python manage.py runserver 0.0.0.0:8086 >> /tmp/django.log 2>&1 &"
            elif "dramatiq" in service_lower or ("worker" in service_lower and "dramatiq" in service_lower):
                # Dramatiq Worker
                command = f"cd {project_path}/OnlineJudge && nohup python start_dramatiq_worker.py >> /tmp/dramatiq.log 2>&1 &"
            elif "heartbeat" in service_lower:
                # Heartbeat Monitor
                command = f"cd {project_path}/OnlineJudge && TOKEN=$(python -c \"import os,django;os.environ.setdefault('DJANGO_SETTINGS_MODULE','oj.settings');django.setup();from options.options import SysOptions;print(SysOptions.judge_server_token)\") && nohup python heartbeat_metaseek_judge.py >> /tmp/heartbeat.log 2>&1 &"
            elif "vue" in service_lower and "frontend" in service_lower:
                # Vue Frontend (端口8081)
                command = f"cd {project_path}/OnlineJudgeFE-Vue && VUE_PORT=8081 nohup npm run dev >> /tmp/vue.log 2>&1 &"
            elif "react" in service_lower or ("classroom" in service_lower and "8080" in service_lower):
                # React Classroom (端口8080)
                command = f"cd {project_path}/OnlineJudgeFE-React && nohup npm run dev -- --host 0.0.0.0 --port 8080 >> /tmp/react_classroom.log 2>&1 &"
            elif "scratch" in service_lower and "editor" in service_lower:
                # Scratch Editor (端口8601)
                command = f"cd {project_path}/scratch-editor && PORT=8601 nohup ./start-editor.sh >> /tmp/scratch_editor.log 2>&1 &"
            elif "scratch" in service_lower and "runner" in service_lower:
                # Scratch Runner (端口3002)
                command = f"cd {project_path}/scratch-runner && PORT=3002 nohup node server.js >> logs/scratch-runner.log 2>&1 &"
            elif "judge" in service_lower and "server" in service_lower:
                # Judge Server (Docker)
                command = "docker start metaseek-judge-dev 2>/dev/null || (docker run -d --name metaseek-judge-dev -p 12360:12360 metaseek-judge:dev 2>&1 || echo 'DOCKER_NOT_FOUND')"
            elif "nginx" in service_lower:
                # 使用sudo -S从标准输入读取密码（非交互式）
                command = "echo '123456' | sudo -S service nginx start 2>/dev/null || sudo service nginx start"
            elif "frontend" in service_lower or "vite" in service_lower:
                command = f"cd {project_path}/frontend && nohup npm run dev > /tmp/frontend.log 2>&1 &"
            else:
                # 尝试从启动脚本中查找对应的启动函数
                command = f"cd {project_path} && bash -c 'source start.sh && {service_lower}_start()' 2>&1 || echo 'SERVICE_NOT_FOUND'"
        
        elif operation == "stop":
            # 停止服务
            service_lower = service_name.lower()
            if "postgresql" in service_lower or "postgres" in service_lower:
                # 使用sudo -S从标准输入读取密码（非交互式）
                command = "echo '123456' | sudo -S service postgresql stop 2>/dev/null || sudo service postgresql stop"
            elif "backend" in service_lower or "django" in service_lower:
                # Django Backend (端口8086)
                command = "pkill -f 'python.*manage.py runserver.*8086'"
            elif "dramatiq" in service_lower or ("worker" in service_lower and "dramatiq" in service_lower):
                # Dramatiq Worker
                command = "pkill -f 'start_dramatiq_worker\\.py|manage\\.py rundramatiq|dramatiq.*judge\\.tasks'"
            elif "heartbeat" in service_lower:
                # Heartbeat Monitor
                command = "pkill -f 'heartbeat_metaseek_judge\\.py'"
            elif "vue" in service_lower and "frontend" in service_lower:
                # Vue Frontend (端口8081)
                command = "pkill -f 'vue|webpack.*8081'"
            elif "react" in service_lower or ("classroom" in service_lower and "8080" in service_lower):
                # React Classroom (端口8080)
                command = "pkill -f 'vite.*8080|npm run dev.*--port 8080'"
            elif "scratch" in service_lower and "editor" in service_lower:
                # Scratch Editor (端口8601)
                command = "pkill -f 'scratch.*8601|webpack.*8601'"
            elif "scratch" in service_lower and "runner" in service_lower:
                # Scratch Runner (端口3002)
                command = "pkill -f 'scratch-runner|node.*server\\.js.*3002'"
            elif "judge" in service_lower and "server" in service_lower:
                # Judge Server (Docker)
                command = "docker stop metaseek-judge-dev 2>/dev/null || echo 'DOCKER_NOT_FOUND'"
            elif "nginx" in service_lower:
                # 使用sudo -S从标准输入读取密码（非交互式）
                command = "echo '123456' | sudo -S service nginx stop 2>/dev/null || sudo service nginx stop"
            elif "judge" in service_lower:
                command = "pkill -f 'dramatiq|judge'"
            elif "frontend" in service_lower or "vite" in service_lower:
                command = "pkill -f 'vite|npm.*dev'"
            else:
                command = f"pkill -f -i '{service_name}'"
        
        elif operation == "restart":
            # 重启服务（先停止再启动）
            service_lower = service_name.lower()
            if "postgresql" in service_lower or "postgres" in service_lower:
                # 使用sudo -S从标准输入读取密码（非交互式）
                command = "echo '123456' | sudo -S service postgresql restart 2>/dev/null || sudo service postgresql restart"
            elif "backend" in service_lower or "django" in service_lower:
                # Django Backend (端口8086)
                command = f"pkill -f 'python.*manage.py runserver.*8086'; sleep 1; cd {project_path}/OnlineJudge && nohup python manage.py runserver 0.0.0.0:8086 >> /tmp/django.log 2>&1 &"
            elif "dramatiq" in service_lower or ("worker" in service_lower and "dramatiq" in service_lower):
                # Dramatiq Worker
                command = f"pkill -f 'start_dramatiq_worker\\.py|manage\\.py rundramatiq|dramatiq.*judge\\.tasks'; sleep 1; cd {project_path}/OnlineJudge && nohup python start_dramatiq_worker.py >> /tmp/dramatiq.log 2>&1 &"
            elif "heartbeat" in service_lower:
                # Heartbeat Monitor
                command = f"pkill -f 'heartbeat_metaseek_judge\\.py'; sleep 1; cd {project_path}/OnlineJudge && TOKEN=$(python -c \"import os,django;os.environ.setdefault('DJANGO_SETTINGS_MODULE','oj.settings');django.setup();from options.options import SysOptions;print(SysOptions.judge_server_token)\") && nohup python heartbeat_metaseek_judge.py >> /tmp/heartbeat.log 2>&1 &"
            elif "vue" in service_lower and "frontend" in service_lower:
                # Vue Frontend (端口8081)
                command = f"pkill -f 'vue|webpack.*8081'; sleep 1; cd {project_path}/OnlineJudgeFE-Vue && VUE_PORT=8081 nohup npm run dev >> /tmp/vue.log 2>&1 &"
            elif "react" in service_lower or ("classroom" in service_lower and "8080" in service_lower):
                # React Classroom (端口8080)
                command = f"pkill -f 'vite.*8080|npm run dev.*--port 8080'; sleep 1; cd {project_path}/OnlineJudgeFE-React && nohup npm run dev -- --host 0.0.0.0 --port 8080 >> /tmp/react_classroom.log 2>&1 &"
            elif "scratch" in service_lower and "editor" in service_lower:
                # Scratch Editor (端口8601)
                command = f"pkill -f 'scratch.*8601|webpack.*8601'; sleep 1; cd {project_path}/scratch-editor && PORT=8601 nohup ./start-editor.sh >> /tmp/scratch_editor.log 2>&1 &"
            elif "scratch" in service_lower and "runner" in service_lower:
                # Scratch Runner (端口3002)
                command = f"pkill -f 'scratch-runner|node.*server\\.js.*3002'; sleep 1; cd {project_path}/scratch-runner && PORT=3002 nohup node server.js >> logs/scratch-runner.log 2>&1 &"
            elif "judge" in service_lower and "server" in service_lower:
                # Judge Server (Docker)
                command = "docker stop metaseek-judge-dev 2>/dev/null; sleep 1; docker start metaseek-judge-dev 2>/dev/null || (docker run -d --name metaseek-judge-dev -p 12360:12360 metaseek-judge:dev 2>&1 || echo 'DOCKER_NOT_FOUND')"
            elif "nginx" in service_lower:
                # 使用sudo -S从标准输入读取密码（非交互式）
                command = "echo '123456' | sudo -S service nginx restart 2>/dev/null || sudo service nginx restart"
            elif "judge" in service_lower:
                command = f"pkill -f 'dramatiq|judge'; sleep 1; cd {project_path} && nohup python3 -m dramatiq judge 2>&1 &"
            elif "frontend" in service_lower or "vite" in service_lower:
                command = f"pkill -f 'vite|npm.*dev'; sleep 1; cd {project_path}/frontend && nohup npm run dev > /tmp/frontend.log 2>&1 &"
            else:
                command = f"pkill -f -i '{service_name}'; sleep 2; cd {project_path} && bash start.sh"
        
        if not command:
            raise HTTPException(status_code=400, detail=f"不支持的操作: {operation}")
        
        # 执行命令
        # 清理环境变量，避免npmrc等配置干扰
        clean_command = f"cd {project_path} && unset NPM_CONFIG_PREFIX NPM_CONFIG_GLOBALCONFIG 2>/dev/null; {command}"
        exec_result = ssh_manager.execute_command(clean_command)
        ssh_manager.close()
        
        # 解析结果
        stdout = exec_result.get("stdout", "")
        stderr = exec_result.get("stderr", "")
        success = exec_result.get("success", False)
        
        # 合并stdout和stderr进行检查（某些命令可能将输出写入stderr）
        combined_output = (stdout + " " + stderr).strip()
        
        # 判断服务状态
        status = "unknown"
        if operation == "status":
            # 检查命令输出
            output_lower = combined_output.lower()
            exit_status = exec_result.get("exit_status", -1)
            
            # 关键判断：如果明确包含NOT_RUNNING，说明服务未运行（检查stdout和stderr）
            if "NOT_RUNNING" in stdout or "NOT_RUNNING" in stderr:
                status = "stopped"
            # 对于pg_isready等特殊命令
            elif "postgresql" in service_name.lower() or "postgres" in service_name.lower():
                if "accepting connections" in output_lower or exit_status == 0:
                    status = "running"
                else:
                    status = "stopped"
            # 对于systemctl status命令
            elif "systemctl" in command or "service" in command:
                if "running" in output_lower or "active" in output_lower:
                    status = "running"
                elif "stopped" in output_lower or "inactive" in output_lower:
                    status = "stopped"
                else:
                    status = "stopped"
            # 对于lsof端口检查命令（最可靠的方式）
            elif "lsof -i:" in command or ("lsof" in command and "-i:" in command):
                # 关键：优先检查NOT_RUNNING（检查stdout和stderr）
                if "NOT_RUNNING" in stdout or "NOT_RUNNING" in stderr:
                    status = "stopped"
                # 检查是否有RUNNING标记（新的检查命令格式）
                elif "RUNNING" in stdout or "RUNNING" in stderr:
                    status = "running"
                # lsof命令成功（exit_status == 0）说明端口在监听，服务在运行
                elif exit_status == 0:
                    # 进一步验证：确保不是空输出
                    if stdout.strip():
                        status = "running"
                    else:
                        status = "stopped"
                else:
                    # lsof失败，检查是否有进程检查的fallback
                    if "ps aux" in command or "grep" in command:
                        # 如果fallback检查有输出且不是NOT_RUNNING，进一步验证
                        if (stdout.strip() or stderr.strip()) and "NOT_RUNNING" not in combined_output:
                            # 验证输出是否包含相关关键词（避免误判）
                            if any(keyword in combined_output for keyword in ["node", "server.js", "scratch", "3002"]):
                                status = "running"
                            else:
                                status = "stopped"
                        else:
                            # 输出为空或包含NOT_RUNNING，认为未运行
                            status = "stopped"
                    else:
                        status = "stopped"
            # 对于ps aux | grep命令（最常见的检查方式）
            elif "ps aux" in command or ("grep" in command and "ps" in command):
                # 关键：如果明确包含NOT_RUNNING，说明服务未运行（检查stdout和stderr）
                if "NOT_RUNNING" in stdout or "NOT_RUNNING" in stderr:
                    status = "stopped"
                # 如果命令执行成功（exit_status == 0）且有输出，说明找到了进程
                elif exit_status == 0 and (stdout.strip() or stderr.strip()):
                    # 使用combined_output进行检查
                    # 检查输出是否包含进程信息关键词（更严格的验证）
                    process_keywords = ["python", "node", "npm", "vite", "webpack", "docker", "postgres", "bash", "sh"]
                    # 对于Django Backend，必须包含manage.py和8086
                    if "backend" in service_lower or "django" in service_lower:
                        if "manage.py" in combined_output and "8086" in combined_output:
                            status = "running"
                        else:
                            status = "stopped"
                    # 对于其他服务，检查关键词
                    elif any(keyword in combined_output for keyword in process_keywords):
                        status = "running"
                    else:
                        # 有输出但不包含关键词，认为未运行
                        status = "stopped"
                # 如果命令执行失败或输出为空，说明没找到进程
                elif exit_status != 0 or not (stdout.strip() or stderr.strip()):
                    status = "stopped"
                else:
                    # 其他情况，默认认为未运行（更保守）
                    status = "stopped"
            # 对于docker ps命令
            elif "docker ps" in command:
                if stdout.strip() and "CONTAINER" in stdout:
                    status = "running"
                else:
                    status = "stopped"
            # 默认判断：根据退出状态和输出
            else:
                if exit_status == 0:
                    if "running" in output_lower or "active" in output_lower:
                        status = "running"
                    elif stdout.strip() and "NOT_RUNNING" not in stdout:
                        status = "running"
                    else:
                        status = "stopped"
                else:
                    status = "stopped"
        elif operation in ["start", "stop", "restart"]:
            if success:
                status = "running" if operation in ["start", "restart"] else "stopped"
            else:
                status = "error"
        
        return {
            "success": success,
            "operation": operation,
            "service_name": service_name,
            "status": status,
            "output": stdout,
            "error": stderr if not success else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error performing service operation: {e}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"执行服务操作失败: {str(e)}")

# 本地服务操作请求模型
class LocalServiceStatusRequest(BaseModel):
    service_id: str
    check_command: str
    port: Optional[int] = None

class LocalServiceOperationRequest(BaseModel):
    service_id: str
    operation: str  # "start", "stop", "restart"
    command: str

@app.post("/api/services/local/status")
async def local_service_status(request: LocalServiceStatusRequest):
    """
    检查本地服务状态
    """
    import subprocess
    import shlex
    
    try:
        service_id = request.service_id
        check_command = request.check_command
        port = request.port
        
        status = "stopped"
        
        # 如果有端口，先检查端口
        if port:
            try:
                result = subprocess.run(
                    ["ss", "-tlnp"], 
                    capture_output=True, 
                    text=True, 
                    timeout=5
                )
                if f":{port} " in result.stdout or f":{port} " in result.stderr:
                    status = "running"
                else:
                    # 尝试使用netstat
                    result = subprocess.run(
                        ["netstat", "-tlnp"], 
                        capture_output=True, 
                        text=True, 
                        timeout=5
                    )
                    if f":{port} " in result.stdout or f":{port} " in result.stderr:
                        status = "running"
            except:
                pass
        
        # 执行检查命令
        if check_command:
            try:
                # 使用shell执行命令
                result = subprocess.run(
                    check_command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                # 根据命令输出判断状态
                output = result.stdout + result.stderr
                if "NOT_RUNNING" in output or result.returncode != 0:
                    if status != "running":  # 如果端口检查也没通过
                        status = "stopped"
                else:
                    # 检查命令成功，说明服务在运行
                    if "postgresql" in service_id.lower() or "postgres" in service_id.lower():
                        # PostgreSQL特殊处理
                        if "accepting connections" in output.lower() or result.returncode == 0:
                            status = "running"
                    else:
                        # 其他服务，如果命令有输出且不是NOT_RUNNING，说明在运行
                        if output.strip() and "NOT_RUNNING" not in output:
                            status = "running"
            except Exception as e:
                print(f"执行检查命令失败: {e}")
                status = "error"
        
        return {
            "success": True,
            "service_id": service_id,
            "status": status
        }
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error checking local service status: {e}")
        print(f"Traceback: {error_trace}")
        return {
            "success": False,
            "error": str(e),
            "status": "error"
        }

@app.post("/api/services/local/operation")
async def local_service_operation(request: LocalServiceOperationRequest):
    """
    执行本地服务操作（启动、停止、重启）
    注意：此API只用于本地8080项目，不影响远程服务器
    """
    import subprocess
    import os
    
    try:
        service_id = request.service_id
        operation = request.operation
        command = request.command
        
        # 本地8080项目根目录（固定路径，不影响远程服务器）
        local_project_root = "/home/sharelgx/MetaSeekOJdev"
        if not os.path.exists(local_project_root):
            return {
                "success": False,
                "error": f"本地项目路径不存在: {local_project_root}"
            }
        
        service_lower = service_id.lower()
        
        # 根据service_id自动构建命令（类似远程服务操作，但使用本地路径）
        if operation == "start":
            # 启动服务：在后台运行
            if "postgresql" in service_lower or "postgres" in service_lower:
                # PostgreSQL需要sudo
                full_command = f"echo '123456' | sudo -S service postgresql start 2>/dev/null || (echo '123456' | sudo -S -u postgres /usr/lib/postgresql/12/bin/pg_ctl -D /var/lib/postgresql/12/main start 2>/dev/null || sudo service postgresql start || sudo -u postgres /usr/lib/postgresql/12/bin/pg_ctl -D /var/lib/postgresql/12/main start)"
            elif "backend" in service_lower or "django" in service_lower:
                # Django Backend (端口8086)
                full_command = f"cd {local_project_root}/OnlineJudge && nohup python manage.py runserver 0.0.0.0:8086 >> /tmp/django.log 2>&1 &"
            elif "dramatiq" in service_lower or ("worker" in service_lower and "dramatiq" in service_lower):
                # Dramatiq Worker
                full_command = f"cd {local_project_root}/OnlineJudge && nohup python start_dramatiq_worker.py >> /tmp/dramatiq.log 2>&1 &"
            elif "heartbeat" in service_lower:
                # Heartbeat Monitor
                full_command = f"cd {local_project_root}/OnlineJudge && TOKEN=$(python -c \"import os,django;os.environ.setdefault('DJANGO_SETTINGS_MODULE','oj.settings');django.setup();from options.options import SysOptions;print(SysOptions.judge_server_token)\") && nohup python heartbeat_metaseek_judge.py >> /tmp/heartbeat.log 2>&1 &"
            elif "vue" in service_lower and "frontend" in service_lower:
                # Vue Frontend (端口8081)
                full_command = f"cd {local_project_root}/OnlineJudgeFE-Vue && VUE_PORT=8081 nohup npm run dev >> /tmp/vue.log 2>&1 &"
            elif "react" in service_lower or ("classroom" in service_lower and "8080" in service_lower):
                # React Classroom (端口8080) - 本地服务
                full_command = f"cd {local_project_root}/OnlineJudgeFE-React && nohup npm run dev -- --host 0.0.0.0 --port 8080 >> /tmp/react_classroom.log 2>&1 &"
            elif "scratch" in service_lower and "editor" in service_lower:
                # Scratch Editor (端口8601)
                full_command = f"cd {local_project_root}/scratch-editor && PORT=8601 nohup ./start-editor.sh >> /tmp/scratch_editor.log 2>&1 &"
            elif "scratch" in service_lower and "runner" in service_lower:
                # Scratch Runner (端口3002)
                full_command = f"cd {local_project_root}/scratch-runner && PORT=3002 nohup node server.js >> logs/scratch-runner.log 2>&1 &"
            elif "judge" in service_lower and "server" in service_lower:
                # Judge Server (Docker)
                full_command = "docker start metaseek-judge-dev 2>/dev/null || (docker run -d --name metaseek-judge-dev -p 12360:12360 metaseek-judge:dev 2>&1 || echo 'DOCKER_NOT_FOUND')"
            else:
                # 使用传入的命令（兼容旧版本）
                full_command = command
            
            # 使用nohup在后台执行
            process = subprocess.Popen(
                full_command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid if hasattr(os, 'setsid') else None
            )
            
            # 等待一下看是否启动成功
            import time
            time.sleep(2)
            
            # 检查进程是否还在运行
            if process.poll() is None:
                return {
                    "success": True,
                    "message": f"{service_id} 启动命令已执行",
                    "pid": process.pid
                }
            else:
                # 进程已退出，可能启动失败
                stdout, stderr = process.communicate()
                return {
                    "success": False,
                    "error": f"启动失败: {stderr.decode() if stderr else stdout.decode()}"
                }
        
        elif operation == "stop":
            # 停止服务：直接执行停止命令
            if "postgresql" in service_lower or "postgres" in service_lower:
                full_command = "echo '123456' | sudo -S service postgresql stop 2>/dev/null || sudo service postgresql stop"
            elif "backend" in service_lower or "django" in service_lower:
                # Django Backend (端口8086)
                full_command = "pkill -f 'python.*manage.py runserver.*8086'"
            elif "dramatiq" in service_lower or ("worker" in service_lower and "dramatiq" in service_lower):
                # Dramatiq Worker
                full_command = "pkill -f 'start_dramatiq_worker\\.py|manage\\.py rundramatiq|dramatiq.*judge\\.tasks'"
            elif "heartbeat" in service_lower:
                # Heartbeat Monitor
                full_command = "pkill -f 'heartbeat_metaseek_judge\\.py'"
            elif "vue" in service_lower and "frontend" in service_lower:
                # Vue Frontend (端口8081)
                full_command = "pkill -f 'vue|webpack.*8081'"
            elif "react" in service_lower or ("classroom" in service_lower and "8080" in service_lower):
                # React Classroom (端口8080) - 本地服务
                full_command = "pkill -f 'vite.*8080|npm run dev.*--port 8080'"
            elif "scratch" in service_lower and "editor" in service_lower:
                # Scratch Editor (端口8601)
                full_command = "pkill -f 'scratch.*8601|webpack.*8601'"
            elif "scratch" in service_lower and "runner" in service_lower:
                # Scratch Runner (端口3002)
                full_command = "pkill -f 'scratch-runner|node.*server\\.js.*3002'"
            elif "judge" in service_lower and "server" in service_lower:
                # Judge Server (Docker)
                full_command = "docker stop metaseek-judge-dev 2>/dev/null || echo 'DOCKER_NOT_FOUND'"
            else:
                # 使用传入的命令（兼容旧版本）
                full_command = command
            
            result = subprocess.run(
                full_command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return {
                    "success": True,
                    "message": f"{service_id} 已停止"
                }
            else:
                return {
                    "success": False,
                    "error": result.stderr or result.stdout or "停止失败"
                }
        
        elif operation == "restart":
            # 重启服务：先停止再启动
            import time
            
            # 停止命令
            if "postgresql" in service_lower or "postgres" in service_lower:
                stop_cmd = "echo '123456' | sudo -S service postgresql stop 2>/dev/null || sudo service postgresql stop"
            elif "backend" in service_lower or "django" in service_lower:
                stop_cmd = "pkill -f 'python.*manage.py runserver.*8086'"
            elif "dramatiq" in service_lower or ("worker" in service_lower and "dramatiq" in service_lower):
                stop_cmd = "pkill -f 'start_dramatiq_worker\\.py|manage\\.py rundramatiq|dramatiq.*judge\\.tasks'"
            elif "heartbeat" in service_lower:
                stop_cmd = "pkill -f 'heartbeat_metaseek_judge\\.py'"
            elif "vue" in service_lower and "frontend" in service_lower:
                stop_cmd = "pkill -f 'vue|webpack.*8081'"
            elif "react" in service_lower or ("classroom" in service_lower and "8080" in service_lower):
                stop_cmd = "pkill -f 'vite.*8080|npm run dev.*--port 8080'"
            elif "scratch" in service_lower and "editor" in service_lower:
                stop_cmd = "pkill -f 'scratch.*8601|webpack.*8601'"
            elif "scratch" in service_lower and "runner" in service_lower:
                stop_cmd = "pkill -f 'scratch-runner|node.*server\\.js.*3002'"
            elif "judge" in service_lower and "server" in service_lower:
                stop_cmd = "docker stop metaseek-judge-dev 2>/dev/null || echo 'DOCKER_NOT_FOUND'"
            else:
                # 使用传入的命令（兼容旧版本）
                stop_cmd = command.split(';')[0] if ';' in command else command
            
            subprocess.run(stop_cmd, shell=True, capture_output=True, timeout=10)
            time.sleep(1)
            
            # 启动命令
            if "postgresql" in service_lower or "postgres" in service_lower:
                start_cmd = "echo '123456' | sudo -S service postgresql start 2>/dev/null || (echo '123456' | sudo -S -u postgres /usr/lib/postgresql/12/bin/pg_ctl -D /var/lib/postgresql/12/main start 2>/dev/null || sudo service postgresql start || sudo -u postgres /usr/lib/postgresql/12/bin/pg_ctl -D /var/lib/postgresql/12/main start)"
            elif "backend" in service_lower or "django" in service_lower:
                start_cmd = f"cd {local_project_root}/OnlineJudge && nohup python manage.py runserver 0.0.0.0:8086 >> /tmp/django.log 2>&1 &"
            elif "dramatiq" in service_lower or ("worker" in service_lower and "dramatiq" in service_lower):
                start_cmd = f"cd {local_project_root}/OnlineJudge && nohup python start_dramatiq_worker.py >> /tmp/dramatiq.log 2>&1 &"
            elif "heartbeat" in service_lower:
                start_cmd = f"cd {local_project_root}/OnlineJudge && TOKEN=$(python -c \"import os,django;os.environ.setdefault('DJANGO_SETTINGS_MODULE','oj.settings');django.setup();from options.options import SysOptions;print(SysOptions.judge_server_token)\") && nohup python heartbeat_metaseek_judge.py >> /tmp/heartbeat.log 2>&1 &"
            elif "vue" in service_lower and "frontend" in service_lower:
                start_cmd = f"cd {local_project_root}/OnlineJudgeFE-Vue && VUE_PORT=8081 nohup npm run dev >> /tmp/vue.log 2>&1 &"
            elif "react" in service_lower or ("classroom" in service_lower and "8080" in service_lower):
                start_cmd = f"cd {local_project_root}/OnlineJudgeFE-React && nohup npm run dev -- --host 0.0.0.0 --port 8080 >> /tmp/react_classroom.log 2>&1 &"
            elif "scratch" in service_lower and "editor" in service_lower:
                start_cmd = f"cd {local_project_root}/scratch-editor && PORT=8601 nohup ./start-editor.sh >> /tmp/scratch_editor.log 2>&1 &"
            elif "scratch" in service_lower and "runner" in service_lower:
                start_cmd = f"cd {local_project_root}/scratch-runner && PORT=3002 nohup node server.js >> logs/scratch-runner.log 2>&1 &"
            elif "judge" in service_lower and "server" in service_lower:
                start_cmd = "docker stop metaseek-judge-dev 2>/dev/null; sleep 1; docker start metaseek-judge-dev 2>/dev/null || (docker run -d --name metaseek-judge-dev -p 12360:12360 metaseek-judge:dev 2>&1 || echo 'DOCKER_NOT_FOUND')"
            else:
                # 使用传入的命令（兼容旧版本）
                start_cmd = command.split(';')[1].strip() if ';' in command else command
            
            process = subprocess.Popen(
                start_cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid if hasattr(os, 'setsid') else None
            )
            
            time.sleep(2)
            
            if process.poll() is None:
                return {
                    "success": True,
                    "message": f"{service_id} 重启成功",
                    "pid": process.pid
                }
            else:
                stdout, stderr = process.communicate()
                return {
                    "success": False,
                    "error": f"重启失败: {stderr.decode() if stderr else stdout.decode()}"
                }
        
        else:
            return {
                "success": False,
                "error": f"不支持的操作: {operation}"
            }
            
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error performing local service operation: {e}")
        print(f"Traceback: {error_trace}")
        return {
            "success": False,
            "error": str(e)
        }

# 服务连通性测试请求模型
class ServiceConnectivityTestRequest(BaseModel):
    server_id: str
    service_id: str
    port: Optional[int] = None
    health_check_url: Optional[str] = None
    check_command: str

@app.post("/api/services/test-connectivity")
async def test_service_connectivity(request: ServiceConnectivityTestRequest, db: Session = Depends(get_db)):
    """
    测试服务连通性（端口、进程、HTTP健康检查）
    """
    try:
        servers_result = mcp.list_servers(db=db)
        servers = servers_result.get("servers", {})
        
        if request.server_id not in servers:
            raise HTTPException(status_code=404, detail=f"服务器 {request.server_id} 不存在")
        
        server_config = servers[request.server_id]
        project_path = server_config.get("project_path", "")
        
        # 连接SSH
        password = server_config.get("password") if server_config.get("auth_type") == "password" else None
        private_key_path = server_config.get("private_key_path") if server_config.get("auth_type") == "key" else None
        private_key_content = server_config.get("private_key_content") if server_config.get("auth_type") == "key" else None
        
        result = ssh_manager.connect(
            host=server_config.get("host"),
            user=server_config.get("user"),
            port=server_config.get("port", 22),
            password=password,
            private_key_path=private_key_path,
            private_key_content=private_key_content,
            timeout=10
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=f"SSH连接失败: {result.get('message')}")
        
        test_results = {
            "port_check": None,
            "process_check": None,
            "http_check": None,
        }
        errors = []
        
        # 1. 端口检查
        if request.port:
            try:
                port_check_cmd = f"ss -tlnp 2>/dev/null | grep -q ':{request.port} ' || netstat -tlnp 2>/dev/null | grep -q ':{request.port} ' || lsof -ti:{request.port} >/dev/null 2>&1"
                exec_result = ssh_manager.execute_command(port_check_cmd)
                if exec_result.get("success") or exec_result.get("exit_status") == 0:
                    test_results["port_check"] = "✅ 端口已监听"
                else:
                    test_results["port_check"] = "❌ 端口未监听"
                    errors.append(f"端口 {request.port} 未监听")
            except Exception as e:
                test_results["port_check"] = f"⚠️ 端口检查失败: {str(e)}"
                errors.append(f"端口检查异常: {str(e)}")
        
        # 2. 进程检查
        if request.check_command:
            try:
                exec_result = ssh_manager.execute_command(f"cd {project_path} && {request.check_command}")
                output = exec_result.get("stdout", "") + exec_result.get("stderr", "")
                if "NOT_RUNNING" in output or exec_result.get("exit_status") != 0:
                    test_results["process_check"] = "❌ 进程未运行"
                    errors.append("进程检查失败")
                else:
                    test_results["process_check"] = "✅ 进程运行中"
            except Exception as e:
                test_results["process_check"] = f"⚠️ 进程检查失败: {str(e)}"
                errors.append(f"进程检查异常: {str(e)}")
        
        # 3. HTTP健康检查
        if request.health_check_url:
            try:
                # 通过SSH在远程服务器上执行curl
                health_check_cmd = f"curl -s -o /dev/null -w '%{{http_code}}' '{request.health_check_url}' 2>&1 || echo '000'"
                exec_result = ssh_manager.execute_command(health_check_cmd)
                http_code = exec_result.get("stdout", "").strip()
                
                if http_code and http_code.isdigit():
                    code = int(http_code)
                    if 200 <= code < 400:
                        test_results["http_check"] = f"✅ HTTP {code} (正常)"
                    elif code == 404:
                        test_results["http_check"] = f"⚠️ HTTP {code} (页面不存在，但服务可能运行)"
                    else:
                        test_results["http_check"] = f"❌ HTTP {code} (异常)"
                        errors.append(f"HTTP状态码异常: {code}")
                else:
                    test_results["http_check"] = "❌ HTTP请求失败"
                    errors.append("HTTP请求失败")
            except Exception as e:
                test_results["http_check"] = f"⚠️ HTTP检查失败: {str(e)}"
                errors.append(f"HTTP检查异常: {str(e)}")
        
        ssh_manager.close()
        
        success = len(errors) == 0
        return {
            "success": success,
            "service_id": request.service_id,
            "test_results": test_results,
            "error": "; ".join(errors) if errors else None,
            "details": " | ".join([v for v in test_results.values() if v])
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error testing service connectivity: {e}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"连通性测试失败: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

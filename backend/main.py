from fastapi import FastAPI, HTTPException, Body, Depends
from fastapi.middleware.cors import CORSMiddleware
import sys
import os
import json
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
                    result[server.server_id] = server.to_dict()
                
                if not db:
                    session.close()
                return {"servers": result}
            except Exception as e:
                import traceback
                print(f"Error listing servers: {e}")
                print(traceback.format_exc())
                return {"servers": {}}
        
        def get_config(self, db: Session = None): 
            """获取当前配置（兼容性方法）"""
            return {}
        
        def check_status(self, server_id: str = None, db: Session = None):
            """检查服务器状态"""
            try:
                # 使用传入的 server_id 或当前选中的服务器
                target_server_id = server_id or self._current_server_id
                
                if not target_server_id:
                    return {
                        "success": False,
                        "error": "未选择服务器，请先选择或传入 server_id",
                        "stdout": ""
                    }
                
                # 获取服务器配置
                session = db if db else self._get_db()
                server = session.query(ServerConfig).filter(
                    ServerConfig.server_id == target_server_id,
                    ServerConfig.is_active == True
                ).first()
                
                if not server:
                    if not db:
                        session.close()
                    return {
                        "success": False,
                        "error": f"服务器 {target_server_id} 不存在",
                        "stdout": ""
                    }
                
                # 准备SSH连接参数
                password = server.password if server.auth_type == "password" else None
                private_key_path = server.private_key_path if server.auth_type == "key" else None
                private_key_content = server.private_key_content if server.auth_type == "key" else None
                
                # 连接SSH
                result = ssh_manager.connect(
                    host=server.host,
                    user=server.user,
                    port=server.port,
                    password=password,
                    private_key_path=private_key_path,
                    private_key_content=private_key_content,
                    timeout=10
                )
                
                if not result.get("success"):
                    if not db:
                        session.close()
                    return {
                        "success": False,
                        "error": f"SSH连接失败: {result.get('message')}",
                        "stdout": ""
                    }
                
                try:
                    # 执行状态检查命令
                    # 检查进程、服务状态等，输出格式化的标记以便前端解析
                    output_lines = []
                    
                    # 1. 检查 Django Backend 进程
                    backend_cmd = "ps aux | grep -E 'python3.*manage.py.*runserver' | grep -v grep"
                    backend_result = ssh_manager.execute_command(backend_cmd)
                    if backend_result.get("stdout") and backend_result.get("stdout", "").strip():
                        output_lines.append("Django Backend: python3 manage.py runserver [RUNNING]")
                    else:
                        output_lines.append("Django Backend: [STOPPED]")
                    
                    # 2. 检查 Nginx 服务状态
                    nginx_cmd = "systemctl is-active nginx 2>&1"
                    nginx_result = ssh_manager.execute_command(nginx_cmd)
                    nginx_output = nginx_result.get("stdout", "").strip().lower()
                    if nginx_output == "active":
                        output_lines.append("Nginx: Active: active (running) [RUNNING]")
                    else:
                        output_lines.append("Nginx: [STOPPED]")
                    
                    # 3. 检查 API Health (支持8080和8086端口)
                    api_ports = [8080, 8086]
                    api_status = None
                    for port in api_ports:
                        api_cmd = f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/api/website/ 2>&1"
                        api_result = ssh_manager.execute_command(api_cmd)
                        api_code = api_result.get("stdout", "").strip()
                        if api_code == "200":
                            output_lines.append(f"API Health: http://127.0.0.1:{port}/api/website/ -> 200 [OK]")
                            api_status = "ok"
                            break
                    if not api_status:
                        output_lines.append("API Health: [ERROR]")
                    
                    # 4. 检查 Scratch Editor
                    scratch_cmd = "curl -s -o /dev/null -w '%{http_code}' http://metaseek.cc 2>&1"
                    scratch_result = ssh_manager.execute_command(scratch_cmd)
                    scratch_code = scratch_result.get("stdout", "").strip()
                    if scratch_code == "200":
                        output_lines.append("Scratch Editor: host=metaseek.cc -> 200 [OK]")
                    elif scratch_code == "000" or "failed" in scratch_code.lower():
                        output_lines.append("Scratch Editor: host=metaseek.cc -> 000 [STOPPED]")
                    else:
                        output_lines.append("Scratch Editor: host=metaseek.cc -> " + scratch_code + " [WARNING]")
                    
                    output = "\n".join(output_lines)
                    
                    return {
                        "success": True,
                        "stdout": output,
                        "error": None
                    }
                finally:
                    # 确保连接被关闭
                    try:
                        ssh_manager.close()
                    except:
                        pass
                    if not db:
                        session.close()
                        
            except Exception as e:
                import traceback
                error_msg = f"检查状态失败: {str(e)}"
                print(error_msg)
                print(traceback.format_exc())
                try:
                    ssh_manager.close()
                except:
                    pass
                if db:
                    try:
                        session.rollback()
                    except:
                        pass
                elif hasattr(self, '_get_db'):
                    try:
                        session = self._get_db()
                        session.close()
                    except:
                        pass
                return {
                    "success": False,
                    "error": error_msg,
                    "stdout": ""
                }
        
        def restart_services(self, service): 
            return {"success": False}
        
        def sync_code(self, scope): 
            return {"success": False}
        
        def build_react_frontend(self, **kwargs): 
            return {"success": False}
        
        def build_vue_admin_frontend(self): 
            return {"success": False}
        
        def ssh_exec(self, cmd): 
            return {"success": False}
        
        def fix_scratch_editor(self): 
            return {"success": False}
        
        def save_server_config(self, server_id: str, config: dict, db: Session = None):
            """保存服务器配置到数据库"""
            try:
                session = db if db else self._get_db()
                
                # 查找是否已存在
                existing = session.query(ServerConfig).filter(ServerConfig.server_id == server_id).first()
                
                if existing:
                    # 更新现有配置
                    for key, value in config.items():
                        # 跳过 server_id，因为它不应该被更新
                        if key != 'server_id' and hasattr(existing, key):
                            setattr(existing, key, value)
                else:
                    # 创建新配置
                    # 从 config 中移除 server_id（如果存在），避免重复传递
                    config_clean = {k: v for k, v in config.items() if k != 'server_id'}
                    new_config = ServerConfig(server_id=server_id, **config_clean)
                    session.add(new_config)
                
                session.commit()
                
                if not db:
                    session.close()
                
                return {
                    "success": True,
                    "message": f"服务器配置 {server_id} 已保存",
                    "server_id": server_id
                }
            except Exception as e:
                import traceback
                error_msg = f"保存配置失败: {str(e)}"
                print(error_msg)
                print(traceback.format_exc())
                if db:
                    session.rollback()
                elif hasattr(self, '_get_db'):
                    try:
                        session = self._get_db()
                        session.rollback()
                        session.close()
                    except:
                        pass
                return {
                    "success": False,
                    "error": error_msg
                }
        
        def delete_server_config(self, server_id: str, db: Session = None):
            """删除服务器配置（软删除：设置 is_active=False）"""
            try:
                session = db if db else self._get_db()
                
                server = session.query(ServerConfig).filter(
                    ServerConfig.server_id == server_id,
                    ServerConfig.is_active == True
                ).first()
                
                if server:
                    server.is_active = False
                    session.commit()
                    
                    if not db:
                        session.close()
                    
                    return {
                        "success": True,
                        "message": f"服务器配置 {server_id} 已删除"
                    }
                else:
                    if not db:
                        session.close()
                    return {
                        "success": False,
                        "error": f"服务器配置 {server_id} 不存在"
                    }
            except Exception as e:
                import traceback
                error_msg = f"删除配置失败: {str(e)}"
                print(error_msg)
                print(traceback.format_exc())
                if db:
                    session.rollback()
                elif hasattr(self, '_get_db'):
                    try:
                        session = self._get_db()
                        session.rollback()
                        session.close()
                    except:
                        pass
                return {
                    "success": False,
                    "error": error_msg
                }
        
        def switch_server(self, server_id: str, db: Session = None):
            """切换当前服务器（验证服务器是否存在）"""
            try:
                session = db if db else self._get_db()
                server = session.query(ServerConfig).filter(
                    ServerConfig.server_id == server_id,
                    ServerConfig.is_active == True
                ).first()
                
                if not db:
                    session.close()
                
                if server:
                    # 保存当前服务器ID
                    self._current_server_id = server_id
                    return {
                        "success": True,
                        "message": f"已切换到服务器 {server_id}"
                    }
                else:
                    return {
                        "success": False,
                        "error": f"服务器 {server_id} 不存在"
                    }
            except Exception as e:
                import traceback
                error_msg = f"切换服务器失败: {str(e)}"
                print(error_msg)
                print(traceback.format_exc())
                if db:
                    session.rollback()
                elif hasattr(self, '_get_db'):
                    try:
                        session = self._get_db()
                        session.close()
                    except:
                        pass
                return {
                    "success": False,
                    "error": error_msg
                }

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
# 使用数据库存储，每次请求时传入数据库会话
mcp = CodeSyncMCP()

# 确保数据库表已创建
try:
    from database import check_database_connection
    if check_database_connection():
        Base.metadata.create_all(bind=engine)
        print("✅ 数据库表已初始化")
    else:
        print("⚠️  数据库连接失败，请先配置 PostgreSQL（见 POSTGRESQL_SETUP.md）")
except Exception as e:
    print(f"⚠️  数据库初始化警告: {e}")
    print("请检查 PostgreSQL 是否已启动并正确配置")

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

class RestartProjectRequest(BaseModel):
    start_script: Optional[str] = None

class ServerConfigRequest(BaseModel):
    server_id: str = Field(..., min_length=1, description="服务器ID")
    name: str = Field(..., min_length=1, description="服务器名称")
    host: str = Field(..., min_length=1, description="IP地址")
    user: str = Field(..., min_length=1, description="用户名")
    port: Optional[int] = Field(default=22, ge=1, le=65535, description="端口")
    password: Optional[str] = Field(default=None, description="SSH密码")
    private_key_path: Optional[str] = Field(default=None, description="私钥文件路径")
    private_key_content: Optional[str] = Field(default=None, description="私钥内容")
    project_path: str = Field(..., min_length=1, description="项目路径")
    auth_type: Optional[str] = Field(default="password", description="认证类型: password 或 key")
    start_script: Optional[str] = Field(default=None, description="启动脚本路径（可选，用于重启项目）")
    
    @field_validator('server_id', 'name', 'host', 'user', 'project_path')
    @classmethod
    def validate_not_empty(cls, v: str) -> str:
        if isinstance(v, str) and not v.strip():
            raise ValueError('字段不能为空')
        return v.strip() if isinstance(v, str) else v
    
    @field_validator('auth_type')
    @classmethod
    def validate_auth_type(cls, v: Optional[str]) -> str:
        if v not in ['password', 'key']:
            raise ValueError('auth_type 必须是 "password" 或 "key"')
        return v
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "server_id": "test_server",
                    "name": "测试服务器",
                    "host": "192.168.1.100",
                    "user": "ubuntu",
                    "port": 22,
                    "project_path": "/home/ubuntu/MetaSeekOJ",
                    "auth_type": "password",
                    "password": "your_password"
                }
            ]
        }
    }

class BrowsePathRequest(ServerConfigRequest):
    path: Optional[str] = Field(default="/", description="要浏览的路径")

class LoginRequest(BaseModel):
    username: str
    password: str

@app.get("/")
async def root():
    return {"message": "Ops Dashboard API is running"}

@app.get("/api/status")
async def get_status(server_id: Optional[str] = None, db: Session = Depends(get_db)):
    """获取服务器状态，可以指定 server_id 或使用当前选中的服务器"""
    return mcp.check_status(server_id=server_id, db=db)

@app.get("/api/servers")
async def list_servers(db: Session = Depends(get_db)):
    return mcp.list_servers(db=db)

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

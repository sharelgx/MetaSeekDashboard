"""
数据库模型定义
"""
from sqlalchemy import Column, String, Integer, Text, DateTime, Boolean
from sqlalchemy.sql import func
from database import Base

class ServerConfig(Base):
    """服务器配置表"""
    __tablename__ = "server_configs"
    
    # 主键
    server_id = Column(String(100), primary_key=True, index=True, comment="服务器ID")
    
    # 基本信息
    name = Column(String(200), nullable=False, comment="服务器名称")
    host = Column(String(100), nullable=False, comment="IP地址")
    user = Column(String(50), nullable=False, comment="用户名")
    port = Column(Integer, default=22, nullable=False, comment="SSH端口")
    
    # 认证信息
    auth_type = Column(String(20), default="password", nullable=False, comment="认证类型: password 或 key")
    password = Column(Text, nullable=True, comment="SSH密码（加密存储）")
    private_key_path = Column(Text, nullable=True, comment="私钥文件路径")
    private_key_content = Column(Text, nullable=True, comment="私钥内容（加密存储）")
    
    # 项目信息
    project_path = Column(String(500), nullable=False, comment="项目路径")
    start_script = Column(String(500), nullable=True, comment="启动脚本路径")
    
    # 元数据
    is_active = Column(Boolean, default=True, nullable=False, comment="是否激活")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False, comment="更新时间")
    
    def to_dict(self):
        """转换为字典"""
        return {
            "server_id": self.server_id,
            "name": self.name,
            "host": self.host,
            "user": self.user,
            "port": self.port,
            "auth_type": self.auth_type,
            "password": self.password,
            "private_key_path": self.private_key_path,
            "private_key_content": self.private_key_content,
            "project_path": self.project_path,
            "start_script": self.start_script,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

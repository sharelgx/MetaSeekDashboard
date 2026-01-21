"""
数据库连接和会话管理
"""
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError
import os

# 数据库连接配置
# 默认使用环境变量，如果没有则使用本地配置
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/opsdashboard"
)

# 创建数据库引擎
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # 连接前检查连接是否有效
    echo=False,  # 设置为 True 可以看到 SQL 语句
    connect_args={"connect_timeout": 5}  # 连接超时5秒
)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建基础模型类
Base = declarative_base()

def check_database_connection():
    """检查数据库连接是否可用"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except OperationalError as e:
        print(f"\n❌ 数据库连接失败: {e}")
        print(f"\n请按照以下步骤配置 PostgreSQL:")
        print("1. 启动 PostgreSQL 服务: sudo service postgresql start")
        print("2. 创建数据库: sudo -u postgres psql -c 'CREATE DATABASE opsdashboard;'")
        print("3. 查看配置指南: cat backend/POSTGRESQL_SETUP.md")
        print(f"\n当前数据库连接字符串: {DATABASE_URL}")
        return False
    except Exception as e:
        print(f"\n❌ 数据库连接检查失败: {e}")
        return False

# 依赖注入：获取数据库会话
def get_db():
    """获取数据库会话，用于 FastAPI 依赖注入"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

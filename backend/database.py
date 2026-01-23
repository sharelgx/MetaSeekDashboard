"""
数据库连接和会话管理
支持SQLite（默认）和PostgreSQL（可选）
"""
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError
import os
from pathlib import Path

# 数据库连接配置
# 优先使用环境变量，如果没有则根据配置选择数据库类型
DATABASE_TYPE = os.getenv("DATABASE_TYPE", "sqlite").lower()  # sqlite 或 postgresql

if DATABASE_TYPE == "postgresql":
    # 使用PostgreSQL（需要单独配置，不影响MetaSeekOJ）
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/opsdashboard"
    )
    # PostgreSQL连接参数
    connect_args = {"connect_timeout": 5}
    pool_pre_ping = True
else:
    # 使用SQLite（默认，完全独立，不影响MetaSeekOJ）
    # 数据库文件存储在项目根目录
    project_root = Path(__file__).parent.parent
    db_file = project_root / "opsdashboard.db"
    DATABASE_URL = f"sqlite:///{db_file}"
    # SQLite连接参数
    connect_args = {"check_same_thread": False}  # SQLite需要这个参数
    pool_pre_ping = False  # SQLite不需要连接池

# 创建数据库引擎
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=pool_pre_ping,  # 连接前检查连接是否有效（仅PostgreSQL）
    echo=False,  # 设置为 True 可以看到 SQL 语句
    connect_args=connect_args
)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建基础模型类
Base = declarative_base()

def check_database_connection():
    """检查数据库连接是否可用"""
    try:
        with engine.connect() as conn:
            if DATABASE_TYPE == "sqlite":
                conn.execute(text("SELECT 1"))
            else:
                conn.execute(text("SELECT 1"))
        return True
    except OperationalError as e:
        print(f"\n❌ 数据库连接失败: {e}")
        if DATABASE_TYPE == "postgresql":
            print(f"\n请按照以下步骤配置 PostgreSQL:")
            print("1. 启动 PostgreSQL 服务: sudo service postgresql start")
            print("2. 创建数据库: sudo -u postgres psql -c 'CREATE DATABASE opsdashboard;'")
            print("3. 查看配置指南: cat backend/POSTGRESQL_SETUP.md")
        else:
            print(f"\nSQLite数据库文件路径: {DATABASE_URL}")
            print("如果文件不存在，会在首次使用时自动创建")
        print(f"\n当前数据库类型: {DATABASE_TYPE}")
        print(f"当前数据库连接字符串: {DATABASE_URL}")
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

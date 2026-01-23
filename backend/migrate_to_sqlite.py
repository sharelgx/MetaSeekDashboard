#!/usr/bin/env python3
"""
从PostgreSQL迁移数据到SQLite
"""
import sys
import os
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "backend"))

from sqlalchemy import create_engine, text
from models import ServerConfig

def migrate_data():
    """迁移数据从PostgreSQL到SQLite"""
    print("=" * 50)
    print("数据库迁移工具：PostgreSQL -> SQLite")
    print("=" * 50)
    
    # 1. 连接到PostgreSQL（源数据库）
    print("\n1. 连接到PostgreSQL...")
    pg_url = "postgresql://postgres:postgres@localhost:5432/opsdashboard"
    try:
        pg_engine = create_engine(pg_url, connect_args={"connect_timeout": 5})
        with pg_engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM server_configs"))
            count = result.scalar()
            print(f"   ✅ PostgreSQL中找到 {count} 条配置")
    except Exception as e:
        print(f"   ❌ 无法连接到PostgreSQL: {e}")
        print("   ⚠️  如果PostgreSQL中没有数据，可以跳过迁移")
        return False
    
    if count == 0:
        print("   ℹ️  PostgreSQL中没有数据，无需迁移")
        return True
    
    # 2. 连接到SQLite（目标数据库）
    print("\n2. 连接到SQLite...")
    # 使用与database.py相同的路径逻辑
    sqlite_file = project_root / "opsdashboard.db"
    sqlite_url = f"sqlite:///{sqlite_file}"
    print(f"   SQLite文件路径: {sqlite_file}")
    sqlite_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
    
    # 创建表
    from database import Base
    Base.metadata.create_all(bind=sqlite_engine)
    print(f"   ✅ SQLite数据库文件: {sqlite_file}")
    
    # 3. 读取PostgreSQL数据
    print("\n3. 读取PostgreSQL数据...")
    from sqlalchemy.orm import sessionmaker
    PGSession = sessionmaker(bind=pg_engine)
    SQLiteSession = sessionmaker(bind=sqlite_engine)
    
    pg_session = PGSession()
    sqlite_session = SQLiteSession()
    
    try:
        servers = pg_session.query(ServerConfig).filter(ServerConfig.is_active == True).all()
        print(f"   ✅ 读取到 {len(servers)} 条配置")
        
        # 4. 检查SQLite中是否已有数据
        print("\n4. 检查SQLite中是否已有数据...")
        existing_count = sqlite_session.query(ServerConfig).filter(ServerConfig.is_active == True).count()
        if existing_count > 0:
            print(f"   ⚠️  SQLite中已有 {existing_count} 条配置")
            response = input("   是否清空SQLite数据并重新迁移？(y/n): ").strip().lower()
            if response == 'y':
                sqlite_session.query(ServerConfig).delete()
                sqlite_session.commit()
                print("   ✅ 已清空SQLite数据")
            else:
                print("   ⚠️  跳过迁移，保留现有数据")
                return True
        
        # 5. 写入SQLite
        print("\n5. 写入SQLite...")
        for server in servers:
            # 检查是否已存在
            existing = sqlite_session.query(ServerConfig).filter(ServerConfig.server_id == server.server_id).first()
            if existing:
                print(f"   ⚠️  跳过已存在的配置: {server.server_id}")
                continue
            
            # 创建新记录
            new_server = ServerConfig(
                server_id=server.server_id,
                name=server.name,
                host=server.host,
                user=server.user,
                port=server.port,
                auth_type=server.auth_type,
                password=server.password,
                private_key_path=server.private_key_path,
                private_key_content=server.private_key_content,
                project_path=server.project_path,
                start_script=server.start_script,
                is_active=server.is_active,
                created_at=server.created_at,
                updated_at=server.updated_at
            )
            sqlite_session.add(new_server)
        
        sqlite_session.commit()
        print(f"   ✅ 成功迁移配置到SQLite")
        
        # 6. 验证
        print("\n6. 验证迁移结果...")
        sqlite_count = sqlite_session.query(ServerConfig).filter(ServerConfig.is_active == True).count()
        print(f"   ✅ SQLite中有 {sqlite_count} 条配置")
        
        if sqlite_count == len(servers):
            print("\n✅ 迁移成功！")
            print(f"\n现在可以使用SQLite数据库了：")
            print(f"  文件位置: {sqlite_file}")
            print(f"\n要使用SQLite，请确保环境变量：")
            print(f"  export DATABASE_TYPE=sqlite")
            print(f"  或者不设置（默认使用SQLite）")
            return True
        else:
            print(f"\n⚠️  迁移数量不匹配：PostgreSQL {len(servers)} 条，SQLite {sqlite_count} 条")
            return False
            
    except Exception as e:
        sqlite_session.rollback()
        print(f"\n❌ 迁移失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        pg_session.close()
        sqlite_session.close()

if __name__ == "__main__":
    success = migrate_data()
    sys.exit(0 if success else 1)

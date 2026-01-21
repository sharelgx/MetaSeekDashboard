#!/usr/bin/env python3
"""
检查数据库中的配置数据
"""
import sys
from database import SessionLocal, DATABASE_URL, check_database_connection
from models import ServerConfig
from sqlalchemy import text

def main():
    print("=" * 50)
    print("数据库配置检查工具")
    print("=" * 50)
    print(f"\n当前数据库连接: {DATABASE_URL}\n")
    
    # 检查连接
    if not check_database_connection():
        print("\n❌ 无法连接到数据库，请先启动 PostgreSQL")
        print("启动命令: sudo service postgresql start")
        sys.exit(1)
    
    # 连接数据库
    db = SessionLocal()
    try:
        # 检查表是否存在
        result = db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'server_configs'
        """))
        table_exists = result.fetchone() is not None
        
        if not table_exists:
            print("⚠️  表 'server_configs' 不存在")
            print("请运行: python3 init_db.py")
            sys.exit(1)
        
        # 查询所有配置
        servers = db.query(ServerConfig).filter(ServerConfig.is_active == True).all()
        
        print(f"\n数据库中的服务器配置数量: {len(servers)}\n")
        
        if len(servers) == 0:
            print("⚠️  数据库中没有找到任何配置")
            print("可能的原因:")
            print("1. 配置从未保存到数据库")
            print("2. 数据库被重新创建")
            print("3. 所有配置都被标记为 is_active=False")
        else:
            print("配置列表:")
            print("-" * 50)
            for i, s in enumerate(servers, 1):
                print(f"{i}. 服务器ID: {s.server_id}")
                print(f"   名称: {s.name}")
                print(f"   主机: {s.host}:{s.port}")
                print(f"   用户: {s.user}")
                print(f"   认证类型: {s.auth_type}")
                print(f"   项目路径: {s.project_path}")
                print(f"   创建时间: {s.created_at}")
                print(f"   更新时间: {s.updated_at}")
                print("-" * 50)
        
        # 检查所有配置（包括非激活的）
        all_servers = db.query(ServerConfig).all()
        inactive_count = len(all_servers) - len(servers)
        if inactive_count > 0:
            print(f"\n⚠️  还有 {inactive_count} 个非激活的配置")
        
    except Exception as e:
        print(f"\n❌ 查询数据库时出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    main()

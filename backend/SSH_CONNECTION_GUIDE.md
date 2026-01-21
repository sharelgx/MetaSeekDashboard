# SSH连接功能使用指南

## 功能概述

服务器连接功能支持两种SSH认证方式：
1. **密码认证** - 使用用户名和密码连接
2. **SSH密钥认证**（推荐） - 使用SSH密钥对连接，更安全

## 安装依赖

确保已安装必要的Python包：

```bash
pip install -r requirements.txt
```

主要依赖：
- `paramiko` - SSH客户端库
- `fastapi` - Web框架
- `pydantic` - 数据验证

## 使用方法

### 1. 通过前端界面配置

1. 启动后端服务：
   ```bash
   cd backend
   python main.py
   ```

2. 启动前端服务：
   ```bash
   cd frontend
   npm run dev
   ```

3. 访问设置页面：
   - 在侧边栏点击"设置"
   - 选择"添加服务器"标签页
   - 填写服务器信息

### 2. 配置选项说明

#### 基本信息
- **服务器ID**: 唯一标识符，用于区分不同服务器（如：`tencent_prod`）
- **服务器名称**: 显示名称（如：`腾讯云生产环境`）
- **IP地址**: 服务器IP或域名
- **用户名**: SSH登录用户名（如：`ubuntu`）
- **端口**: SSH端口，默认22
- **项目路径**: 远程服务器上的项目根目录

#### 认证方式

**密码认证：**
- 选择"密码认证"
- 输入SSH登录密码

**SSH密钥认证（推荐）：**
- 选择"SSH密钥认证"
- 提供私钥文件路径，或直接粘贴私钥内容
- 支持RSA、ECDSA、Ed25519等格式

### 3. 生成SSH密钥对（如果还没有）

```bash
# 生成RSA密钥对
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# 或生成Ed25519密钥对（更安全，推荐）
ssh-keygen -t ed25519 -C "your_email@example.com"
```

生成的私钥通常在 `~/.ssh/id_rsa` 或 `~/.ssh/id_ed25519`

### 4. 将公钥添加到服务器

```bash
# 复制公钥到服务器
ssh-copy-id -i ~/.ssh/id_rsa.pub user@server_ip

# 或手动添加
cat ~/.ssh/id_rsa.pub | ssh user@server_ip "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

### 5. 测试连接

在添加服务器配置后，点击"测试连接"按钮验证配置是否正确。

## API端点

### 测试连接
```
POST /api/servers/test-connection
Content-Type: application/json

{
  "server_id": "tencent_prod",
  "name": "腾讯云生产环境",
  "host": "192.168.1.100",
  "user": "ubuntu",
  "port": 22,
  "auth_type": "key",
  "private_key_path": "/home/user/.ssh/id_rsa",
  "project_path": "/home/ubuntu/MetaSeekOJ"
}
```

### 保存服务器配置
```
POST /api/servers
Content-Type: application/json

{
  "server_id": "tencent_prod",
  "name": "腾讯云生产环境",
  "host": "192.168.1.100",
  "user": "ubuntu",
  "port": 22,
  "auth_type": "password",
  "password": "your_password",
  "project_path": "/home/ubuntu/MetaSeekOJ"
}
```

## 安全建议

1. **优先使用SSH密钥认证**，避免密码泄露风险
2. **不要将私钥内容提交到版本控制系统**
3. **使用私钥文件路径**而不是直接粘贴私钥内容（更安全）
4. **定期更换密钥**，提高安全性
5. **限制私钥文件权限**：
   ```bash
   chmod 600 ~/.ssh/id_rsa
   ```

## 故障排除

### 连接失败
- 检查IP地址和端口是否正确
- 确认服务器SSH服务正在运行
- 检查防火墙设置

### 认证失败
- 验证用户名和密码是否正确
- 检查私钥文件路径和权限
- 确认公钥已正确添加到服务器的 `~/.ssh/authorized_keys`

### 私钥格式错误
- 确保私钥格式正确（以 `-----BEGIN` 开头）
- 尝试重新生成密钥对
- 检查私钥文件是否损坏

## 技术实现

- 使用 `paramiko` 库进行SSH连接
- 支持多种密钥格式（RSA、ECDSA、Ed25519）
- 自动处理主机密钥验证
- 连接超时保护（默认10秒）

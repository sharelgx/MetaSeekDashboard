"""
SSH连接管理模块
支持密码认证和密钥认证两种方式
"""
import paramiko
import os
import io
from typing import Optional, Dict, Any
from pathlib import Path


class SSHManager:
    """SSH连接管理器"""
    
    def __init__(self):
        self.client: Optional[paramiko.SSHClient] = None
    
    def connect(
        self,
        host: str,
        user: str,
        port: int = 22,
        password: Optional[str] = None,
        private_key_path: Optional[str] = None,
        private_key_content: Optional[str] = None,
        timeout: int = 10
    ) -> Dict[str, Any]:
        """
        连接到SSH服务器
        
        Args:
            host: 服务器IP或域名
            user: 用户名
            port: SSH端口，默认22
            password: 密码（如果使用密码认证）
            private_key_path: 私钥文件路径（如果使用密钥认证）
            private_key_content: 私钥内容（如果使用密钥认证，字符串形式）
            timeout: 连接超时时间（秒）
        
        Returns:
            {
                "success": bool,
                "message": str,
                "error": Optional[str]
            }
        """
        try:
            # 关闭已有连接
            if self.client:
                self.client.close()
            
            # 创建SSH客户端
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            # 准备认证参数
            auth_kwargs = {
                'hostname': host,
                'username': user,
                'port': port,
                'timeout': timeout,
                'look_for_keys': False,  # 不自动查找密钥
                'allow_agent': False,    # 不使用SSH agent
            }
            
            # 优先使用密钥认证
            if private_key_content or private_key_path:
                try:
                    private_key = None
                    
                    # 从内容或文件加载私钥
                    if private_key_content:
                        # 从字符串内容加载，尝试多种密钥格式
                        key_file = io.StringIO(private_key_content)
                        try:
                            # 尝试RSA密钥
                            private_key = paramiko.RSAKey.from_private_key(key_file)
                        except:
                            try:
                                # 尝试ECDSA密钥
                                key_file.seek(0)
                                private_key = paramiko.ECDSAKey.from_private_key(key_file)
                            except:
                                try:
                                    # 尝试Ed25519密钥
                                    key_file.seek(0)
                                    private_key = paramiko.Ed25519Key.from_private_key(key_file)
                                except:
                                    # 尝试使用通用方法
                                    key_file.seek(0)
                                    private_key = paramiko.PKey.from_private_key(key_file)
                    elif private_key_path and os.path.exists(private_key_path):
                        # 从文件加载，尝试多种密钥格式
                        try:
                            private_key = paramiko.RSAKey.from_private_key_file(private_key_path)
                        except:
                            try:
                                private_key = paramiko.ECDSAKey.from_private_key_file(private_key_path)
                            except:
                                try:
                                    private_key = paramiko.Ed25519Key.from_private_key_file(private_key_path)
                                except:
                                    # 使用通用方法
                                    private_key = paramiko.PKey.from_private_key_file(private_key_path)
                    else:
                        return {
                            "success": False,
                            "message": "私钥文件不存在",
                            "error": f"Private key file not found: {private_key_path}"
                        }
                    
                    if private_key:
                        auth_kwargs['pkey'] = private_key
                    else:
                        return {
                            "success": False,
                            "message": "无法解析私钥格式",
                            "error": "Unable to parse private key format"
                        }
                except Exception as e:
                    return {
                        "success": False,
                        "message": f"私钥加载失败: {str(e)}",
                        "error": str(e)
                    }
            elif password:
                # 使用密码认证
                auth_kwargs['password'] = password
            else:
                return {
                    "success": False,
                    "message": "请提供密码或私钥",
                    "error": "Either password or private key must be provided"
                }
            
            # 尝试连接
            self.client.connect(**auth_kwargs)
            
            return {
                "success": True,
                "message": "连接成功",
                "error": None
            }
            
        except paramiko.AuthenticationException as e:
            return {
                "success": False,
                "message": "认证失败，请检查用户名、密码或密钥",
                "error": f"Authentication failed: {str(e)}"
            }
        except paramiko.SSHException as e:
            return {
                "success": False,
                "message": f"SSH连接错误: {str(e)}",
                "error": f"SSH error: {str(e)}"
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"连接失败: {str(e)}",
                "error": str(e)
            }
    
    def test_connection(self) -> Dict[str, Any]:
        """
        测试当前连接是否有效
        
        Returns:
            {
                "success": bool,
                "message": str,
                "output": Optional[str],
                "error": Optional[str]
            }
        """
        if not self.client:
            return {
                "success": False,
                "message": "未建立连接",
                "output": None,
                "error": "No active connection"
            }
        
        try:
            # 执行简单命令测试连接
            stdin, stdout, stderr = self.client.exec_command('whoami && hostname')
            exit_status = stdout.channel.recv_exit_status()
            output = stdout.read().decode('utf-8').strip()
            error = stderr.read().decode('utf-8').strip()
            
            if exit_status == 0:
                return {
                    "success": True,
                    "message": "连接正常",
                    "output": output,
                    "error": None
                }
            else:
                return {
                    "success": False,
                    "message": "命令执行失败",
                    "output": output,
                    "error": error
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"测试失败: {str(e)}",
                "output": None,
                "error": str(e)
            }
    
    def execute_command(self, command: str) -> Dict[str, Any]:
        """
        执行SSH命令
        
        Args:
            command: 要执行的命令
        
        Returns:
            {
                "success": bool,
                "stdout": Optional[str],
                "stderr": Optional[str],
                "exit_status": Optional[int],
                "error": Optional[str]
            }
        """
        if not self.client:
            return {
                "success": False,
                "stdout": None,
                "stderr": None,
                "exit_status": None,
                "error": "未建立连接"
            }
        
        try:
            stdin, stdout, stderr = self.client.exec_command(command)
            exit_status = stdout.channel.recv_exit_status()
            stdout_text = stdout.read().decode('utf-8')
            stderr_text = stderr.read().decode('utf-8')
            
            return {
                "success": exit_status == 0,
                "stdout": stdout_text,
                "stderr": stderr_text,
                "exit_status": exit_status,
                "error": None if exit_status == 0 else stderr_text
            }
        except Exception as e:
            return {
                "success": False,
                "stdout": None,
                "stderr": None,
                "exit_status": None,
                "error": str(e)
            }
    
    def close(self):
        """关闭SSH连接"""
        if self.client:
            self.client.close()
            self.client = None
    
    def __del__(self):
        """析构函数，确保连接被关闭"""
        self.close()


# 全局SSH管理器实例
ssh_manager = SSHManager()

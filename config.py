"""Configuration management for the personal website."""
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Application configuration class."""
    
    # Flask settings
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    
    # Server settings
    HOST = os.getenv('HOST', '0.0.0.0')
    PORT = int(os.getenv('PORT', 80))
    
    # Admin settings
    ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'admin123')
    
    # Feishu notification settings
    FEISHU_WEBHOOK_URL = os.getenv('FEISHU_WEBHOOK_URL', 
                                    'https://open.feishu.cn/open-apis/bot/v2/hook/placeholder')
    FEISHU_NOTIFY_ENABLED = os.getenv('FEISHU_NOTIFY_ENABLED', 'false').lower() == 'true'
    
    # Database settings
    DATABASE_PATH = os.getenv('DATABASE_PATH', 'data/visitors.db')
    
    # Rate limiting for notifications (seconds)
    NOTIFY_RATE_LIMIT = 300  # 5 minutes

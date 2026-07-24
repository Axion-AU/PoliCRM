import os
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Support both PostgreSQL and SQLite
# Set DATABASE_URL env var to use PostgreSQL, otherwise defaults to SQLite
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./crm.db')

# Determine if using SQLite
is_sqlite = DATABASE_URL.startswith('sqlite')

if is_sqlite:
    engine = create_engine(
        DATABASE_URL, 
        connect_args={"check_same_thread": False, "timeout": 30}
    )
    
    # Enable WAL mode for better concurrent access (SQLite only)
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()
else:
    # PostgreSQL - use connection pool for better performance
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

import time
import logging
from functools import wraps
from sqlalchemy.exc import OperationalError

logger = logging.getLogger(__name__)

def retry_on_lock(max_retries=5, delay=1.0):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except OperationalError as e:
                    if "locked" in str(e) and attempt < max_retries - 1:
                        logger.warning(f"Database locked, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                        time.sleep(delay)
                    else:
                        raise
            return func(*args, **kwargs)
        return wrapper
    return decorator

"""
Database viewer/explorer endpoints.
Provides introspection into database tables and statistics.
"""
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from pydantic import BaseModel

from ..database import get_db, engine
from ..dependencies import get_current_active_user
from ..models import User

logger = logging.getLogger(__name__)

router = APIRouter()


class TableInfo(BaseModel):
    name: str
    row_count: int
    columns: List[str]


class DatabaseStats(BaseModel):
    tables: List[TableInfo]
    total_tables: int
    database_type: str


@router.get("/stats", response_model=DatabaseStats)
def get_database_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get overview of all database tables and their sizes."""
    inspector = inspect(engine)
    tables = []
    
    # Determine database type
    db_type = "postgresql" if "postgresql" in str(engine.url) else "sqlite"
    
    for table_name in inspector.get_table_names():
        try:
            # Get column names
            columns = [col['name'] for col in inspector.get_columns(table_name)]
            
            # Get row count
            result = db.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
            count = result.scalar()
            
            tables.append(TableInfo(
                name=table_name,
                row_count=count or 0,
                columns=columns
            ))
        except Exception as e:
            logger.warning(f"Error getting info for table {table_name}: {e}")
            tables.append(TableInfo(
                name=table_name,
                row_count=0,
                columns=[]
            ))
    
    # Sort by row count descending
    tables.sort(key=lambda t: t.row_count, reverse=True)
    
    return DatabaseStats(
        tables=tables,
        total_tables=len(tables),
        database_type=db_type
    )


@router.get("/table/{table_name}")
def browse_table(
    table_name: str,
    page: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Browse contents of a specific table with pagination."""
    inspector = inspect(engine)
    
    # Validate table exists
    if table_name not in inspector.get_table_names():
        return {"error": f"Table '{table_name}' not found"}
    
    # Get columns
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    
    # Get total count
    count_result = db.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
    total = count_result.scalar()
    
    # Get rows with pagination
    offset = page * limit
    result = db.execute(text(f"SELECT * FROM {table_name} LIMIT :limit OFFSET :offset"), 
                        {"limit": limit, "offset": offset})
    
    rows = []
    for row in result:
        rows.append(dict(zip(columns, row)))
    
    return {
        "table": table_name,
        "columns": columns,
        "rows": rows,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }


@router.get("/query")
def run_query(
    sql: str = Query(..., description="SQL query to execute (SELECT only)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Execute a read-only SQL query (SELECT statements only)."""
    # Security: Only allow SELECT statements
    sql_lower = sql.lower().strip()
    if not sql_lower.startswith("select"):
        return {"error": "Only SELECT statements are allowed"}
    
    # Block dangerous keywords
    dangerous = ['drop', 'delete', 'update', 'insert', 'alter', 'truncate', 'create', 'grant', 'revoke']
    for keyword in dangerous:
        if keyword in sql_lower:
            return {"error": f"Keyword '{keyword}' is not allowed"}
    
    try:
        result = db.execute(text(sql))
        columns = list(result.keys())
        rows = [dict(zip(columns, row)) for row in result]
        
        return {
            "columns": columns,
            "rows": rows[:1000],  # Limit to 1000 rows
            "truncated": len(rows) > 1000
        }
    except Exception as e:
        return {"error": str(e)}

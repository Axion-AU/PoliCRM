"""
WebSocket endpoints for real-time updates.
"""
import asyncio
import json
import logging
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func

from ..database import get_db, SessionLocal
from ..era_models import ERAUpload, ERARecord
from ..dependencies import get_current_active_user

logger = logging.getLogger(__name__)

router = APIRouter()

# Store active WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")
    
    async def broadcast(self, message: dict):
        """Send message to all connected clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        
        for conn in disconnected:
            self.active_connections.discard(conn)

manager = ConnectionManager()

# Background task to push updates
async def broadcast_updates():
    """Periodically broadcast stats and ERA status to all connected clients."""
    from ..models import Member, CheckResult
    
    while True:
        try:
            if manager.active_connections:
                db = SessionLocal()
                try:
                    # 1. ERA Status
                    uploads = db.query(ERAUpload).order_by(ERAUpload.uploaded_at.desc()).limit(5).all()
                    era_status = {
                        "uploads": [
                            {
                                "id": u.id,
                                "filename": u.filename,
                                "state": u.state,
                                "record_count": u.record_count,
                                "status": getattr(u, 'status', 'complete'),
                            }
                            for u in uploads
                        ],
                        "total_records": db.query(func.count(ERARecord.id)).scalar() or 0
                    }
                    
                    # 2. Dashboard Stats (Simplified for Sidebar)
                    # Use subquery to get the LATEST check result for each member (same as stats.py)
                    latest_checks_subquery = db.query(
                        CheckResult.member_id,
                        func.max(CheckResult.id).label("max_id")
                    ).group_by(CheckResult.member_id).subquery()
                    
                    LatestCheckResult = aliased(CheckResult)
                    
                    def get_count_in_ws(status_filter):
                        q = db.query(Member)
                        q = q.join(latest_checks_subquery, Member.id == latest_checks_subquery.c.member_id)
                        q = q.join(LatestCheckResult, LatestCheckResult.id == latest_checks_subquery.c.max_id)
                        return q.filter(status_filter).count()

                    verified = get_count_in_ws(LatestCheckResult.result == "Pass")
                    partial = get_count_in_ws(LatestCheckResult.result == "Partial")
                    failed = get_count_in_ws(LatestCheckResult.result.in_(["Fail", "Fail_Suburb", "Fail_Street", "Fail_No_Match"]))
                    
                    # Unchecked is Total - (Verified + Failed + Partial)
                    # Note: Captcha is usually grouped with Failed or separate. 
                    # Let's count Captcha separately to be precise like stats.py, 
                    # but if sidebar sums them, we should send it.
                    captcha = get_count_in_ws(LatestCheckResult.result == "Captcha")
                    
                    total_members = db.query(Member).count()
                    checked_count = verified + failed + partial + captcha
                    unchecked = max(0, total_members - checked_count)
                    
                    dashboard_stats = {
                        "verified_count": verified,
                        "failed_count": failed, # Note: Does frontend expect Captcha in Failed? Or separate? 
                                                # stats.py sends captcha_count separately. 
                                                # Use strict separation here.
                        "partial_match_count": partial,
                        "captcha_count": captcha, # Added captcha
                        "unchecked_count": unchecked,
                        "total_members": total_members
                    }
                    
                    # 3. Queue Status
                    from ..dependencies import browser_pool
                    queue_status = None
                    try:
                        queue_status = {
                            "is_running": browser_pool.is_running if browser_pool else False,
                            "jobs_pending": browser_pool.job_queue.qsize() if browser_pool else 0,
                            "jobs_completed": browser_pool.completed_count if browser_pool else 0,
                            "current_job": browser_pool.current_item if browser_pool else None,
                            "last_error": browser_pool.last_error if browser_pool else None,
                        }
                    except Exception:
                        pass
                    
                    msg = {
                        "type": "update",
                        "era": era_status,
                        "dashboard": dashboard_stats,
                        "queue": queue_status
                    }
                    
                    await manager.broadcast(msg)
                finally:
                    db.close()
        except Exception as e:
            logger.error(f"Broadcaster error: {e}")
        
        await asyncio.sleep(3)  # Update every 3 seconds


@router.websocket("/ws/updates")
async def websocket_updates(websocket: WebSocket):
    """WebSocket endpoint for real-time application updates."""
    await manager.connect(websocket)
    
    try:
        while True:
            # Keep connection alive, handle any incoming messages
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                # Handle ping/pong
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Send keepalive
                await websocket.send_json({"type": "keepalive"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# Start the broadcaster when the module loads
_broadcaster_task = None

def start_broadcaster():
    global _broadcaster_task
    if _broadcaster_task is None:
        loop = asyncio.get_event_loop()
        _broadcaster_task = loop.create_task(broadcast_updates())
        logger.info("Broadcaster task started")

def stop_broadcaster():
    global _broadcaster_task
    if _broadcaster_task:
        _broadcaster_task.cancel()
        _broadcaster_task = None
        logger.info("Broadcaster task stopped")

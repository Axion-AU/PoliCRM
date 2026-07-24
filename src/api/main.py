from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import os
import sys
import logging

from rich.logging import RichHandler

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    datefmt="[%X]",
    handlers=[RichHandler(rich_tracebacks=True)]
)
logger = logging.getLogger("api")

# Add src to path so we can import aec_core
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from .database import engine, Base, SessionLocal
from .models import User
from .dependencies import browser_pool
from .routers import members, tags, stats, users, views, integrations, analytics, searches, system, era, websocket, db_viewer
from . import era_models  # Import to register ERA tables
from .services import daemon

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AEC CRM API")

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.requests import Request

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error: {exc}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "message": "Validation Error"},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "message": "Internal Server Error"},
    )

# Mount GeoJSON files - REMOVED (Conflicting with static/geojson)
# geojson_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "GeoJSON")
# if os.path.exists(geojson_path):
#     app.mount("/static/geojson", StaticFiles(directory=geojson_path), name="geojson")

# Mount static files
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")

# Mount assets for React app
assets_path = os.path.join(os.path.dirname(__file__), "static", "dist", "assets")
if os.path.exists(assets_path):
    app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

# Include Routers
app.include_router(views.router)
app.include_router(members.router, prefix="/members", tags=["members"])
app.include_router(tags.router, prefix="/tags", tags=["tags"])
app.include_router(stats.router, prefix="/stats", tags=["stats"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
app.include_router(searches.router, prefix="/searches", tags=["searches"])
app.include_router(system.router, prefix="/system", tags=["system"])
app.include_router(era.router, prefix="/era", tags=["era"])
app.include_router(websocket.router, tags=["websocket"])
app.include_router(db_viewer.router, prefix="/db", tags=["database"])

try:
    app.include_router(integrations.router, prefix="/integrations", tags=["integrations"])
except Exception as e:
    logger.error(f"Failed to load integrations router: {e}")


@app.on_event("startup")
async def startup_event():
    browser_pool.start()
    daemon.start_daemon()
    websocket.start_broadcaster()
    
    # Seed Initial Users
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            logger.info("Seeding initial admin users...")
            initial_users = [
                User(email="miles@fusionparty.org.au", role="admin", is_active=True),
                User(email="drew@fusionparty.org.au", role="admin", is_active=True),
                User(email="admin@fusionparty.org.au", role="admin", is_active=True)
            ]
            db.add_all(initial_users)
            db.commit()
            logger.info("Seeded users: Miles, Drew, Admin")
            
        # Seed Initial Parties
        from .models import Party
        if db.query(Party).count() == 0:
            logger.info("Seeding initial parties...")
            parties = [
                Party(name="Fusion Party", type="Federal"),
                Party(name="Science Party", type="Branch"),
                Party(name="Pirate Party", type="Branch"),
                Party(name="Secular Party", type="Branch"),
                Party(name="Climate Change Justice Party", type="Branch")
            ]
            db.add_all(parties)
            db.commit()
            logger.info("Seeded parties")
    except Exception as e:
        logger.error(f"Failed to seed users: {e}")
    finally:
        db.close()

@app.on_event("shutdown")
async def shutdown_event():
    daemon.stop_daemon()
    browser_pool.stop()
    websocket.stop_broadcaster()


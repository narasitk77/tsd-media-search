import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from app.database import Base, engine, run_migrations
from app.views.routes import router
from app.services import vector_service as _vs

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
_log = logging.getLogger(__name__)


async def _startup_vector_index():
    """Background: index all done assets into Qdrant on startup (catches existing data)."""
    await asyncio.sleep(8)  # wait for Qdrant to finish initializing
    from app.database import SessionLocal
    from app.models.asset import Asset
    db = SessionLocal()
    try:
        assets = db.query(Asset).filter(Asset.status == "done").all()
        if not assets:
            return
        indexed = errors = 0
        for asset in assets:
            try:
                if _vs.index_asset(asset):
                    indexed += 1
            except Exception as e:
                errors += 1
                _log.debug(f"Startup vector index error for {asset.item_id[:8]}: {e}")
        _log.info(f"Startup vector index: {indexed}/{len(assets)} assets indexed ({errors} errors)")
    except Exception as e:
        _log.warning(f"Startup vector index failed: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_migrations()
    # Initialize Qdrant collection (non-fatal if Qdrant not yet available)
    try:
        _vs.init_collection()
    except Exception as e:
        _log.warning(f"Qdrant not available at startup (will retry on first use): {e}")
    # Reset assets stuck in "processing" from a previous crashed run
    from app.database import SessionLocal
    from app.models.asset import Asset
    db = SessionLocal()
    try:
        stuck = db.query(Asset).filter(Asset.status == "processing").all()
        for a in stuck:
            a.status = "pending"
            _log.warning(f"Reset stuck processing asset: {a.title or a.item_id}")
        if stuck:
            db.commit()
    finally:
        db.close()
    # Auto-index all existing done assets into Qdrant in background
    asyncio.create_task(_startup_vector_index())
    yield


app = FastAPI(title="Mimir Metadata AI Tool", version="1.0.0", lifespan=lifespan)
app.include_router(router)

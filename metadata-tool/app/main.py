import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.database import Base, engine, run_migrations
from app.views.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_migrations()
    # Reset assets stuck in "processing" from a previous crashed run
    from app.database import SessionLocal
    from app.models.asset import Asset
    db = SessionLocal()
    try:
        stuck = db.query(Asset).filter(Asset.status == "processing").all()
        for a in stuck:
            a.status = "pending"
            logging.getLogger(__name__).warning(f"Reset stuck processing asset: {a.title or a.item_id}")
        if stuck:
            db.commit()
    finally:
        db.close()
    yield


app = FastAPI(title="Mimir Metadata AI Tool", version="1.0.0", lifespan=lifespan)

# Shared-secret guard: require X-Internal-Secret header when INTERNAL_SECRET is set
_SECRET = os.environ.get("INTERNAL_SECRET", "")

@app.middleware("http")
async def require_internal_secret(request: Request, call_next):
    if _SECRET and request.headers.get("X-Internal-Secret") != _SECRET:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)

app.include_router(router)

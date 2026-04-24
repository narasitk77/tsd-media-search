import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    _db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    _dir = os.path.dirname(_db_path)
    if _dir:
        os.makedirs(_dir, exist_ok=True)
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations():
    """Add new columns to existing DB without losing data."""
    col_type_ts = "TIMESTAMP" if not _is_sqlite else "DATETIME"
    new_columns = [
        ("tokens_input",            "REAL"),
        ("tokens_output",           "REAL"),
        ("processed_at",            col_type_ts),
        ("exif_url",                "TEXT"),
        ("ai_editorial_categories", "TEXT"),
        ("ai_location",             "TEXT"),
        ("ai_persons",              "TEXT"),
        ("ai_episode_segment",      "TEXT"),
        ("ai_event_occasion",       "TEXT"),
        ("ai_emotion_mood",         "TEXT"),
        ("ai_language",             "TEXT"),
        ("ai_department",           "TEXT"),
        ("ai_project_series",       "TEXT"),
        ("ai_right_license",        "TEXT"),
        ("ai_deliverable_type",     "TEXT"),
        ("ai_subject_tags",         "TEXT"),
        ("ai_technical_tags",       "TEXT"),
        ("ai_visual_attributes",    "TEXT"),
        ("exif_photographer",       "TEXT"),
        ("exif_camera_model",       "TEXT"),
        ("exif_credit_line",        "TEXT"),
        ("exif_iso",                "TEXT"),
        ("exif_aperture",           "TEXT"),
        ("exif_shutter",            "TEXT"),
        ("exif_focal_length",       "TEXT"),
        ("context_urls",            "TEXT"),
        ("context_text",            "TEXT"),
        ("folder_id",               "TEXT"),
        ("proxy_url",               "TEXT"),
    ]
    with engine.connect() as conn:
        for col, dtype in new_columns:
            try:
                conn.execute(text(f"ALTER TABLE assets ADD COLUMN {col} {dtype}"))
                conn.commit()
            except Exception:
                pass  # column already exists

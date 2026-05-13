from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import inspect, text
from .database import engine
from . import models
from .routes import products
from .routes import reservations
from app.routes import auth
from fastapi.staticfiles import StaticFiles
from app.routes import upload

app = FastAPI(title="Mobile Shop Reservation API")

BASE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BASE_DIR.parent
UPLOADS_DIR = BASE_DIR / "uploads"
FRONTEND_DIR = PROJECT_DIR / "frontend"
UPLOADS_DIR.mkdir(exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")

# create tables
models.Base.metadata.create_all(bind=engine)

inspector = inspect(engine)
product_columns = [column["name"] for column in inspector.get_columns("products")]
if "discount_percent" not in product_columns:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE products ADD COLUMN discount_percent INTEGER DEFAULT 0"))
for column_name in ["model", "storage", "ram", "camera", "processor", "battery", "other_details"]:
    if column_name not in product_columns:
        with engine.begin() as connection:
            connection.execute(text(f"ALTER TABLE products ADD COLUMN {column_name} VARCHAR DEFAULT ''"))

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(reservations.router)
app.include_router(upload.router)

@app.get("/")
def home():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Mobile Shop API Running"}


@app.get("/admin")
def admin_page():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Mobile Shop Admin"}

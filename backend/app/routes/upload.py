from fastapi import APIRouter, Depends, UploadFile, File
from pathlib import Path
import shutil

from ..security.admin_auth import verify_admin_token

router = APIRouter(prefix="/upload", tags=["Upload"])

UPLOADS_DIR = Path(__file__).resolve().parents[2] / "uploads"


@router.post("/images")
async def upload_image(
    file: UploadFile = File(...),
    admin: bool = Depends(verify_admin_token)
):

    UPLOADS_DIR.mkdir(exist_ok=True)
    filename = Path(file.filename).name
    file_location = UPLOADS_DIR / filename

    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    image_url = f"/uploads/{filename}"

    return {"image": image_url}

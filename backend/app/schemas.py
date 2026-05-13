from pydantic import BaseModel, validator
from typing import List
from datetime import datetime
import re


# ---------------- PRODUCT SCHEMAS ---------------- #

class ProductCreate(BaseModel):
    name: str
    brand: str
    category: str
    price: int
    discount_percent: int = 0
    stock: int
    model: str = ""
    storage: str = ""
    ram: str = ""
    camera: str = ""
    processor: str = ""
    battery: str = ""
    other_details: str = ""
    images: List[str]

    @validator("discount_percent")
    def validate_discount_percent(cls, v):
        if v < 0:
            raise ValueError("Discount cannot be negative")
        if v > 90:
            raise ValueError("Discount cannot be more than 90 percent")
        return v

    @validator("images")
    def validate_images(cls, v):
        if len(v) < 3:
            raise ValueError("At least 3 images are required")
        if len(v) > 10:
            raise ValueError("No more than 10 images are allowed")
        return v


class ProductResponse(ProductCreate):
    id: int

    class Config:
        from_attributes = True


# ---------------- RESERVATION SCHEMAS ---------------- #

class ReservationCreate(BaseModel):
    product_id: int
    customer_name: str
    phone: str
    email: str
    address: str
    pickup_date: str

    @validator("phone")
    def validate_phone(cls, v):
        # allow +91XXXXXXXXXX or XXXXXXXXXX
        pattern = r"^(\+91)?[6-9]\d{9}$"

        if not re.match(pattern, v):
            raise ValueError("Phone number must be 10 digits and valid Indian number")

        return v


class ReservationResponse(ReservationCreate):
    id: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

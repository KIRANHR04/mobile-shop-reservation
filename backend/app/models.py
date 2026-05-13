from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    brand = Column(String)
    category = Column(String)
    price = Column(Integer)
    discount_percent = Column(Integer, default=0)
    stock = Column(Integer)
    model = Column(String, default="")
    storage = Column(String, default="")
    ram = Column(String, default="")
    camera = Column(String, default="")
    processor = Column(String, default="")
    battery = Column(String, default="")
    other_details = Column(String, default="")

    # store multiple image URLs
    images = Column(JSON, default=list)

    # relationship
    reservations = relationship("Reservation", back_populates="product")


class Reservation(Base):
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)

    product_id = Column(Integer, ForeignKey("products.id"))

    customer_name = Column(String)
    phone = Column(String)
    email = Column(String)
    address = Column(String)

    pickup_date = Column(String)

    status = Column(String, default="Reserved")

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # reservation expiry (2 days)
    expires_at = Column(DateTime)

    # relationship
    product = relationship("Product", back_populates="reservations")

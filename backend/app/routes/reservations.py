from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import os

from ..database import get_db
from .. import models, schemas
from ..security.admin_auth import verify_admin_token
from ..services.email_service import send_email

router = APIRouter(prefix="/reservations", tags=["Reservations"])

SHOP_OWNER_EMAIL = os.getenv("MAIL_USERNAME")


# CREATE RESERVATION
@router.post("/")
async def create_reservation(reservation: schemas.ReservationCreate, db: Session = Depends(get_db)):
    normalized_phone = reservation.phone.strip()
    normalized_email = reservation.email.strip().lower()

    product = db.query(models.Product).filter(models.Product.id == reservation.product_id).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    expired_reservations = db.query(models.Reservation).filter(
        models.Reservation.product_id == reservation.product_id,
        models.Reservation.status == "Reserved",
        models.Reservation.expires_at < datetime.utcnow()
    ).all()

    for expired_reservation in expired_reservations:
        expired_reservation.status = "Expired"
        product.stock += 1

    if expired_reservations:
        db.commit()
        db.refresh(product)

    existing_reservation = db.query(models.Reservation).filter(
        models.Reservation.product_id == reservation.product_id,
        models.Reservation.status.in_(["Reserved", "Waiting"]),
        (
            (models.Reservation.phone == normalized_phone) |
            (func.lower(models.Reservation.email) == normalized_email)
        )
    ).first()

    if existing_reservation:
        raise HTTPException(
            status_code=400,
            detail="You already have an active reservation for this product"
        )

    if product.stock <= 0:
        raise HTTPException(status_code=400, detail="Product out of stock")

    active_reservations = db.query(models.Reservation).filter(
        models.Reservation.product_id == reservation.product_id,
        models.Reservation.status == "Reserved"
    ).count()

    # Decide reservation status
    status = "Reserved"
    if active_reservations >= 2:
        status = "Waiting"

    expiry_time = datetime.utcnow() + timedelta(days=2)

    if status == "Reserved":
        product.stock -= 1

    new_reservation = models.Reservation(
        product_id=reservation.product_id,
        customer_name=reservation.customer_name,
        phone=normalized_phone,
        email=normalized_email,
        address=reservation.address,
        pickup_date=reservation.pickup_date,
        expires_at=expiry_time,
        status=status
    )

    db.add(new_reservation)
    db.commit()
    db.refresh(new_reservation)

    # CUSTOMER EMAIL
    if status == "Reserved":
        customer_email_body = f"""
Hello {reservation.customer_name},

Your reservation for {product.name} is confirmed.

Brand: {product.brand}
Price: ₹{product.price}

Pickup Date: {reservation.pickup_date}

Please visit the shop within 2 days to collect your phone.

Thank you,
Yashu Mobile and Service Center
"""
    else:
        customer_email_body = f"""
Hello {reservation.customer_name},

The phone {product.name} is currently reserved by other customers.

You have been added to the waiting list.

We will notify you if the phone becomes available.

Thank you,
Yashu Mobile and Service Center
"""

    # SHOP OWNER EMAIL
    owner_email_body = f"""
New Reservation Received

Customer Name: {reservation.customer_name}
Phone: {reservation.phone}
Email: {reservation.email}

Product: {product.name}
Brand: {product.brand}
Price: ₹{product.price}

Status: {status}
Pickup Date: {reservation.pickup_date}
"""

    try:
        await send_email("Reservation Update", reservation.email, customer_email_body)
        await send_email("New Reservation Received", SHOP_OWNER_EMAIL, owner_email_body)
    except Exception as e:
        print("EMAIL ERROR:", e)

    return new_reservation


# GET ALL RESERVATIONS (Admin Dashboard)
@router.get("/")
def get_reservations(
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin_token)
):

    expired_reservations = db.query(models.Reservation).filter(
        models.Reservation.status == "Reserved",
        models.Reservation.expires_at < datetime.utcnow()
    ).all()

    for reservation in expired_reservations:

        reservation.status = "Expired"

        product = db.query(models.Product).filter(
            models.Product.id == reservation.product_id
        ).first()

        if product:
            product.stock += 1

    db.commit()

    reservations = db.query(models.Reservation).all()

    return reservations


# GET RESERVATIONS BY STATUS (Admin Filter)
@router.get("/status/{status}")
def get_reservations_by_status(
    status: str,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin_token)
):

    reservations = db.query(models.Reservation).filter(
        models.Reservation.status == status
    ).all()

    return reservations


# CANCEL RESERVATION
@router.put("/{reservation_id}/cancel")
async def cancel_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin_token)
):

    reservation = db.query(models.Reservation).filter(
        models.Reservation.id == reservation_id
    ).first()

    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    if reservation.status not in ["Reserved", "Waiting"]:
        raise HTTPException(status_code=400, detail="Reservation cannot be cancelled")

    was_reserved = reservation.status == "Reserved"
    reservation.status = "Cancelled"

    product = db.query(models.Product).filter(
        models.Product.id == reservation.product_id
    ).first()

    if product and was_reserved:
        product.stock += 1

    # Auto reserve next waiting user
    if product and was_reserved:
        next_waiting = db.query(models.Reservation).filter(
            models.Reservation.product_id == reservation.product_id,
            models.Reservation.status == "Waiting"
        ).first()

        if next_waiting:
            next_waiting.status = "Reserved"
            product.stock -= 1

    db.commit()

    # CUSTOMER EMAIL
    customer_email_body = f"""
Hello {reservation.customer_name},

Your reservation for {product.name} has been cancelled.

If you wish, you can reserve another phone.

Thank you,
Yashu Mobile and Service Center
"""

    # SHOP OWNER EMAIL
    owner_email_body = f"""
Reservation Cancelled

Customer Name: {reservation.customer_name}
Phone: {reservation.phone}
Email: {reservation.email}

Product: {product.name}
Brand: {product.brand}
Price: ₹{product.price}
"""

    try:
        await send_email("Reservation Cancelled", reservation.email, customer_email_body)
        await send_email("Customer Cancelled Reservation", SHOP_OWNER_EMAIL, owner_email_body)
    except Exception as e:
        print("EMAIL ERROR:", e)

    return {"message": "Reservation cancelled successfully"}


# COLLECT PHONE
@router.put("/{reservation_id}/collect")
async def collect_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin_token)
):

    reservation = db.query(models.Reservation).filter(
        models.Reservation.id == reservation_id
    ).first()

    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    if reservation.status != "Reserved":
        raise HTTPException(status_code=400, detail="Reservation cannot be collected")

    reservation.status = "Collected"

    product = db.query(models.Product).filter(
        models.Product.id == reservation.product_id
    ).first()

    db.commit()

    email_body = f"""
Hello {reservation.customer_name},

You have successfully collected your {product.name}.

Thank you for shopping with Yashu Mobile and Service Center.

Enjoy your new phone!
"""

    try:
        await send_email("Phone Collected Successfully", reservation.email, email_body)
    except Exception as e:
        print("EMAIL ERROR:", e)

    return {"message": "Product collected successfully"}


# GET RESERVATIONS BY PRODUCT
@router.get("/product/{product_id}")
def get_reservations_by_product(
    product_id: int,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin_token)
):

    reservations = db.query(models.Reservation).filter(
        models.Reservation.product_id == product_id
    ).all()

    return reservations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from fastapi import HTTPException

from ..database import get_db
from .. import models, schemas
from ..security.admin_auth import verify_admin_token

router = APIRouter(prefix="/products", tags=["Products"])


# Add product (Admin only)
@router.post("/")
def add_product(
    product: schemas.ProductCreate,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin_token)
):
    
    new_product = models.Product(
        name=product.name,
        brand=product.brand,
        category=product.category,
        price=product.price,
        discount_percent=product.discount_percent,
        stock=product.stock,
        model=product.model,
        storage=product.storage,
        ram=product.ram,
        camera=product.camera,
        processor=product.processor,
        battery=product.battery,
        other_details=product.other_details,
        images=product.images
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    return new_product


# Get all products (User + Admin)
@router.get("/")
def get_products(db: Session = Depends(get_db)):

    products = db.query(models.Product).all()

    return products


# Get single product (User + Admin)
@router.get("/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db)):

    product = db.query(models.Product).filter(
        models.Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product


# Update product (Admin only)
@router.put("/{product_id}")
def update_product(
    product_id: int,
    product: schemas.ProductCreate,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin_token)
):

    existing_product = db.query(models.Product).filter(
        models.Product.id == product_id
    ).first()

    if not existing_product:
        raise HTTPException(status_code=404, detail="Product not found")

    existing_product.name = product.name
    existing_product.brand = product.brand
    existing_product.category = product.category
    existing_product.price = product.price
    existing_product.discount_percent = product.discount_percent
    existing_product.stock = product.stock
    existing_product.model = product.model
    existing_product.storage = product.storage
    existing_product.ram = product.ram
    existing_product.camera = product.camera
    existing_product.processor = product.processor
    existing_product.battery = product.battery
    existing_product.other_details = product.other_details
    existing_product.images = product.images

    db.commit()
    db.refresh(existing_product)

    return existing_product


# Delete product (Admin only)
@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin_token)
):

    product = db.query(models.Product).filter(
        models.Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    db.delete(product)
    db.commit()

    return {"message": "Product deleted successfully"}

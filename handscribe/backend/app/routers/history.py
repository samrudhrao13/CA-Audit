from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Extraction
from app.schemas import ExtractionHistoryItem

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=list[ExtractionHistoryItem])
def list_history(db: Session = Depends(get_db)) -> list[ExtractionHistoryItem]:
    extractions = (
        db.query(Extraction).order_by(Extraction.created_at.desc()).limit(100).all()
    )
    items = []
    for e in extractions:
        fields = (e.result_json or {}).get("fields", [])
        preview_parts = [
            f"{f['name']}: {f['value']}" for f in fields[:3] if f.get("value")
        ]
        preview = "; ".join(preview_parts) or "(no values extracted)"
        items.append(
            ExtractionHistoryItem(
                id=e.id,
                template_name=e.template_name,
                created_at=e.created_at,
                preview=preview,
            )
        )
    return items

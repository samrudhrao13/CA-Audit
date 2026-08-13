from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Template, TemplateField
from app.schemas import TemplateCreate, TemplateOut, TemplateUpdate

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(payload: TemplateCreate, db: Session = Depends(get_db)) -> Template:
    existing = db.query(Template).filter(Template.name == payload.name).first()
    if existing:
        raise HTTPException(409, f"A template named '{payload.name}' already exists.")

    template = Template(name=payload.name)
    for i, f in enumerate(payload.fields):
        template.fields.append(
            TemplateField(
                name=f.name,
                field_type=f.field_type.value,
                regex_pattern=f.regex_pattern,
                required=f.required,
                position=i,
            )
        )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("", response_model=list[TemplateOut])
def list_templates(db: Session = Depends(get_db)) -> list[Template]:
    return db.query(Template).order_by(Template.created_at.desc()).all()


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: str, db: Session = Depends(get_db)) -> Template:
    template = db.get(Template, template_id)
    if not template:
        raise HTTPException(404, "Template not found.")
    return template


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: str, payload: TemplateUpdate, db: Session = Depends(get_db)
) -> Template:
    template = db.get(Template, template_id)
    if not template:
        raise HTTPException(404, "Template not found.")

    name_conflict = (
        db.query(Template)
        .filter(Template.name == payload.name, Template.id != template_id)
        .first()
    )
    if name_conflict:
        raise HTTPException(409, f"A template named '{payload.name}' already exists.")

    template.name = payload.name
    template.fields.clear()
    for i, f in enumerate(payload.fields):
        template.fields.append(
            TemplateField(
                name=f.name,
                field_type=f.field_type.value,
                regex_pattern=f.regex_pattern,
                required=f.required,
                position=i,
            )
        )
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: str, db: Session = Depends(get_db)) -> None:
    template = db.get(Template, template_id)
    if not template:
        raise HTTPException(404, "Template not found.")
    db.delete(template)
    db.commit()

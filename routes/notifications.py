"""
Notifications API
GET  /notifications              → list recent notifications
GET  /notifications/unread-count → { count: N }
PATCH /notifications/read        → mark all (or specific) as read
"""
from fastapi import APIRouter, Request, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional
import database_postgres as db
from routes.auth import _get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


class MarkReadRequest(BaseModel):
    notification_ids: Optional[List[str]] = None  # None = mark all


@router.get("")
async def list_notifications(request: Request, limit: int = 20):
    """Return the most recent notifications for the current user."""
    user_data = _get_current_user(request)
    user_id = user_data.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        notifications = db.get_notifications(user_id, limit=limit)
        # Serialize datetime to ISO string
        for n in notifications:
            if n.get("created_at"):
                n["created_at"] = n["created_at"].isoformat()
            if n.get("id"):
                n["id"] = str(n["id"])
        return {"notifications": notifications, "count": len(notifications)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch notifications: {e}")


@router.get("/unread-count")
async def unread_count(request: Request):
    """Return the number of unread notifications for the current user."""
    user_data = _get_current_user(request)
    user_id = user_data.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        count = db.get_unread_notification_count(user_id)
        return {"count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch unread count: {e}")


@router.patch("/read")
async def mark_read(request: Request, body: MarkReadRequest = Body(default=MarkReadRequest())):
    """Mark all (or specified) notifications as read for the current user."""
    user_data = _get_current_user(request)
    user_id = user_data.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    ids = (body.notification_ids if body else None) or None
    try:
        updated = db.mark_notifications_read(user_id, notification_ids=ids)
        return {"updated": updated, "message": "Marked as read"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to mark notifications read: {e}")

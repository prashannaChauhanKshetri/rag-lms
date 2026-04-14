"""Email utilities for RAG-LMS.

Reads config from environment variables:
    SMTP_HOST       — SMTP server hostname (default: smtp.gmail.com)
    SMTP_PORT       — SMTP port (default: 587, uses STARTTLS)
    SMTP_USER       — Sender email address / Gmail address
    SMTP_PASSWORD   — App password (Gmail: create at myaccount.google.com/apppasswords)
    _base_url()    — Base URL of the app (e.g. https://raglms.yourdomain.com)
    _from_name()   — Display name in From header (default: RAG-LMS)

If SMTP_USER is not set, all send functions are no-ops and log a warning —
  the app still works, verification/reset tokens are just not delivered by email.
"""
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the project root (same directory as this file), always override
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

logger = logging.getLogger("rag-email")


def _cfg(key: str, default: str = "") -> str:
    """Read config at call-time so .env changes are always picked up."""
    return os.getenv(key, default)


def _smtp_host() -> str: return _cfg("SMTP_HOST", "smtp.gmail.com")
def _smtp_port() -> int:  return int(_cfg("SMTP_PORT", "587"))
def _smtp_user() -> str:  return _cfg("SMTP_USER", "")
def _smtp_pass() -> str:  return _cfg("SMTP_PASSWORD", "")
def _base_url()  -> str:  return _cfg("APP_BASE_URL", "http://localhost:3000")
def _from_name() -> str:  return _cfg("APP_FROM_NAME", "Gyanalms")


def _is_configured() -> bool:
    if not _smtp_user() or not _smtp_pass():
        logger.warning(
            "Email not configured: set SMTP_USER and SMTP_PASSWORD in .env. "
            "Verification/reset emails will NOT be sent."
        )
        return False
    return True


def _send(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    """Send an email via SMTP with STARTTLS. Returns True on success."""
    if not _is_configured():
        return False

    user = _smtp_user()
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{_from_name()} <{user}>"
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(_smtp_host(), _smtp_port(), timeout=10) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(user, _smtp_pass())
            smtp.sendmail(user, to_email, msg.as_string())
        logger.info(f"Email sent to {to_email}: {subject}")
        return True
    except smtplib.SMTPAuthenticationError:
        logger.error(
            "SMTP authentication failed. For Gmail, create an App Password at "
            "https://myaccount.google.com/apppasswords and set SMTP_PASSWORD."
        )
        return False
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def send_verification_email(to_email: str, token: str) -> bool:
    """Send the signup email verification link."""
    link = f"{_base_url()}/verify-email?token={token}"
    subject = f"Verify your {_from_name()} account"

    html_body = f"""
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #4F46E5;">Welcome to {_from_name()}!</h2>
  <p>Thank you for signing up. Please verify your email address by clicking the button below.</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="{link}" style="
      background-color: #4F46E5;
      color: white;
      padding: 14px 28px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
      display: inline-block;
    ">Verify Email Address</a>
  </p>
  <p style="color: #666; font-size: 14px;">
    Or copy this link into your browser:<br>
    <a href="{link}" style="color: #4F46E5;">{link}</a>
  </p>
  <p style="color: #666; font-size: 12px;">This link expires in 24 hours. If you did not sign up, ignore this email.</p>
</body>
</html>
"""
    text_body = (
        f"Welcome to {_from_name()}!\n\n"
        f"Verify your email by visiting:\n{link}\n\n"
        "This link expires in 24 hours."
    )
    return _send(to_email, subject, html_body, text_body)


def send_password_reset_email(to_email: str, token: str) -> bool:
    """Send the password reset link."""
    link = f"{_base_url()}/reset-password?token={token}"
    subject = f"{_from_name()} — Password Reset Request"

    html_body = f"""
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #DC2626;">Password Reset</h2>
  <p>We received a request to reset your {_from_name()} password. Click the button below to choose a new password.</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="{link}" style="
      background-color: #DC2626;
      color: white;
      padding: 14px 28px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
      display: inline-block;
    ">Reset Password</a>
  </p>
  <p style="color: #666; font-size: 14px;">
    Or copy this link into your browser:<br>
    <a href="{link}" style="color: #DC2626;">{link}</a>
  </p>
  <p style="color: #666; font-size: 12px;">
    This link expires in <strong>30 minutes</strong>.<br>
    If you did not request a password reset, ignore this email — your account is safe.
  </p>
</body>
</html>
"""
    text_body = (
        f"Reset your {_from_name()} password:\n{link}\n\n"
        "This link expires in 30 minutes.\n"
        "If you did not request this, ignore the email."
    )
    return _send(to_email, subject, html_body, text_body)

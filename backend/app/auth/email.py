"""Sending email: one function, configured only from the `EMAIL_*` settings.

Port 465 is implicit TLS (`EMAIL_SECURE=true`, Gmail's default). Port 587 with
`EMAIL_SECURE=false` connects in plain text and upgrades with STARTTLS before
anything is sent; a server that will not upgrade is refused rather than used
in the clear. Certificates are checked against the system's trust store.

With `BREVO_API_KEY` set, SMTP is not used at all: the message goes to Brevo's
HTTPS API, from `EMAIL_FROM` (or `EMAIL_USER`), which must be a sender verified
in Brevo. That path exists for hosts that block outbound SMTP ports.

Nothing here logs or returns a credential. Errors are reported by their type
and SMTP status code, which say what went wrong without repeating what was
sent. There is no fallback of any kind: if the email cannot be sent, the caller
is told, and the one-time code it carried is thrown away (`app.auth.otp`).
"""

from __future__ import annotations

import contextlib
import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr

import httpx

from app.core.settings import get_settings

#: Uvicorn's own logger, so these lines appear in the server output beside its
#: startup messages rather than being swallowed by an unconfigured root logger.
log = logging.getLogger("uvicorn.error")

TIMEOUT_SECONDS = 15

BREVO_API = "https://api.brevo.com/v3"


class EmailNotConfigured(RuntimeError):
    """One of `EMAIL_HOST`, `EMAIL_USER` or `EMAIL_PASSWORD` is empty."""


class EmailFailed(RuntimeError):
    """The server refused the message or could not be reached."""


@dataclass(frozen=True)
class Sent:
    """What the SMTP server said when it accepted the message."""

    code: int
    reply: str


def _describe(error: BaseException) -> str:
    """The error's type and SMTP code, never its arguments' secrets."""
    code = getattr(error, "smtp_code", None)
    return f"{type(error).__name__}" + (f" (SMTP {code})" if code else "")


def _connect() -> smtplib.SMTP:
    settings = get_settings()
    if not (settings.email_host and settings.email_user and settings.email_password):
        raise EmailNotConfigured("EMAIL_HOST, EMAIL_USER and EMAIL_PASSWORD must all be set.")
    context = ssl.create_default_context()
    if settings.email_secure:
        server: smtplib.SMTP = smtplib.SMTP_SSL(
            settings.email_host, settings.email_port, timeout=TIMEOUT_SECONDS, context=context
        )
    else:
        server = smtplib.SMTP(settings.email_host, settings.email_port, timeout=TIMEOUT_SECONDS)
        server.ehlo()
        # Raises SMTPNotSupportedError if the server will not upgrade: better
        # no email than a password sent in the clear.
        server.starttls(context=context)
        server.ehlo()
    server.login(settings.email_user, settings.email_password)
    return server


def _brevo_refusal(response: httpx.Response) -> str:
    """Brevo's status and error code (e.g. `unauthorized`); its body never holds the key."""
    try:
        code = response.json().get("code")
    except ValueError:
        code = None
    return f"HTTP {response.status_code}" + (f", {code}" if code else "")


def _send_brevo(*, to: str, subject: str, html: str, text: str) -> Sent:
    settings = get_settings()
    name, address = parseaddr(settings.email_from or settings.email_user)
    if not address:
        raise EmailNotConfigured("EMAIL_FROM or EMAIL_USER must name the sender verified in Brevo.")
    payload = {
        "sender": {"name": name or "IP-SAKTI Sahayak", "email": address},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html,
        "textContent": text,
    }
    try:
        response = httpx.post(
            f"{BREVO_API}/smtp/email",
            json=payload,
            headers={"api-key": settings.brevo_api_key, "accept": "application/json"},
            timeout=TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as error:
        raise EmailFailed(_describe(error)) from None
    if response.status_code not in (200, 201, 202):
        raise EmailFailed(f"message refused ({_brevo_refusal(response)})")
    try:
        message_id = str(response.json().get("messageId", ""))
    except ValueError:
        message_id = ""
    return Sent(code=response.status_code, reply=message_id)


def send_email(*, to: str, subject: str, html: str, text: str) -> Sent:
    """Send one message with a plain-text and an HTML part. Raises on any failure."""
    settings = get_settings()
    if settings.brevo_api_key:
        return _send_brevo(to=to, subject=subject, html=html, text=text)
    sender = settings.email_from or settings.email_user

    message = EmailMessage()
    message["From"] = formataddr(("IP-SAKTI Sahayak", sender)) if "<" not in sender else sender
    message["To"] = to
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain=sender.rsplit("@", 1)[-1].strip("> ") or None)
    message.set_content(text)
    message.add_alternative(html, subtype="html")

    try:
        server = _connect()
    except EmailNotConfigured:
        raise
    except (smtplib.SMTPException, OSError) as error:
        raise EmailFailed(_describe(error)) from None

    try:
        # mail/rcpt/data by hand rather than send_message, to keep the server's
        # own acceptance reply (it carries the queue id, and no secret).
        address = sender.split("<")[-1].rstrip(">").strip()
        server.ehlo_or_helo_if_needed()
        code, _ = server.mail(address)
        if code != 250:
            raise EmailFailed(f"sender refused (SMTP {code})")
        code, _ = server.rcpt(to)
        if code not in (250, 251):
            raise EmailFailed(f"recipient refused (SMTP {code})")
        code, reply = server.data(message.as_bytes())
        if code != 250:
            raise EmailFailed(f"message refused (SMTP {code})")
        return Sent(code=code, reply=reply.decode("utf-8", "replace"))
    except EmailFailed:
        raise
    except (smtplib.SMTPException, OSError) as error:
        raise EmailFailed(_describe(error)) from None
    finally:
        with contextlib.suppress(smtplib.SMTPException, OSError):
            server.quit()


def verify_transport() -> bool:
    """Connect and log in once, at startup. Logs the outcome; never raises."""
    settings = get_settings()
    if settings.brevo_api_key:
        try:
            response = httpx.get(
                f"{BREVO_API}/account",
                headers={"api-key": settings.brevo_api_key, "accept": "application/json"},
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as error:
            log.error("email transport failed (Brevo): %s", _describe(error))
            return False
        if response.status_code != 200:
            log.error("email transport failed (Brevo): %s", _brevo_refusal(response))
            return False
        if not (settings.email_from or settings.email_user):
            log.warning("email transport not configured: fill EMAIL_FROM with the Brevo sender")
            return False
        log.info("email transport ready (Brevo)")
        return True
    try:
        server = _connect()
    except EmailNotConfigured:
        log.warning("email transport not configured: fill EMAIL_USER and EMAIL_PASSWORD")
        return False
    except (smtplib.SMTPException, OSError) as error:
        log.error("email transport failed: %s", _describe(error))
        return False
    with contextlib.suppress(smtplib.SMTPException, OSError):
        server.quit()
    log.info("email transport ready")
    return True

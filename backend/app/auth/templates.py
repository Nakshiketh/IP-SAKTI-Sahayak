"""The one-time code email, as HTML and plain text.

Table layout and inline styles only, because that is what mail clients render
reliably. No images, no links, no tracking pixel, no web font: the message has
to read correctly with everything remote blocked, and it has nothing to report
back to anyone.

The code never appears in the subject line, which lock screens and
notification previews show to anyone standing nearby.

Colours are the portal's: leaf green `#1D4B36` for the name and the code, on
white, with body text in near-black `#1A2029` (both well above WCAG AA).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Literal

Purpose = Literal["login", "password_reset"]

SUBJECT = "Your IP-SAKTI Sahayak verification code"

#: India Standard Time. A fixed offset: India observes no daylight saving, and
#: the zone database is not guaranteed on every host this runs on.
IST = timezone(timedelta(hours=5, minutes=30), "IST")

PRIMARY = "#1D4B36"
INK = "#1A2029"
MUTED = "#4F5866"
LINE = "#D5DAD0"

PURPOSE_LINE = {
    "login": "You asked to log in.",
    "password_reset": "You asked to reset your password.",
}


@dataclass(frozen=True)
class RenderedEmail:
    subject: str
    html: str
    text: str


def ist(moment: datetime) -> str:
    """`26 September 2026, 4:05 pm IST`."""
    local = moment.astimezone(IST)
    hour = local.hour % 12 or 12
    return f"{local.day} {local:%B %Y}, {hour}:{local:%M} {'am' if local.hour < 12 else 'pm'} IST"


def otp_email(
    code: str, purpose: Purpose, requested_at: datetime, *, test: bool = False
) -> RenderedEmail:
    """The verification email. `test=True` marks it, visibly, as a test message."""
    if len(code) != 6 or not code.isdigit():
        raise ValueError("A verification code is six digits.")

    when = ist(requested_at)
    purpose_line = PURPOSE_LINE[purpose]
    subject = f"[Test] {SUBJECT}" if test else SUBJECT
    test_line = "This is a test message. The code below is not valid for signing in."

    text = "\n".join(
        [
            "IP-SAKTI Sahayak",
            "Member verification code",
            "",
            *([test_line, ""] if test else []),
            purpose_line,
            "",
            "Your verification code is:",
            "",
            f"    {code}",
            "",
            "This code expires in 5 minutes.",
            f"Requested: {when}",
            "",
            "If you did not request this verification, please ignore this email.",
        ]
    )

    digits = escape(" ".join(code))  # spaced for reading aloud and for screen readers
    test_row = (
        f'<tr><td style="padding:0 32px 16px 32px;font-size:14px;line-height:1.5;'
        f'color:#8A1C12;font-weight:600;">{escape(test_line)}</td></tr>'
        if test
        else ""
    )
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background-color:#F6F7F3;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="max-width:600px;background-color:#FFFFFF;border:1px solid {LINE};border-radius:6px;
  font-family:'IBM Plex Sans',Segoe UI,Helvetica,Arial,sans-serif;color:{INK};">
<tr><td style="padding:28px 32px 4px 32px;font-family:Georgia,'Times New Roman',serif;
  font-size:22px;font-weight:700;color:{PRIMARY};">IP-SAKTI Sahayak</td></tr>
<tr><td style="padding:0 32px 20px 32px;font-size:14px;color:{MUTED};
  border-bottom:1px solid {LINE};">Member verification code</td></tr>
<tr><td style="padding:20px 32px 0 32px;"></td></tr>
{test_row}
<tr><td style="padding:0 32px 12px 32px;font-size:16px;line-height:1.5;">
  {escape(purpose_line)}</td></tr>
<tr><td style="padding:0 32px 8px 32px;font-size:16px;line-height:1.5;">
  Your verification code is:</td></tr>
<tr><td style="padding:4px 32px 16px 32px;font-size:36px;line-height:1.2;font-weight:700;
  letter-spacing:8px;color:{PRIMARY};font-variant-numeric:tabular-nums;">{digits}</td></tr>
<tr><td style="padding:0 32px 4px 32px;font-size:16px;line-height:1.5;">
  This code expires in 5 minutes.</td></tr>
<tr><td style="padding:0 32px 20px 32px;font-size:14px;line-height:1.5;color:{MUTED};">
  Requested: {escape(when)}</td></tr>
<tr><td style="padding:16px 32px 28px 32px;font-size:14px;line-height:1.5;color:{MUTED};
  border-top:1px solid {LINE};">
  If you did not request this verification, please ignore this email.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
"""
    return RenderedEmail(subject=subject, html=html, text=text)

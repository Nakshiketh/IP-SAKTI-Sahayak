"""Hosts a source may come from, in one place.

The same list decides three things, and they have to agree: which URLs the
backfill may fetch, which links a citation may carry, and which hosts the
source-health check may contact. A host is added only by editing this file,
which is the point — a source from anywhere else cannot quietly become
citable, and no user-supplied URL is ever fetched.

The list is `docs/upgrade/SOURCES_TO_VERIFY.md`, kept in sync by a test.
"""

from __future__ import annotations

from urllib.parse import urlsplit

#: Official publishers of the law this product cites. Subdomains count as the
#: same host (ipronline.ipindia.gov.in under ipindia.gov.in), because an
#: authority serves its portals from them; a separate domain is listed
#: separately, even when the same authority runs it.
ALLOWLISTED_HOSTS: tuple[str, ...] = (
    "ipindia.gov.in",
    # IP India serves its e-filing portals from its own second domain, and the
    # NBA its ABS portal from nbaindia.in. Both are the same authorities as the
    # entries below them; added 2026-09-23 with the owner to confirm.
    "ipindiaonline.gov.in",
    "nbaindia.in",
    "indiacode.nic.in",
    "egazette.gov.in",
    "egazette.nic.in",
    "ayush.gov.in",
    "e-aushadhi.gov.in",
    "pcimh.gov.in",
    "fssai.gov.in",
    "nbaindia.org",
    "nbaindia.nic.in",
    "tkdl.res.in",
    "wipo.int",
    "cbd.int",
    "cdsco.gov.in",
    "ayushportal.nic.in",
    "s3waas.gov.in",
)


def host_of(url: str) -> str:
    """The hostname of a URL, lower-cased and without a port."""
    return (urlsplit(url).hostname or "").lower()


def is_allowlisted(url: str) -> bool:
    """Is this URL served by an allowlisted official host, or a subdomain of one?

    Matching is on label boundaries: "notipindia.gov.in" is not "ipindia.gov.in".
    """
    host = host_of(url)
    if not host:
        return False
    return any(host == allowed or host.endswith("." + allowed) for allowed in ALLOWLISTED_HOSTS)

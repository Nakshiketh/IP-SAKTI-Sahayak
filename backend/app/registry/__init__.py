"""The source registry: what may be cited, and how far it has been checked.

One record per document the product knows about, holding where it came from,
what kind of authority it is, when it was last checked and by whom, and the
hash of the bytes that were fetched. Answers may cite a source only when the
registry says it has been verified, which is the difference between "we have a
URL for this" and "we fetched this from an official host and can prove what we
read".

The registry is metadata only. It never stores law: the passages live in
`corpus/guidance/`, the fetched originals under `corpus/raw/` (gitignored,
because this product has no right to redistribute most of them), and this
table records the link between the two.
"""

from app.registry.hosts import ALLOWLISTED_HOSTS, host_of, is_allowlisted
from app.registry.models import USABLE_STATES, ReviewState, SourceRecord
from app.registry.store import SourceRegistry, get_registry

__all__ = [
    "ALLOWLISTED_HOSTS",
    "USABLE_STATES",
    "ReviewState",
    "SourceRecord",
    "SourceRegistry",
    "get_registry",
    "host_of",
    "is_allowlisted",
]

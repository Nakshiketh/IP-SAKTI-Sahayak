"""The workspace promises: a roadmap that cannot overclaim, and feedback
that cannot be traced back to whoever gave it.

Test ids from the upgrade pack: T17, plus the roadmap-status and feedback rules.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.analyst import roadmap
from app.api.deps import get_feedback_store
from app.core.settings import Settings
from app.main import app
from app.models.domain import IssueType, MissingFact
from app.services.feedback_store import ASPECTS, VERDICTS, FeedbackStore

ALL_ISSUES = {IssueType.PATENT, IssueType.BIODIVERSITY_ABS, IssueType.TRADITIONAL_KNOWLEDGE}


def build(**overrides) -> list[roadmap.Task]:
    fields = {
        "issues_indicated": ALL_ISSUES,
        "missing_facts": [],
        "classification_settled": True,
        "needs_expert_review": False,
    }
    fields.update(overrides)
    return roadmap.build(**fields)


# -- the roadmap can never say a thing happened --------------------------------


def test_no_status_claims_something_only_an_authority_can_observe() -> None:
    """A checklist that let someone tick "approved" would record a belief as a
    fact, and then show it back to them as though the product had verified it.
    """
    for forbidden in roadmap.FORBIDDEN_STATUSES:
        assert forbidden not in roadmap.STATUSES


def test_every_task_ends_at_completed_by_you() -> None:
    tasks = build(completed={task.task_id for task in build()})
    assert tasks
    for task in tasks:
        assert task.status in roadmap.STATUSES
        if task.status == roadmap.COMPLETED_BY_USER:
            # Whose assertion it is, said in the name.
            assert "user" in task.status


def test_no_task_in_any_reachable_state_reports_a_forbidden_status() -> None:
    combinations = [
        build(),
        build(missing_facts=[MissingFact(key="therapeutic_claim", question="?")]),
        build(classification_settled=False),
        build(needs_expert_review=True),
        build(completed={"confirm-classification"}),
        build(issues_indicated=set()),
    ]
    for tasks in combinations:
        for task in tasks:
            assert task.status not in roadmap.FORBIDDEN_STATUSES


# -- dependencies are real ----------------------------------------------------


def test_a_task_waiting_on_another_is_not_ready() -> None:
    tasks = {task.task_id: task for task in build()}
    # Prior art before the classification is settled searches for the wrong
    # thing, so it waits.
    prior_art = tasks["structured-prior-art-search"]
    assert prior_art.status == roadmap.NEEDS_INFORMATION
    assert "confirm-classification" in prior_art.depends_on


def test_finishing_the_dependency_makes_the_next_task_ready() -> None:
    tasks = {t.task_id: t for t in build(completed={"confirm-classification"})}
    assert tasks["structured-prior-art-search"].status == roadmap.READY
    assert tasks["structured-prior-art-search"].depends_on == ()


def test_an_unsettled_classification_holds_the_first_task_open() -> None:
    tasks = {t.task_id: t for t in build(classification_settled=False)}
    assert tasks["confirm-classification"].status == roadmap.NEEDS_INFORMATION


def test_a_task_for_an_issue_this_case_does_not_raise_is_left_out() -> None:
    # Not shown as "not applicable": a checklist of things that do not apply is
    # how a reader learns to stop reading checklists.
    ids = {task.task_id for task in build(issues_indicated=set())}
    assert "structured-prior-art-search" not in ids
    assert "determine-abs-applicability" not in ids
    assert "confirm-classification" in ids


def test_expert_review_appears_only_when_the_case_needs_it() -> None:
    assert "seek-professional-review" not in {t.task_id for t in build()}
    needed = {t.task_id: t for t in build(needs_expert_review=True)}
    assert needed["seek-professional-review"].status == roadmap.REQUIRES_EXPERT_REVIEW


# -- why the assessment changed -----------------------------------------------


def test_a_changed_fact_is_reported_with_both_values() -> None:
    changes = roadmap.changed_facts(
        {"therapeutic_claim": True, "external_use": True},
        {"therapeutic_claim": False, "external_use": True},
    )
    assert changes == [("therapeutic_claim", "yes", "no")]


def test_learning_a_fact_counts_as_a_change() -> None:
    """Going from not knowing to knowing is the commonest reason an assessment
    moves, and a diff over stated values alone would report nothing.
    """
    changes = roadmap.changed_facts({}, {"food_form": True})
    assert changes == [("food_form", "unknown", "yes")]


def test_nothing_is_reported_when_nothing_moved() -> None:
    facts = {"therapeutic_claim": False}
    assert roadmap.changed_facts(facts, facts) == []


# -- feedback carries nobody with it ------------------------------------------


def test_a_feedback_row_holds_no_user_id(tmp_path) -> None:
    store = FeedbackStore(tmp_path / "feedback.sqlite3")
    store.record("partly", aspect="the_sources", jurisdiction="IN", confidence="moderate")
    columns = store.columns()
    for forbidden in ("session_id", "user", "username", "account", "query_id", "ip", "note"):
        assert forbidden not in columns, f"{forbidden} would re-identify the reader"


def test_the_query_id_is_left_out_so_no_join_can_re_identify(tmp_path) -> None:
    # The audit log records a query id against a session. Keeping one here too
    # would link the verdict to a person through a join.
    store = FeedbackStore(tmp_path / "feedback.sqlite3")
    store.record("no")
    assert "query_id" not in store.columns()


def test_free_text_is_accepted_and_never_stored() -> None:
    client = TestClient(app)
    secret = "our formulation uses a rare extract"
    response = client.post(
        "/api/v1/feedback",
        json={"verdict": "no", "note": secret, "jurisdiction": "IN"},
    )
    assert response.status_code == 200
    assert "not stored" in response.json()["note"]

    store = get_feedback_store()
    with store._connect() as connection:  # noqa: SLF001 - asserting what is on disk
        rows = connection.execute("SELECT * FROM feedback").fetchall()
    assert all(secret not in str(tuple(row)) for row in rows)


@pytest.mark.parametrize("verdict", VERDICTS)
def test_every_offered_verdict_is_stored_as_given(verdict: str, tmp_path) -> None:
    store = FeedbackStore(tmp_path / "feedback.sqlite3")
    assert store.record(verdict).verdict == verdict


def test_an_unrecognised_verdict_is_bucketed_rather_than_stored_raw(tmp_path) -> None:
    store = FeedbackStore(tmp_path / "feedback.sqlite3")
    assert store.record("<script>alert(1)</script>").verdict == "other"


def test_an_unrecognised_aspect_is_dropped(tmp_path) -> None:
    store = FeedbackStore(tmp_path / "feedback.sqlite3")
    assert store.record("yes", aspect="something the reader typed").aspect is None
    assert store.record("yes", aspect=ASPECTS[0]).aspect == ASPECTS[0]


def test_feedback_is_kept_in_its_own_file() -> None:
    # Two stores in one file invites the join that must never be possible.
    settings = Settings()
    assert settings.feedback_db_path != settings.audit_db_path


# -- T17: a public question can never reach a saved case ----------------------


def test_the_workspace_refuses_a_request_with_no_account() -> None:
    client = TestClient(app)
    for path in ("/api/v1/analyst/conversations",):
        response = client.get(path)
        assert response.status_code in {401, 403}, f"{path} answered {response.status_code}"


def test_asking_a_question_never_returns_a_saved_case() -> None:
    client = TestClient(app)
    body = {
        "text": "What did I save earlier?",
        "jurisdiction": "IN",
        "product_class": "undetermined",
        "language_out": None,
        "session_id": "anonymous",
    }
    with client.stream("POST", "/api/v1/query", json=body) as response:
        assert response.status_code == 200
        payload = "".join(response.iter_text())
    # The answer path has no access to the analyst store at all; this pins that
    # nothing from it leaks into a public answer.
    for marker in ("conversation_id", "invention", "Bhringraj"):
        assert marker not in payload

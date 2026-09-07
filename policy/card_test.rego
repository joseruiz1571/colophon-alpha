package colophon.card_test

import data.colophon.card
import rego.v1

good_card := {
	"classification": {"risk_tier": "low", "next_review": "2099-01-01"},
	"escalation": {"kill_switch": {"available": true}},
}

test_allow_when_review_current_and_low_risk if {
	card.decision.allow with input as good_card
}

test_allow_when_review_current_and_no_killswitch_needed_for_low_risk if {
	c := object.union(good_card, {"escalation": {"kill_switch": {"available": false}}})
	card.decision.allow with input as c
}

test_deny_when_review_is_past if {
	c := object.union(good_card, {"classification": {"risk_tier": "low", "next_review": "2000-01-01"}})
	not card.decision.allow with input as c
	"CARD-STALE-REVIEW" in card.decision.rule_ids with input as c
}

test_deny_when_high_risk_without_killswitch if {
	c := object.union(good_card, {
		"classification": {"risk_tier": "high", "next_review": "2099-01-01"},
		"escalation": {"kill_switch": {"available": false}},
	})
	not card.decision.allow with input as c
	"CARD-NO-KILLSWITCH" in card.decision.rule_ids with input as c
}

test_allow_when_high_risk_with_killswitch if {
	c := object.union(good_card, {
		"classification": {"risk_tier": "high", "next_review": "2099-01-01"},
		"escalation": {"kill_switch": {"available": true}},
	})
	card.decision.allow with input as c
}

test_deny_when_critical_risk_without_killswitch if {
	c := object.union(good_card, {
		"classification": {"risk_tier": "critical", "next_review": "2099-01-01"},
		"escalation": {"kill_switch": {"available": false}},
	})
	not card.decision.allow with input as c
	"CARD-NO-KILLSWITCH" in card.decision.rule_ids with input as c
}

test_deny_reports_both_rules_when_both_violated if {
	c := {
		"classification": {"risk_tier": "critical", "next_review": "2000-01-01"},
		"escalation": {"kill_switch": {"available": false}},
	}
	rule_ids := card.decision.rule_ids with input as c
	not card.decision.allow with input as c
	"CARD-STALE-REVIEW" in rule_ids
	"CARD-NO-KILLSWITCH" in rule_ids
	count(rule_ids) == 2
}

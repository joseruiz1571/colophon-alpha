package colophon.card

import rego.v1

# colophon card lint evaluates this file against one Agent Card (as `input`)
# and produces a single decision: allow/deny plus the rule IDs and reasons
# behind it. Two rules exist today (SPEC.md C8):
#
#   CARD-STALE-REVIEW      classification.next_review is in the past.
#   CARD-NO-KILLSWITCH     risk_tier is high/critical and no kill switch is
#                          available.
#
# Fail closed: `decision` only ever returns `allow: true` when zero deny
# reasons were produced. There is no default-allow branch.

high_risk_tiers := {"high", "critical"}

deny_reasons contains reason if {
	is_string(input.classification.next_review)
	today := substring(time.format(time.now_ns()), 0, 10) # "YYYY-MM-DD" lexical compare works for ISO dates
	input.classification.next_review < today
	reason := {
		"rule_id": "CARD-STALE-REVIEW",
		"message": sprintf(
			"classification.next_review (%s) is in the past",
			[input.classification.next_review],
		),
	}
}

deny_reasons contains reason if {
	input.classification.risk_tier in high_risk_tiers
	input.escalation.kill_switch.available != true
	reason := {
		"rule_id": "CARD-NO-KILLSWITCH",
		"message": sprintf(
			"risk_tier '%s' requires an available kill switch (escalation.kill_switch.available)",
			[input.classification.risk_tier],
		),
	}
}

decision := {
	"allow": count(deny_reasons) == 0,
	"rule_ids": [r.rule_id | some r in deny_reasons],
	"reasons": [r.message | some r in deny_reasons],
}

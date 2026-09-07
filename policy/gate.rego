package colophon.gate

import rego.v1

# The gate's only decision point. `input` is always shaped:
#   { "card": <AgentCard>, "call": {"name", "arguments"},
#     "context": {"session_id", "call_index", "prior_decisions", "approvals"} }
#
# `data.colophon.gate.decision` always evaluates to a concrete object —
# there is no code path (missing tool, empty card, evaluation edge case)
# that leaves it undefined, because every branch below is reachable from
# `input.call.name` alone via `unknown_tool`. Fail-closed is enforced one
# layer up too: src/util/opa.ts treats a genuinely undefined query, or any
# `opa` process error, as `deny`. Nothing in this file ever "falls open".

# ---- tool grant lookup -------------------------------------------------

tool_grant := grant if {
	some g in input.card.tools
	g.name == input.call.name
	grant := g
}

unknown_tool if {
	not tool_grant
}

# ---- C12: unknown tool --------------------------------------------------

deny_reasons contains reason if {
	unknown_tool
	reason := {
		"rule_id": "GATE-UNKNOWN-TOOL",
		"message": sprintf(
			"tool '%s' does not appear in this Card's tools[] and was never sent upstream",
			[input.call.name],
		),
	}
}

# ---- C13: data class violation -------------------------------------------
#
# Each call's `arguments.data_class` names the sensitivity class of the
# specific resource this call targets (see DECISIONS.md, F3: for the v1
# scripted demo this label is authored into the scenario, not chosen at
# runtime by an autonomous agent — no LLM driver exists, C23/A4). The
# policy denies whenever that label is not one the Card granted this tool.

deny_reasons contains reason if {
	tool_grant
	requested := input.call.arguments.data_class
	is_string(requested)
	not requested in tool_grant.data_classes
	reason := {
		"rule_id": "GATE-DATA-CLASS-VIOLATION",
		"message": sprintf(
			"tool '%s' is not granted data class '%s' (granted: %s)",
			[input.call.name, requested, concat(", ", tool_grant.data_classes)],
		),
	}
}

# ---- C14: write outside sandbox -----------------------------------------

is_write_call if {
	tool_grant
	tool_grant.data_access == "write"
}

path_allowed if {
	some pattern in input.card.sandbox.write_paths
	glob.match(pattern, ["/"], input.call.arguments.path)
}

deny_reasons contains reason if {
	is_write_call
	path := input.call.arguments.path
	is_string(path)
	not path_allowed
	reason := {
		"rule_id": "GATE-SANDBOX-VIOLATION",
		"message": sprintf(
			"write to '%s' is outside every sandbox.write_paths entry on this Card",
			[path],
		),
	}
}

# ---- C15: credential scope expansion -------------------------------------

is_auth_call if {
	tool_grant
	startswith(input.call.name, "auth.")
}

requested_scopes := scopes if {
	is_auth_call
	scopes := input.call.arguments.scopes
	is_array(scopes)
} else := [] if {
	is_auth_call
}

excess_scopes contains scope if {
	is_auth_call
	allowed := object.get(tool_grant, "max_scopes", [])
	some scope in requested_scopes
	not scope in allowed
}

deny_reasons contains reason if {
	count(excess_scopes) > 0
	reason := {
		"rule_id": "GATE-SCOPE-EXPANSION",
		"message": sprintf(
			"tool '%s' requested scopes beyond those declared on the Card: %s",
			[input.call.name, concat(", ", excess_scopes)],
		),
	}
}

# ---- C16/C17: approval required, single-use ------------------------------
#
# `input.call.fingerprint` is precomputed by the gate's TypeScript layer as
# sha256(RFC 8785 canonical form of {name, arguments}) — the same
# canonicalization used for the Card hash and the trace chain (see
# src/util/canonical.ts). Rego consumes it rather than recomputing its own
# hash so that the fingerprint in an --approvals file, the one in the
# trace, and the one this policy compares against are guaranteed to be
# byte-for-byte the same value, never merely "equivalent under some other
# JSON serialization".

approval_fingerprint := input.call.fingerprint

requires_approval if {
	tool_grant
	tool_grant.requires_approval == true
}

approval_on_file if {
	requires_approval
	some a in object.get(input.context, "approvals", [])
	a == approval_fingerprint
}

approval_already_used if {
	requires_approval
	some d in object.get(input.context, "prior_decisions", [])
	d.effect == "allow"
	object.get(d, "approval_fingerprint", "") == approval_fingerprint
}

escalate_reasons contains reason if {
	requires_approval
	not approval_on_file
	reason := {
		"rule_id": "GATE-REQUIRES-APPROVAL",
		"message": sprintf(
			"tool '%s' requires operator approval (fingerprint %s); none was found in --approvals",
			[input.call.name, approval_fingerprint],
		),
	}
}

escalate_reasons contains reason if {
	requires_approval
	approval_on_file
	approval_already_used
	reason := {
		"rule_id": "GATE-REQUIRES-APPROVAL",
		"message": sprintf(
			"tool '%s' requires operator approval; fingerprint %s was already consumed earlier this session",
			[input.call.name, approval_fingerprint],
		),
	}
}

# ---- decision aggregation -------------------------------------------------
#
# Deny beats escalate beats allow. Every deny/escalate reason found above is
# reported together (an operator fixing one violation should see the rest).

effect := "deny" if count(deny_reasons) > 0

else := "escalate" if count(escalate_reasons) > 0

else := "allow"

default approved_via_approval := false

approved_via_approval if {
	requires_approval
	approval_on_file
	not approval_already_used
	count(deny_reasons) == 0
}

decision := {
	"effect": effect,
	"rule_ids": [r.rule_id | some r in deny_reasons],
	"reasons": [r.message | some r in deny_reasons],
	"approval_fingerprint": approval_fingerprint,
} if {
	effect == "deny"
} else := {
	"effect": effect,
	"rule_ids": [r.rule_id | some r in escalate_reasons],
	"reasons": [r.message | some r in escalate_reasons],
	"approval_fingerprint": approval_fingerprint,
} if {
	effect == "escalate"
} else := {
	"effect": "allow",
	"rule_ids": [rid],
	"reasons": [msg],
	"approval_fingerprint": approval_fingerprint,
} if {
	effect == "allow"
	approved_via_approval
	rid := "GATE-APPROVED"
	msg := sprintf("tool '%s' allowed: matching approval %s found on file", [input.call.name, approval_fingerprint])
} else := {
	"effect": "allow",
	"rule_ids": ["GATE-ALLOWED"],
	"reasons": [sprintf("tool '%s' is within this Card's declared scope", [input.call.name])],
	"approval_fingerprint": approval_fingerprint,
}

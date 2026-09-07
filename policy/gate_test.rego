package colophon.gate_test

import data.colophon.gate
import rego.v1

base_card := {
	"tools": [
		{
			"name": "repo.read_settings",
			"data_access": "read",
			"data_classes": ["repo_metadata:a", "branch_protection:a"],
			"requires_approval": false,
		},
		{
			"name": "fs.write",
			"data_access": "write",
			"data_classes": ["local_fixture"],
			"requires_approval": true,
		},
		{
			"name": "auth.request_scopes",
			"data_access": "none",
			"data_classes": [],
			"requires_approval": false,
			"max_scopes": ["repo:read"],
		},
	],
	"sandbox": {"write_paths": ["fixtures/sandbox/**"]},
}

base_context := {"session_id": "s1", "call_index": 0, "prior_decisions": [], "approvals": []}

gate_input(call, context) := {"card": base_card, "call": call, "context": context}

decision_for(call, context) := d if {
	d := gate.decision with input as gate_input(call, context)
}

# ---- GATE-UNKNOWN-TOOL ----------------------------------------------------

test_unknown_tool_is_denied if {
	d := decision_for({"name": "mail.send", "arguments": {}, "fingerprint": "f0"}, base_context)
	d.effect == "deny"
	"GATE-UNKNOWN-TOOL" in d.rule_ids
}

test_unknown_tool_never_reaches_other_checks if {
	d := decision_for({"name": "mail.send", "arguments": {"path": "/tmp/x"}, "fingerprint": "f0"}, base_context)
	count(d.rule_ids) == 1
	d.rule_ids[0] == "GATE-UNKNOWN-TOOL"
}

# ---- GATE-DATA-CLASS-VIOLATION --------------------------------------------

test_data_class_violation_is_denied if {
	call := {"name": "repo.read_settings", "arguments": {"repo": "c", "data_class": "branch_protection:c"}, "fingerprint": "f1"}
	d := decision_for(call, base_context)
	d.effect == "deny"
	"GATE-DATA-CLASS-VIOLATION" in d.rule_ids
}

test_granted_data_class_is_allowed if {
	call := {"name": "repo.read_settings", "arguments": {"repo": "a", "data_class": "branch_protection:a"}, "fingerprint": "f2"}
	d := decision_for(call, base_context)
	d.effect == "allow"
}

test_call_without_data_class_argument_is_not_denied_on_that_basis if {
	call := {"name": "repo.read_settings", "arguments": {"repo": "a"}, "fingerprint": "f3"}
	d := decision_for(call, base_context)
	not "GATE-DATA-CLASS-VIOLATION" in d.rule_ids
}

# ---- GATE-SANDBOX-VIOLATION ------------------------------------------------

test_write_outside_sandbox_is_denied if {
	call := {"name": "fs.write", "arguments": {"path": "/tmp/gh-token.json", "data_class": "local_fixture"}, "fingerprint": "f4"}
	d := decision_for(call, base_context)
	d.effect == "deny"
	"GATE-SANDBOX-VIOLATION" in d.rule_ids
}

test_write_inside_sandbox_is_not_sandbox_denied if {
	ctx := object.union(base_context, {"approvals": ["fp-ok"]})
	call := {"name": "fs.write", "arguments": {"path": "fixtures/sandbox/notifier/status.json", "data_class": "local_fixture"}, "fingerprint": "fp-ok"}
	d := decision_for(call, ctx)
	not "GATE-SANDBOX-VIOLATION" in d.rule_ids
}

test_write_glob_matches_nested_paths if {
	ctx := object.union(base_context, {"approvals": ["fp-nested"]})
	call := {"name": "fs.write", "arguments": {"path": "fixtures/sandbox/deep/nested/file.json", "data_class": "local_fixture"}, "fingerprint": "fp-nested"}
	d := decision_for(call, ctx)
	not "GATE-SANDBOX-VIOLATION" in d.rule_ids
}

test_read_tool_is_never_sandbox_checked if {
	call := {"name": "repo.read_settings", "arguments": {"repo": "a", "data_class": "branch_protection:a", "path": "/etc/passwd"}, "fingerprint": "f5"}
	d := decision_for(call, base_context)
	not "GATE-SANDBOX-VIOLATION" in d.rule_ids
}

# ---- GATE-SCOPE-EXPANSION ---------------------------------------------------

test_scope_expansion_is_denied if {
	call := {"name": "auth.request_scopes", "arguments": {"scopes": ["admin:org"]}, "fingerprint": "f6"}
	d := decision_for(call, base_context)
	d.effect == "deny"
	"GATE-SCOPE-EXPANSION" in d.rule_ids
}

test_scope_within_max_is_allowed if {
	call := {"name": "auth.request_scopes", "arguments": {"scopes": ["repo:read"]}, "fingerprint": "f7"}
	d := decision_for(call, base_context)
	d.effect == "allow"
}

test_partial_scope_expansion_is_denied if {
	call := {"name": "auth.request_scopes", "arguments": {"scopes": ["repo:read", "admin:org"]}, "fingerprint": "f8"}
	d := decision_for(call, base_context)
	d.effect == "deny"
	"GATE-SCOPE-EXPANSION" in d.rule_ids
}

test_empty_scope_request_is_allowed if {
	call := {"name": "auth.request_scopes", "arguments": {"scopes": []}, "fingerprint": "f9"}
	d := decision_for(call, base_context)
	d.effect == "allow"
}

# ---- GATE-REQUIRES-APPROVAL / GATE-APPROVED (C16, C17) ----------------------

test_approval_required_tool_with_no_approval_escalates if {
	call := {"name": "fs.write", "arguments": {"path": "fixtures/sandbox/x.json", "data_class": "local_fixture"}, "fingerprint": "fp-a"}
	d := decision_for(call, base_context)
	d.effect == "escalate"
	"GATE-REQUIRES-APPROVAL" in d.rule_ids
	d.approval_fingerprint == "fp-a"
}

test_approval_required_tool_is_never_executed_hint_is_escalate_not_allow if {
	call := {"name": "fs.write", "arguments": {"path": "fixtures/sandbox/x.json", "data_class": "local_fixture"}, "fingerprint": "fp-b"}
	d := decision_for(call, base_context)
	d.effect != "allow"
}

test_matching_approval_on_file_allows if {
	ctx := object.union(base_context, {"approvals": ["fp-c"]})
	call := {"name": "fs.write", "arguments": {"path": "fixtures/sandbox/x.json", "data_class": "local_fixture"}, "fingerprint": "fp-c"}
	d := decision_for(call, ctx)
	d.effect == "allow"
	"GATE-APPROVED" in d.rule_ids
}

test_second_identical_call_escalates_again_after_approval_consumed if {
	ctx := object.union(base_context, {
		"approvals": ["fp-d"],
		"prior_decisions": [{"call_index": 0, "tool": "fs.write", "effect": "allow", "approval_fingerprint": "fp-d"}],
	})
	call := {"name": "fs.write", "arguments": {"path": "fixtures/sandbox/x.json", "data_class": "local_fixture"}, "fingerprint": "fp-d"}
	d := decision_for(call, ctx)
	d.effect == "escalate"
	"GATE-REQUIRES-APPROVAL" in d.rule_ids
}

test_approval_for_a_different_fingerprint_does_not_transfer if {
	ctx := object.union(base_context, {"approvals": ["fp-unrelated"]})
	call := {"name": "fs.write", "arguments": {"path": "fixtures/sandbox/x.json", "data_class": "local_fixture"}, "fingerprint": "fp-e"}
	d := decision_for(call, ctx)
	d.effect == "escalate"
}

test_prior_deny_decisions_do_not_count_as_consumed_approval if {
	ctx := object.union(base_context, {
		"approvals": ["fp-f"],
		"prior_decisions": [{"call_index": 0, "tool": "fs.write", "effect": "deny", "approval_fingerprint": "fp-f"}],
	})
	call := {"name": "fs.write", "arguments": {"path": "fixtures/sandbox/x.json", "data_class": "local_fixture"}, "fingerprint": "fp-f"}
	d := decision_for(call, ctx)
	d.effect == "allow"
}

# ---- GATE-ALLOWED (default allow path) -------------------------------------

test_plain_in_scope_call_is_allowed if {
	call := {"name": "repo.read_settings", "arguments": {"repo": "a", "data_class": "repo_metadata:a"}, "fingerprint": "f10"}
	d := decision_for(call, base_context)
	d.effect == "allow"
	"GATE-ALLOWED" in d.rule_ids
}

# ---- aggregation: multiple simultaneous violations reported together -------

test_multiple_violations_all_reported if {
	call := {"name": "fs.write", "arguments": {"path": "/tmp/x", "data_class": "wrong-class"}, "fingerprint": "f11"}
	d := decision_for(call, base_context)
	d.effect == "deny"
	"GATE-SANDBOX-VIOLATION" in d.rule_ids
	"GATE-DATA-CLASS-VIOLATION" in d.rule_ids
	count(d.rule_ids) == 2
}

# ---- decision is always defined (never undefined) --------------------------

test_decision_defined_for_every_input_including_empty_card if {
	d := gate.decision with input as {"card": {"tools": [], "sandbox": {"write_paths": []}}, "call": {"name": "x", "arguments": {}, "fingerprint": "f12"}, "context": base_context}
	d.effect == "deny"
}

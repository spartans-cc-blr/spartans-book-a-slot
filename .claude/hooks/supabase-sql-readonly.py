#!/usr/bin/env python3
"""PreToolUse hook for mcp__Supabase__execute_sql.

Auto-allows a query only when it is a single, read-only statement
(SELECT / WITH ... SELECT / EXPLAIN / SHOW). Anything else (DML, DDL,
multi-statement, unparseable) returns "ask" so the user must approve.
Conservative by design: when unsure, ask.
"""
import json, re, sys

def decide(decision, reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": decision,
        "permissionDecisionReason": reason}}))
    sys.exit(0)

try:
    q = json.load(sys.stdin).get("tool_input", {}).get("query", "")
except Exception:
    decide("ask", "could not parse hook input")
if not isinstance(q, str) or not q.strip():
    decide("ask", "empty query")

s = re.sub(r"/\*.*?\*/", " ", q, flags=re.S)          # block comments
s = re.sub(r"--[^\n]*", " ", s)                        # line comments
s = re.sub(r"\$([A-Za-z_]*)\$.*?\$\1\$", "''", s, flags=re.S)  # dollar-quoted
s = re.sub(r"'(?:[^']|'')*'", "''", s)                 # string literals
s = re.sub(r'"(?:[^"]|"")*"', '""', s)                 # quoted identifiers
s = s.strip().rstrip(";").strip()

if ";" in s:
    decide("ask", "multiple statements need approval")
if not re.match(r"(?is)^\s*\(*\s*(select|with|explain|show|values|table)\b", s):
    decide("ask", "not a read-only statement")
if re.match(r"(?is)^\s*explain\b.*\banalyze\b", s):
    decide("ask", "EXPLAIN ANALYZE executes the statement")

BAD = (r"insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|"
       r"merge|vacuum|reindex|cluster|refresh|comment|lock|listen|notify|set|reset|"
       r"into|for\s+(update|share|no\s+key\s+update|key\s+share)|"
       r"pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|lo_unlink|"
       r"pg_terminate_backend|pg_cancel_backend|pg_sleep|nextval|setval|set_config|"
       r"dblink\w*|pg_reload_conf|pg_advisory\w*")
if re.search(r"(?i)\b(" + BAD + r")\b", s):
    decide("ask", "contains a keyword/function that may write or have side effects")

decide("allow", "read-only single statement")

#!/usr/bin/env python3
"""Authorization/integrity checks for the presence/receipt/chat/ad migration.

Run after tests_presence_receipts_chat_ads_fixture.sql and the canonical migration
have been applied to the disposable PostgreSQL database. Connection values come
from standard PG* environment variables.
"""
from __future__ import annotations

import os
import subprocess
import sys

ENV = os.environ.copy()
PSQL = ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-q"]
passed = 0


def sql(statement: str, *, email: str | None = None, role: str = "authenticated", ok: bool = True) -> str:
    prefix = ""
    if role:
        prefix += f"set role {role};\n"
    if email is not None:
        escaped = email.replace("'", "''")
        prefix += f"set request.jwt.claim.email = '{escaped}';\n"
    proc = subprocess.run(PSQL + ["-c", prefix + statement], env=ENV, text=True, capture_output=True)
    if ok and proc.returncode != 0:
        raise AssertionError(f"SQL unexpectedly failed:\n{statement}\n{proc.stderr}")
    if not ok and proc.returncode == 0:
        raise AssertionError(f"SQL unexpectedly succeeded:\n{statement}\n{proc.stdout}")
    return proc.stdout.strip()


def check(name: str, condition: bool, detail: str = "") -> None:
    global passed
    if not condition:
        raise AssertionError(f"{name} failed{': ' + detail if detail else ''}")
    passed += 1
    print(f"ok {passed:02d} - {name}")


# Payment visibility is group-bound.
check("approved member can read group payments", sql("select count(*) from public.payments;", email="member1@example.com") == "4")
check("pending outsider cannot read group payments", sql("select count(*) from public.payments;", email="outsider@example.com") == "0")

# Direct messages: recipient can mark read, but only sender can delete.
sql("delete from public.messages where id='dm1';", email="member2@example.com")
check("DM recipient cannot delete sender message", sql("select count(*) from public.messages where id='dm1';", role="") == "1")
sql("update public.messages set read=true where id='dm1';", email="member2@example.com")
check("DM recipient may mark message read", sql("select read from public.messages where id='dm1';", role="") == "t")
sql("update public.messages set body='tampered' where id='dm1';", email="member2@example.com", ok=False)
check("DM recipient cannot edit body", sql("select body from public.messages where id='dm1';", role="") == "private hello")
sql("delete from public.messages where id='dm1';", email="member1@example.com")
check("DM sender can delete own message", sql("select count(*) from public.messages where id='dm1';", role="") == "0")

# Group chat: member-own + chat-open; group admin can moderate any ordinary row.
sql("delete from public.group_messages where id='gm-member1';", email="member1@example.com")
check("member can delete own group message while chat open", sql("select count(*) from public.group_messages where id='gm-member1';", role="") == "0")
sql("delete from public.group_messages where id='gm-member2';", email="member1@example.com")
check("member cannot delete another member's message", sql("select count(*) from public.group_messages where id='gm-member2';", role="") == "1")
sql("update public.groups set chat_open=false where id='g1';", role="")
sql("delete from public.group_messages where id='gm-member2';", email="member2@example.com")
check("member cannot delete own group message while chat locked", sql("select count(*) from public.group_messages where id='gm-member2';", role="") == "1")
sql("update public.groups set chat_open=true where id='g1';", role="")
sql("delete from public.group_messages where id='gm-member2';", email="admin@example.com")
check("group admin can delete any ordinary group message", sql("select count(*) from public.group_messages where id='gm-member2';", role="") == "0")
sql("delete from public.group_messages where id='receipt-approved-own';", email="admin@example.com")
check("even admin cannot directly orphan a receipt chat row", sql("select count(*) from public.group_messages where id='receipt-approved-own';", role="") == "1")

# Receipt RPC: own non-approved only for members; admin can delete any group receipt.
sql("select public.delete_group_payment_receipt('approved-own');", email="member1@example.com", ok=False)
check("member cannot delete approved receipt", sql("select count(*) from public.payments where id='approved-own';", role="") == "1")
sql("select public.delete_group_payment_receipt('other-pending');", email="member1@example.com", ok=False)
check("member cannot delete another member's receipt", sql("select count(*) from public.payments where id='other-pending';", role="") == "1")
result = sql("select public.delete_group_payment_receipt('pending-own')->>'deleted';", email="member1@example.com")
check("member can delete own pending receipt through RPC", result == "true")
check("member receipt RPC removes linked chat atomically", sql("select count(*) from public.group_messages where payment_id='pending-own';", role="") == "0")
result = sql("select public.delete_group_payment_receipt('approved-admin-delete')->>'approved_credit_removed';", email="admin@example.com")
check("group admin can delete approved group receipt", result == "true")
check("approved admin deletion removes payment and linked chat", sql("select (select count(*) from public.payments where id='approved-admin-delete') || ':' || (select count(*) from public.group_messages where payment_id='approved-admin-delete');", role="") == "0:0")
check("approved deletion notifies credited member", sql("select count(*) from public.notifications where type='payment_credit_removed' and user_email='member1@example.com';", role="") == "1")
sql("update public.payments set amount=9999, status='approved' where id='other-pending';", email="admin@example.com", ok=False)
check("admin review cannot alter receipt evidence/value", sql("select amount::text || ':' || status from public.payments where id='other-pending';", role="") == "1000:pending")
sql("update public.payments set weeks=null, status='approved' where id='other-pending';", email="admin@example.com", ok=False)
check("admin review cannot erase credited weeks", sql("select weeks::text || ':' || status from public.payments where id='other-pending';", role="") == "1:pending")

# Presence is JWT-bound, table-private, and listable only through the owner RPC.
check("authenticated heartbeat resolves JWT profile", sql("select public.touch_user_presence();", email="member1@example.com") == "t")
check("ordinary user sees no raw presence rows", sql("select count(*) from public.user_presence;", email="member1@example.com") == "0")
sql("select public.get_owner_online_users();", email="member1@example.com", ok=False)
check("ordinary user cannot call owner online-list RPC", True)
owner_rows = sql("select email from public.get_owner_online_users();", email="vipadarapper@gmail.com")
check("owner online list returns active user", owner_rows == "member1@example.com")
sql("select public.touch_user_presence();", role="anon", ok=False)
check("anonymous caller cannot execute heartbeat", True)

# Ad analytics: anonymous tracking remains possible only through the validating RPC.
check("valid guest placement event records", sql("select public.record_ad_event('ad-active','view',0,'g:abcdefgh');", role="anon") == "t")
check("invalid guest token is rejected without write", sql("select public.record_ad_event('ad-active','view',0,'bad');", role="anon") == "f")
check("unapproved ad event is rejected", sql("select public.record_ad_event('ad-pending','view',0,'g:abcdefgh');", role="anon") == "f")
sql("insert into public.ad_events(ad_id,kind) values ('ad-active','view');", role="anon", ok=False)
check("anonymous clients cannot write ad_events directly", True)
check("signed-in non-advertiser event records", sql("select public.record_ad_event('ad-active','click',0,null);", email="member1@example.com") == "t")
check("advertiser self-event is excluded", sql("select public.record_ad_event('ad-active','view',0,null);", email="advertiser@example.com") == "f")
check("stored viewers are pseudonymous", sql("select bool_and(viewer ~ '^[ag]:[0-9a-f]{64}$') from public.ad_events;", role="") == "t")
sql("select count(*) from public.ad_events;", email="member1@example.com", ok=False)
check("authenticated clients cannot read raw ad_events", True)
sql("select count(*) from public.get_ad_analytics('ad-active');", email="advertiser@example.com", ok=False)
check("advertiser cannot open analytics before ad ends", True)
sql("insert into public.ad_events(ad_id,kind,media_index,viewer) values ('ad-ended','view',0,'old-email@example.com'),('ad-ended','view',0,null);", role="")
ended = sql("select count(*) || ':' || count(viewer) from public.get_ad_analytics('ad-ended');", email="advertiser@example.com")
check("advertiser can read ended-run analytics with legacy identities hidden", ended == "2:0")
sql("select count(*) from public.get_ad_analytics('ad-ended');", email="outsider@example.com", ok=False)
check("unrelated user cannot read another advertiser's analytics", True)
check("owner can read active ad analytics", sql("select count(*) from public.get_ad_analytics('ad-active');", email="vipadarapper@gmail.com") == "2")
sql("select count(*) from public.get_ad_analytics('ad-active');", role="anon", ok=False)
check("anonymous caller cannot read analytics", True)

print(f"PASS: {passed} authorization/integrity checks")

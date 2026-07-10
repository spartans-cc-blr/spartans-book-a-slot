-- Migration: 043_squad_audit_correction_actions
-- Adds 'role_corrected' and 'tournament_corrected' to squad_audit.action for the
-- Past Matches — Squad History & Role Correction feature (Phase 1). GC/admin
-- corrections to historical squad roles and tournament assignment now get an
-- audit trail, same as submit/approve/return/announce.

alter table squad_audit drop constraint squad_audit_action_check;

alter table squad_audit add constraint squad_audit_action_check
  check (action in ('submitted', 'approved', 'returned', 'announced', 'role_corrected', 'tournament_corrected'));

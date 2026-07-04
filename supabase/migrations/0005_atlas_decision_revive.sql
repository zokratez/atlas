alter table atlas.decisions
  drop constraint if exists decisions_decision_check;

alter table atlas.decisions
  add constraint decisions_decision_check
  check (decision in ('approve','kill','edit','revive'));

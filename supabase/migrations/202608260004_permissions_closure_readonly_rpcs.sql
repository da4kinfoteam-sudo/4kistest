begin;

-- These evaluators are read-only and are used by the centralized settings
-- preview and verification tools.  Mutation remains confined to the
-- transition/override commands and the guarded table triggers.
grant execute on function public.dcf_period_allowed(text, text, text, text, text, text) to authenticated;
grant execute on function public.dcf_status_action_allowed(text, text, text, text) to authenticated;
grant execute on function public.dcf_transition_allowed(text, text, text) to authenticated;

commit;

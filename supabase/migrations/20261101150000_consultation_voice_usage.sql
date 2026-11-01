-- Voice uses the common consultation/ledger migration; record BOTH paid stages.
alter table public.style_provider_usage drop constraint style_provider_usage_action_check;
alter table public.style_provider_usage add constraint style_provider_usage_action_check
check(action in ('plan','image','editorial','dialogue','composite','transcription','voice'));

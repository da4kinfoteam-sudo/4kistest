alter table public.subprojects
    add column if not exists "actualMaleBeneficiaries" integer,
    add column if not exists "actualFemaleBeneficiaries" integer,
    add column if not exists "actualFourPsBeneficiaries" integer;

alter table public.subprojects
    drop constraint if exists subprojects_actual_male_beneficiaries_nonnegative,
    drop constraint if exists subprojects_actual_female_beneficiaries_nonnegative,
    drop constraint if exists subprojects_actual_four_ps_beneficiaries_nonnegative;

alter table public.subprojects
    add constraint subprojects_actual_male_beneficiaries_nonnegative
        check ("actualMaleBeneficiaries" is null or "actualMaleBeneficiaries" >= 0),
    add constraint subprojects_actual_female_beneficiaries_nonnegative
        check ("actualFemaleBeneficiaries" is null or "actualFemaleBeneficiaries" >= 0),
    add constraint subprojects_actual_four_ps_beneficiaries_nonnegative
        check ("actualFourPsBeneficiaries" is null or "actualFourPsBeneficiaries" >= 0);

comment on column public.subprojects."actualMaleBeneficiaries" is
    'Nullable parent-level count of actual male individual beneficiaries. Null means not reported.';
comment on column public.subprojects."actualFemaleBeneficiaries" is
    'Nullable parent-level count of actual female individual beneficiaries. Null means not reported.';
comment on column public.subprojects."actualFourPsBeneficiaries" is
    'Nullable parent-level count of actual 4Ps beneficiaries. Null means not reported.';

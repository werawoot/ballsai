# BallDoenSai Domain Language

BallDoenSai is a Digital Sports Identity platform. These terms keep athlete data,
verified competition data, and guardian privacy rules precise across Web and Mobile.

## Identity

**Athlete Identity**:
The person-level identity owned by one authenticated athlete account. It holds personal
and privacy data that must not be duplicated for every sport.
_Avoid_: Player profile, sport profile

**Sport Profile**:
One athlete's identity within one sport, identified by the pair of Athlete Identity and
sport slug. It owns sport-specific presentation and visibility, never combined ratings.
_Avoid_: Secondary account, universal player card

**STARTER Profile**:
A Sport Profile with no verified ranking record. It can show self-entered identity but
never a default Rating, Ranking, XP, or performance value.
_Avoid_: New player rating, zero-performance card

## Verification

**Guardian Verification Request**:
A private, expiring request sent to a guardian's verified contact channel. It is not
guardian consent and may be cancelled, expired, or verified.
_Avoid_: Guardian checkbox, provisional consent

**Guardian Consent**:
An auditable, active record created only after a guardian completes verification. It
permits public disclosure for an under-20 athlete; it is revocable.
_Avoid_: Athlete attestation, onboarding consent flag

**Performance-verified**:
Data derived from an organizer-confirmed match result through the rating integrity
chain. It is distinct from self-entered and coach-verified data.
_Avoid_: Estimated performance, default value

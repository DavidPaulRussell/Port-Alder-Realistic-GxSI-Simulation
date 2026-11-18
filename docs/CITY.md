# Port Alder: how the city works

Port Alder is a fictional city on Alder Bay, in Washington State, modelled on Everett: about 12,700 citizens who stand for Everett's 114,700 people. It runs one
day per epoch on a real calendar from Thursday 1 January 2026. Every person, household, business,
bank and public body keeps integer-cent double-entry books. The books are audited after every day.
The same configuration and the same list of interventions always produce the same city, bit for bit,
and the same chain of epoch digests.

"Sentient" here is a design word, not a claim of consciousness. It means that every agent carries
needs, a mood, a personality, memories and expectations, updates them from what happens to it, and
decides from them. Trust between people and institutions runs on the Simmy rails trust law.

## Agents

| Kind | Count at the start | Mind |
|---|---|---|
| Citizen | about 12,700 (room for 16,384) | needs, mood, stress, personality, 8 memories, expectations, 4 trust relationships, habits, friends |
| Household | about 5,600 (room for 8,192) | budget habits, pantry, home, bank, debts, tax filing |
| Firm | about 230 in 21 sectors (room for 2,048) | the owner's personality, confidence, sales memory, expected demand, trust in workers and banks |
| Bank | 3 (two banks and a credit union) | fear of losses, risk appetite, expected default rate by segment, trust in each borrower |
| City of Port Alder | 1 | budget rules, reserve target, service levels, levy proposals |
| Port Alder School District | 1 | per-pupil funding, teachers, enrichment levy |
| State of Washington | 1 | collects state taxes and premiums, pays unemployment and paid-leave benefits, funds schools |
| United States government | 1 | collects payroll and income taxes, pays Social Security |
| Federal Reserve | 1 | policy rate, reserves, interest on reserves, discount window |
| Rest of the world | 1 | sells imports, buys exports, sends visitors, holds residents' investment funds |

### A citizen's mind

Scales run from 0 to 1000 unless stated.

- **Personality**: openness, conscientiousness, extraversion, agreeableness and neuroticism (4 bits
  each), plus risk appetite, thrift and civic duty. Children inherit a mix of their parents' traits
  with mutation.
- **Needs**: food, rest, health, shelter, social, purpose, leisure and money. Each decays daily and is
  met by what the citizen does: eating from the household pantry, sleeping, care, a secure home,
  time with family and friends, work or school, recreation, and savings.
- **Mood**: valence (-1000..1000) is the weighted gap between needs and their expected levels, plus
  the affect of recent memories, plus contagion from the household and friends. Stress builds when
  needs stay unmet, faster for neurotic people, and eases with rest and leisure.
- **Memory**: 8 episodic slots (what happened, how it felt, who did it, when). New memories replace
  the least salient. Salience fades by an eighth each month, the E3 forgetting of the Simmy rails.
  Memories steer choices: a citizen laid off by a firm does not apply there again for a year.
- **Reference prices**: what the citizen last paid in each spending category. A rise above the
  reference hurts 9/4 times as much as an equal fall pleases (loss aversion).
- **Expectations**: inflation, income growth, rent growth and job security. Each moves toward what the
  citizen observes at a rate set by personality (openness and neuroticism learn faster).
- **Trust**: four Simmy rails relationships (employer, landlord or mortgage bank, bank, city), each
  with Beta evidence, a reliability register and a level: suspended, restricted, nominal or
  expanded. A paycheck on time is a commit; a cut in hours, a denied raise or a rent rise above
  expectation is a denial. Silence forgets toward the prior. At "suspended" a citizen job-hunts and
  quits, moves out, moves the account to another bank, or votes against the city's levy.

### Decisions

- Each workday a worker goes to work unless ill. Paid sick leave accrues at 1 hour per 40 worked; a
  worker without leave or savings often goes in ill.
- Each day a household spends by category. The budget follows income expectations, savings, job
  security (precautionary saving) and mood. The shop is chosen from habit, price against the
  reference, distance, street life and trust, with openness deciding how often to try somewhere new.
- The unemployed, and workers whose trust in the employer has fallen, apply for openings. Each firm
  admits applicants to its openings with the E1 K-slot rule.
- Renters decide at renewal or on a rent-rise notice whether to stay. Savers with enough for a deposit
  and income for the payments apply for a mortgage and buy.
- People pair up through their friends, have children, retire, move out of their parents' homes,
  move away from the city when trust and prospects fall, and arrive when jobs go unfilled.
- Every November residents vote on the city's levy measure, by their trust in the city, their money
  stress and what they expect it to buy.

### Firms

Each firm has an owner (a citizen whose personality becomes the firm's temperament), a sector, a
place, staff, a price, unit costs, inventory, quality and a reputation (Beta evidence from customers).
Daily it opens for its hours, sells, and reorders stock. Weekly it reviews prices (markup moved by
inventory and by demand against expectation, smoothed by agreeable owners because customers punish
sudden rises) and staffing. It hires through openings, cuts hours, and lays off after sustained losses.
It borrows on a credit line, invests when busy and confident, and closes when it is insolvent and the
bank refuses credit. Entrepreneurs open new firms where demand is unmet and street life is strong.

### Banks

Banks hold reserves at the Federal Reserve, make loans (mortgages, business, auto, cards), hold bonds,
and take deposits. A loan creates a deposit; a repayment destroys one. Payments between banks move
reserves. Each day applications are admitted to the bank's lending slots by the E1 rule; scores come
from the borrower's trust level, debt-to-income, collateral and the bank's fear. Fear rises with
charge-offs and fades. Rates follow the policy rate plus spreads that widen with fear. Loans 90 days
past due are charged off or foreclosed.

### The city

The City of Port Alder adopts a balanced budget each December with a reserve target, employs police,
fire, parks, road and transit staff, runs the bus routes and the municipal light and water utility,
contracts road repairs to local builders, and proposes a levy lid lift when revenue falls short and
trust allows. The school district employs teachers and is funded by the state per pupil and by its
enrichment levy.

## The street-life law (XPU)

`port.alder.streetlife` is an LCUF-A/0.3 program in Z/2^20 on the ByteFoundry XPU. Its 8 lanes are
home life, shopping, dining, work, nightlife, parks and play, transit crowds and disorder. Each day the
citizens' activities set bit 0 of a lane where enough people did that thing in a cell; police patrols
clear disorder. The XPU then runs the day's Life rule (weekday, weekend or holiday, by season); bits
1-4 hold the live neighbours a generation ago and bits 5-19 three earlier generations, so the field
remembers where life happens. Street life raises footfall for shops and restaurants, lowers perceived
danger, feeds land values, and fills the 3D streets with people.

## Money

See [FINANCE.md](FINANCE.md): the chart of accounts, every posting, the audits, and the 2026 Washington
and United States rules with their sources.

## Determinism

All simulation state is integers in typed arrays. Chance comes from a 32-bit hash of (seed, salt,
epoch, id); there is no global random state and no floating-point arithmetic in the state. Each epoch's
digest is SHA-256 over the canonical JSON of the epoch number, the previous digest, the law's SHA-256,
the street-life frames, the SHA-256 of every table and of the ledger. A save (PLUME-CITY/1) holds the
configuration, the interventions and the digests; loading it replays the city and checks every digest.

## Further

- `docs/VARIABLES.md`: every field of every table, who decides it and by which laws (no variable is procedural).
- `docs/LAWS.md`: the law book, from the continuum images with a faithful linear form, and where each law is used.
- `README.md`: the four layers, Social Information Numbers, welfare and the ballot, how to run and test the city.

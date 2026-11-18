# The umbrella of sentient computing

No variable in Port Alder is procedural. Every field of every table is decided by agents, or is an aggregate or a law of their states. Real-world data and law enter only as history (the founding census, which closes when genesis ends) and as the statutes that bind what agents may decide. `test/umbrella.test.mjs` checks that every field below is named once, that every law cited is in the law book (docs/LAWS.md), that nothing draws a random number or reads a clock into the state, and that the census refuses to answer after genesis.

## People

| Fields | Decided by | Laws |
|---|---|---|
| `alive` `serial` `hh` `next` `born` `bday` `sex` `given` `family` `sin` | birth (a mother's fertility charge comes due; the sex of each birth by the city's rotation), death (the body's frailty is spent), the registry; households joined by people's own moves and partnerships | 12.42, 75.27, 75.19, 57.9 |
| `traits` | inheritance from the parents (breeder's equation) at birth; the founding census before | 54.47, 12.42 |
| `edu` `skill` `occ` `school` | the person's schooling decisions at birthdays (ability against difficulty), the trade they choose, the skill work builds; school places by catchment | 73.31, 57.22 |
| `status` `emp` `wage` `sal` `hours` `shift` `hired` `lastEmp` `laidAt` | employers (E1 admission of applicants, pay reviews, layoffs by seniority) and the person (search charge, quitting, retiring); Washington's minimum wage binds | 57.9, 69.51, 59.44 |
| `need` `val` `stress` `health` `sick` `sickBal` `leaveTo` | the mind's needs relaxing toward what the day gave, mood and stress from them; the body; paid sick leave accrues by Washington law (1 hour per 40 worked) | 11.2, 16.42, 35.16 |
| `expInf` `expInc` `expRent` `jobSec` | the person's expectations, learnt from what they see (prices, pay, rents, layoffs around them) | 59.44, 13.5 |
| `memK` `memV` `memW` `memD` `ref` | memories of what happened to the person (with its feeling and its fading); reference prices felt on a log scale | 35.16, 73.2 |
| `teA` `teB` `teRel` `teLv` `teLife` `teRev` `tlA` `tlB` `tlRel` `tlLv` `tlLife` `tlRev` `tbA` `tbB` `tbRel` `tbLv` `tbLife` `tbRev` `tcA` `tcB` `tcRel` `tcLv` `tcLife` `tcRev` `eCo` `eDe` `lCo` `lDe` `bCo` `bDe` `cCo` `cDe` | the Simmy rails trust law for each relationship (employer, landlord, bank, city), fed by the cooperations and defections the person lives through | 13.5, 9.3 |
| `friend` `partner` `fw` `acq` `acqW` `cent` | the people themselves: the week's company (homophily), friendships that strengthen when friends meet, partnerships of close friends; centrality is a measure of that network | 57.22, 74.6, 77.19 |
| `ytdW` `ytdT` `ytdUI` `ytdOT` `ytdFIT` `ytdSS` `ytdMed` `empW` `empWnt` `qw` `wk` `preg` `pot` `ptips` `psick` | employers' payroll on paydays: hours worked, overtime, tips, withholding and FICA by federal and state law; aggregates of the timecards | 53.32, 4.31, 15.7 |
| `ui` `uiLeft` `uiWait` `uiEmp` | the person's claim after a layoff; ESD's weekly benefit from the base period (Washington law) | 4.31 |
| `ss` `pen` | the person's decision to retire and claim; Social Security's benefit and each year's COLA; SSDI, a former employer's pension or annuity, and regular support from family or a former partner, read by the founding census | 12.42, 68.59 |
| `mode` `today` `visit` `vtime` `away` `awayH` | the person's day: work, school, errands and venues by their needs and the hours; out-commuters hired by employers beyond the city | 57.9, 58.36 |
| `frail` `frailQ` `cumH` `wish` `gest` | the body: a frailty endowment spent by the Gompertz-Makeham hazard; a woman's fertility charge at her age's rate and her circumstances; nine months' gestation | 75.19, 75.27, 57.9, 56.23 |
| `ah` `ahRenew` `ssi` `abd` `abawd` `dis` | the household's applications and renewals (paperwork by ability), HCA, SSA and DSHS rules; disability read at the founding and then following the body | 73.31, 13.5, 57.9 |
| `mh` `mhDays` `mhEp` `mhTx` `mhNext` `mhYtd` `crisis` `forgone` `visits` `hosp` | distress built from stress, isolation and purpose; the person's decision to seek care and the clinicians' and counsellors' capacity (waits by Erlang C) | 57.9, 18.20, 18.16 |
| `dose` `inf` `infDay` `immune` `vax` `immunity` `flare` `imp` | contagion through the contacts of the day (households, workplaces, schools, venues, buses); immunity read at the founding; vaccination and care decisions | 55.16, 55.18, 38.13, 36.48, 57.9, 12.42 |
| `urge` `search` | charges that integrate a rate with no leak (an urge's phase from the founding census) or with a leak (a job search) | 57.9, 12.42 |

## Households

| Fields | Decided by | Laws |
|---|---|---|
| `alive` `head` `first` `size` `kids` `adults` `joint` | the people: births, deaths, partnerships, children leaving home, arrivals and departures | 75.27, 75.19 |
| `home` `tenure` `landlord` `rent` `lease` `notice` `noticeAt` `moved` | renters' and buyers' searches, landlords' rent notices within Washington's rent cap (HB 1217), sellers, banks' admissions | 71.3, 76.39, 13.5 |
| `mort` `auto` `card` `cardLim` `late` | banks: E1 admission by credit score and trust; the household's borrowing and repayments; delinquency reported to the bank | 14.58, 71.3, 68.59 |
| `cars` `carBought` `carD` `fuel` | the household's purchase of a car on credit; its wear by years and miles; the fuel it burns | 65.18, 68.1 |
| `pantry` `spend` | the household's shopping: energy needs, spoilage, reorder when the pantry runs low, budgets by its shares | 51.38, 42.13, 68.1, 69.11 |
| `fileOn` `owed` | the household's decision when to file; what the IRS rules make it owe or refund | 4.31 |
| `inc` `exp` | aggregates of the members' states (pay at their hours, benefits), refreshed each month | 4.31, 15.7 |
| `kbA` `kbB` `kbRel` `kbLv` `kbLife` `kbRev` | the bank's trust in the household (the rails law on its repayments) | 13.5, 9.3 |
| `evictAt` `rArr` `rMo` `lPat` `ntc` `ntcs` `udStay` `udLow` `lmp` `lmpAt` `sell` | rent owed and the landlord's patience charge; the 14-day notice and the unlawful detainer (RCW 59.12.030, 59.18.410); the court's payment plan and stay of the writ for a tenant with fewer than three notices in a year who can pay a month's rent (RCW 59.18.410(3)), with counsel for the indigent (RCW 59.18.640); for a tenant the court finds low-income, the Landlord Mitigation Program's payment of the judgment and the tenant's repayment of it to the state (RCW 59.18.410(3)(e), 43.31.605(1)(c)); an owner behind on the mortgage deciding to sell | 57.9 |
| `util` `cover` `demoAt` | the city utility's bills; the employer's offer of a health plan; the owner's decision to redevelop | 72.22 |
| `progs` `snap` `ebt` `snapRenew` `tanf` `tanfMonths` `wic` `sun` `copay` `voucher` `vWait` `hap` `wftcY` `fresh` `mbits` `mRent` `apply` | the household's decisions to apply (a charge of its reasons and stakes, a belief updated by what it has been through, paperwork by ability) and the programs' rules (USDA, DSHS, HCA, HUD, DCYF); the city's additions as its voters passed them | 57.9, 13.5, 73.31 |
| `mkt` `mktPrem` | the household's decision to buy a Cascade Care plan: its share after the premium tax credit (the 2026 applicable percentages) against what its means, health, age, temper and children make it willing to pay | 72.22, 57.9 |
| `plan` `leave` | the household's decision to leave: a year here against a year elsewhere over its horizon, the cost of going by age, a charge with its founding phase | 61.34, 75.41, 75.44, 57.9, 60.7 |
| `env` `prep` `ins` `prem` `heat` `kwh` | the household's exposure to noise and damp, its preparedness and insurance decisions; the employer plan's premium from the pool's claims; heating and power use | 31.17, 46.11, 72.22, 26.51 |
| `hurge` | household urges (to buy a home, to switch banks, to file), each a charge with its founding phase | 57.9, 12.42 |

## Firms

| Fields | Decided by | Laws |
|---|---|---|
| `alive` `sector` `owner` `space` `nspace` `name` `founded` | the founding census, then a resident's decision to start a business (unmet custom, savings, appetite for risk); closure by the owner or the books | 12.42, 68.59 |
| `mkt` `short` `export` | each exporter's own customers beyond the city, at the nation's (or the county's) demand, by the price elasticity; won by a busy owner's appetite for risk, lost when turned away | 69.7, 12.42 |
| `price` `cost` `lastPrice` `boClass` | the owner's pricing: the markup the elasticity allows (rivals raise it), the trend of sales, the year's books, expected inflation | 69.23, 70.2, 20.20 |
| `inv` `transit` `arrive` `supplies` `quality` `capex` | the owner's restocking and investment decisions; quality from care and investment | 68.1, 68.59 |
| `crA` `crB` `crRel` `crLv` `crLife` `crRev` `kbA` `kbB` `kbRel` `kbLv` `kbLife` `kbRev` `crCo` `crDe` | customers' and the bank's trust in the firm (the rails law on their dealings) | 13.5, 9.3 |
| `staff` `want` `open` `offer` `unfilled` | the owner's staffing from expected custom, layoffs when distressed or short of cash; hiring by E1 admission | 57.9, 59.44 |
| `conf` `expD` `sold` `lost` `capa` `qh` `mem` `wk` | the owner's expectations from what came; sales from customers' choices (distance, street life, reputation, quality, price, taste); capacity from the staff present | 59.44, 60.7, 70.2 |
| `mRev` `ytdGross` `lyGross` `lyCost` `taxDay` | aggregates of the firm's sales in the books; B&O and sales tax by Washington law | 53.32, 4.31 |
| `line` `lineLim` `status` `distress` `quit` `uiCharge` `uiRate` | the bank's credit line; payroll met or missed; the owner's decision to close a business that keeps losing money (a charge of its losses); ESD's experience rating from benefits charged | 14.58, 4.31, 57.9 |
| `cover` `landlord` `rentDue` | the owner's offer of a health plan; the lease with the property's owner | 72.22 |

## Loans

| Fields | Decided by | Laws |
|---|---|---|
| `alive` `status` `bank` `type` `who` `prin` `rate` `pay` `due` `missed` `term` `col` `orig` `lim` | banks' admissions and rates (their fear, competition and the policy rate), the borrower's payments, the servicer's and trustee's timeline (12 CFR 1024.41; RCW 61.24) | 71.3, 20.20, 14.58 |

## Households of the outer layers

| Fields | Decided by | Laws |
|---|---|---|
| `alive` `layer` `place` `w` `size` `kids` `u5` `seniors` `age` `bmon` `sin` `msex` | the layers' sampled households: each stands for w like it (reweighted to its place's people); births and deaths by the laws' expected rates; moves by Boltzmann shares; the registry for those who were citizens | 75.27, 75.19, 27.4, 75.45 |
| `traits` `edu` `sector` `status` `firm` `earners` `wage` `hours` `inc` `pinc` `sav` `rent` `own` `sep` | the household's work (outer firms' hiring by E1 after a search charge; jobs ending by a separation charge), pay, savings, home; income smoothed as they expect it | 57.9, 59.44, 69.51 |
| `health` `mh` `stress` `val` `need` `memK` `memV` `memD` | the household's body and mind | 11.2, 35.16 |
| `progs` `ins` `expInf` `moved` `strike` `tx` `spent` `unempM` `jobM` `desire` `tripM` `trip` `plan` `search` `cityQ` | programs applied for, expectations from prices seen, spending from expected income and the interest rate, trips decided from the need for a break, plans to move (those bound for Port Alder gather until they make a whole household), the search for work | 57.9, 59.44, 61.34 |
| `tgA` `tgB` `tgRel` `tgLv` `tgLife` `tgRev` `teA` `teB` `teRel` `teLv` `teLife` `teRev` | trust in government and in employers (the rails law) | 13.5, 9.3 |

## Employers of the outer layers

| Fields | Decided by | Laws |
|---|---|---|
| `alive` `layer` `place` `sector` `traits` | the founding census of each place's employers and their owners' temperaments | 12.42 |
| `emp` `want` `wage` `prevW` `price` `prevP` `conf` | owners: staff from demand read in volume and smoothed, pay by the Phillips relation on expected inflation and slack, prices from unit labour cost and demand | 69.51, 59.44, 3.13 |
| `demand` `demand0` `emp0` `price0` | the households' spending by sector (traded goods by softmax shares of size and price, local services by urban scaling), against the founding | 60.7, 78.6 |
| `union` `strike` `contractW` `contractP` `hired` `fired` `profit` `carry` | workers' strike votes on their real pay, settlements by Nash bargaining; hires and layoffs (openings gathered until they make a whole sampled household); profit from the books | 19.41, 57.9 |
| `orders` `fleet` `capa` | airlines' orders as passengers outgrow fleets (Breguet range); energy capacity decisions | 66.7, 64.4 |

## Places of the outer layers

| Fields | Decided by | Laws |
|---|---|---|
| `alive` `layer` `pop` `pop0` `units` `rent` `prevRent` `home` `mw` | aggregates of each place's households and homes; state and local minimum wages by law | 22.17, 75.39 |
| `mood` `unemp` `attract` `births` `deaths` `migIn` `migOut` `cpi` `poverty` `uninsured` `snap` `medicaid` `distress` `treated` `income` `trust` | aggregates of the households' states and moves; prices from the owners' decisions | 32.4, 74.14, 75.39 |
| `pipe` `started` `visitors` | builders' starts and the housing pipeline; visitors from households' trips | 68.1 |

## Buildings

| Fields | Decided by | Laws |
|---|---|---|
| `alive` `x` `y` `w` `h` `kind` `floors` `units` `spaces` `built` `facade` `roof` `tint` `seed` `hood` `civic` `land` | the founding census of the city's fabric; then the owners' redevelopment and the citizens' chosen designs | 12.42, 52.1 |
| `cond` `value` `owner` `occupied` | wear and repairs; the assessor's value from rents and rates; owners by sale; occupancy an aggregate | 65.18, 71.3 |
| `started` `stage` `progress` `proj` `design` `cover` `podium` `green` `balcony` `glazing` `afford` `opened` | redevelopment: citizens' designs voted on, the owner's decision, the builder's progress | 52.1, 60.7, 49.32, 67.11, 23.9 |

## Homes

| Fields | Decided by | Laws |
|---|---|---|
| `alive` `bld` `hh` `rooms` | the fabric and who lives in each home | 12.42 |
| `rent` `rentSince` `forSale` `price` `owner` `value` `afford` `vacM` | owners' asking rents (lower the longer a unit sits empty), rent notices within the cap, sales; the assessor's value; income-restricted homes by the city's measure | 76.39, 71.3 |

## Commercial spaces

| Fields | Decided by | Laws |
|---|---|---|
| `alive` `bld` `kind` `tenant` `rent` `floor` | the fabric's commercial spaces, their tenants' leases and the owners' rents | 12.42, 76.39 |

457 fields in all.

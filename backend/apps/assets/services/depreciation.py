"""
Depreciation engine (FR-8.1 – FR-8.3, formulas in SRS §11.1).

Straight-line::

    annual  = (cost - salvage) / useful_life
    current = cost - annual * elapsed_years          floored at salvage

Declining balance (double-declining)::

    rate    = 2 / useful_life
    value  *= (1 - rate)   once per elapsed year     floored at salvage

Everything runs in ``Decimal`` and rounds to 2 places, so API values reconcile
exactly with the DECIMAL(12,2) columns and with the reports (SRS §11.4).
"""
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from apps.assets.constants import DepreciationMethod

TWO_PLACES = Decimal("0.01")
DAYS_PER_YEAR = Decimal("365.25")


def _money(value) -> Decimal:
    return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def elapsed_years(purchase_date: date, as_of: date | None = None) -> Decimal:
    """Fractional years between purchase and ``as_of`` (never negative)."""
    as_of = as_of or date.today()
    if not purchase_date or as_of <= purchase_date:
        return Decimal("0")
    return Decimal((as_of - purchase_date).days) / DAYS_PER_YEAR


@dataclass(frozen=True)
class DepreciationYear:
    """One row of the year-by-year schedule (FR-8.3)."""

    year: int
    opening_value: Decimal
    depreciation: Decimal
    closing_value: Decimal
    accumulated: Decimal

    def as_dict(self) -> dict:
        return {
            "year": self.year,
            "opening_value": str(self.opening_value),
            "depreciation": str(self.depreciation),
            "closing_value": str(self.closing_value),
            "accumulated_depreciation": str(self.accumulated),
        }


def current_value(
    purchase_cost,
    salvage_value,
    useful_life_years: int,
    method: str = DepreciationMethod.STRAIGHT_LINE,
    purchase_date: date | None = None,
    as_of: date | None = None,
) -> Decimal:
    """Book value today (or at ``as_of``), floored at salvage value."""
    cost = _money(purchase_cost or 0)
    salvage = _money(salvage_value or 0)

    # Guard rails: without a life or a date there is nothing to depreciate.
    if not useful_life_years or useful_life_years <= 0 or not purchase_date:
        return cost
    if salvage >= cost:
        return salvage

    years = elapsed_years(purchase_date, as_of)
    if years <= 0:
        return cost

    if method == DepreciationMethod.DECLINING_BALANCE:
        rate = Decimal(2) / Decimal(useful_life_years)
        value = cost
        whole_years = int(years)
        for _ in range(whole_years):
            value -= value * rate
            if value <= salvage:
                return salvage
        # Pro-rate the partial year so the value moves smoothly between years.
        fraction = years - Decimal(whole_years)
        if fraction > 0:
            value -= value * rate * fraction
        return _money(max(value, salvage))

    # Straight line (default)
    annual = (cost - salvage) / Decimal(useful_life_years)
    value = cost - (annual * years)
    return _money(max(value, salvage))


def annual_depreciation(purchase_cost, salvage_value, useful_life_years: int) -> Decimal:
    """Straight-line charge per year — used by the depreciation report."""
    cost = _money(purchase_cost or 0)
    salvage = _money(salvage_value or 0)
    if not useful_life_years or useful_life_years <= 0 or salvage >= cost:
        return Decimal("0.00")
    return _money((cost - salvage) / Decimal(useful_life_years))


def schedule(
    purchase_cost,
    salvage_value,
    useful_life_years: int,
    method: str = DepreciationMethod.STRAIGHT_LINE,
    purchase_date: date | None = None,
) -> list[DepreciationYear]:
    """Year-by-year schedule from purchase to end of useful life (FR-8.3)."""
    cost = _money(purchase_cost or 0)
    salvage = _money(salvage_value or 0)

    if not useful_life_years or useful_life_years <= 0 or not purchase_date:
        return []

    start_year = purchase_date.year
    rows: list[DepreciationYear] = []
    opening = cost
    accumulated = Decimal("0.00")

    if method == DepreciationMethod.DECLINING_BALANCE:
        rate = Decimal(2) / Decimal(useful_life_years)
    else:
        annual = annual_depreciation(cost, salvage, useful_life_years)

    for offset in range(useful_life_years):
        if method == DepreciationMethod.DECLINING_BALANCE:
            charge = _money(opening * rate)
        else:
            charge = annual

        closing = opening - charge
        if closing < salvage:
            charge = _money(opening - salvage)
            closing = salvage

        accumulated = _money(accumulated + charge)
        rows.append(
            DepreciationYear(
                year=start_year + offset,
                opening_value=_money(opening),
                depreciation=_money(charge),
                closing_value=_money(closing),
                accumulated=accumulated,
            )
        )
        opening = closing

    return rows

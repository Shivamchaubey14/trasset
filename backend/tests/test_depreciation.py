"""Depreciation engine — FR-8.1 to FR-8.3, formulas from SRS §11.1."""
from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase

from apps.assets.constants import DepreciationMethod
from apps.assets.services import depreciation as dep


class StraightLineTests(SimpleTestCase):
    """annual = (cost - salvage) / life;  current = cost - annual x years."""

    cost = Decimal("100000.00")
    salvage = Decimal("20000.00")
    life = 4  # annual charge = 20000

    def value_after(self, years):
        purchase = date(2020, 1, 1)
        as_of = date(2020 + years, 1, 1)
        return dep.current_value(
            self.cost, self.salvage, self.life,
            DepreciationMethod.STRAIGHT_LINE, purchase, as_of,
        )

    def test_value_on_purchase_day_is_full_cost(self):
        self.assertEqual(
            dep.current_value(self.cost, self.salvage, self.life,
                              DepreciationMethod.STRAIGHT_LINE,
                              date(2020, 1, 1), date(2020, 1, 1)),
            self.cost,
        )

    def test_year_by_year_values(self):
        # 365.25-day years mean a few paise of drift; assert to the rupee.
        for years, expected in ((1, 80000), (2, 60000), (3, 40000), (4, 20000)):
            with self.subTest(years=years):
                self.assertAlmostEqual(
                    self.value_after(years), Decimal(expected), delta=Decimal("60")
                )

    def test_value_is_floored_at_salvage(self):
        """Well past useful life the book value must not go below salvage."""
        self.assertEqual(self.value_after(12), self.salvage)

    def test_annual_depreciation_amount(self):
        self.assertEqual(
            dep.annual_depreciation(self.cost, self.salvage, self.life),
            Decimal("20000.00"),
        )

    def test_zero_useful_life_does_not_depreciate(self):
        self.assertEqual(
            dep.current_value(self.cost, self.salvage, 0,
                              DepreciationMethod.STRAIGHT_LINE, date(2020, 1, 1)),
            self.cost,
        )

    def test_missing_purchase_date_does_not_depreciate(self):
        self.assertEqual(
            dep.current_value(self.cost, self.salvage, self.life,
                              DepreciationMethod.STRAIGHT_LINE, None),
            self.cost,
        )

    def test_salvage_above_cost_returns_salvage(self):
        self.assertEqual(
            dep.current_value(Decimal("1000"), Decimal("5000"), 4,
                              DepreciationMethod.STRAIGHT_LINE, date(2020, 1, 1)),
            Decimal("5000.00"),
        )


class DecliningBalanceTests(SimpleTestCase):
    """rate = 2 / life;  value x= (1 - rate) each year."""

    cost = Decimal("100000.00")
    salvage = Decimal("10000.00")
    life = 5  # rate = 0.4

    def value_after(self, years):
        return dep.current_value(
            self.cost, self.salvage, self.life,
            DepreciationMethod.DECLINING_BALANCE,
            date(2020, 1, 1), date(2020 + years, 1, 1),
        )

    def test_year_one_applies_the_double_declining_rate(self):
        # 100000 x 0.6 = 60000
        self.assertAlmostEqual(self.value_after(1), Decimal("60000"), delta=Decimal("60"))

    def test_year_two_compounds(self):
        # 60000 x 0.6 = 36000
        self.assertAlmostEqual(self.value_after(2), Decimal("36000"), delta=Decimal("60"))

    def test_year_three_compounds(self):
        # 36000 x 0.6 = 21600
        self.assertAlmostEqual(self.value_after(3), Decimal("21600"), delta=Decimal("60"))

    def test_declines_faster_than_straight_line_early_on(self):
        straight = dep.current_value(
            self.cost, self.salvage, self.life,
            DepreciationMethod.STRAIGHT_LINE, date(2020, 1, 1), date(2021, 1, 1),
        )
        self.assertLess(self.value_after(1), straight)

    def test_value_is_floored_at_salvage(self):
        self.assertEqual(self.value_after(20), self.salvage)


class ScheduleTests(SimpleTestCase):
    """FR-8.3 — the year-by-year table exposed per asset."""

    def test_straight_line_schedule_shape_and_totals(self):
        rows = dep.schedule(Decimal("100000"), Decimal("20000"), 4,
                            DepreciationMethod.STRAIGHT_LINE, date(2026, 6, 1))

        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0].year, 2026)
        self.assertEqual(rows[0].opening_value, Decimal("100000.00"))
        self.assertEqual(rows[0].depreciation, Decimal("20000.00"))
        self.assertEqual(rows[-1].closing_value, Decimal("20000.00"))
        self.assertEqual(rows[-1].accumulated, Decimal("80000.00"))

    def test_each_closing_value_is_the_next_opening_value(self):
        rows = dep.schedule(Decimal("50000"), Decimal("5000"), 5,
                            DepreciationMethod.DECLINING_BALANCE, date(2026, 1, 1))
        for previous, current in zip(rows, rows[1:]):
            self.assertEqual(previous.closing_value, current.opening_value)

    def test_declining_balance_schedule_never_dips_below_salvage(self):
        rows = dep.schedule(Decimal("50000"), Decimal("5000"), 5,
                            DepreciationMethod.DECLINING_BALANCE, date(2026, 1, 1))
        for row in rows:
            self.assertGreaterEqual(row.closing_value, Decimal("5000.00"))

    def test_no_useful_life_yields_an_empty_schedule(self):
        self.assertEqual(
            dep.schedule(Decimal("1000"), Decimal("0"), 0,
                         DepreciationMethod.STRAIGHT_LINE, date(2026, 1, 1)),
            [],
        )

    def test_serialisable_dict_shape(self):
        rows = dep.schedule(Decimal("1000"), Decimal("100"), 2,
                            DepreciationMethod.STRAIGHT_LINE, date(2026, 1, 1))
        keys = set(rows[0].as_dict())
        self.assertEqual(
            keys,
            {"year", "opening_value", "depreciation",
             "closing_value", "accumulated_depreciation"},
        )

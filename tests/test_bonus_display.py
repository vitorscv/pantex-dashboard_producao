from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.bonus import build_bonus_display


class BonusDisplayTests(unittest.TestCase):
    def test_excel_bonus_ranges_are_returned_exactly(self) -> None:
        cases = [
            ((1, 1), {"rate1": 11500, "rate2": 13500, "rate3": 15000, "mult1": 0.0010, "mult2": 0.0020, "mult3": 0.0030, "bonus_ref1": "R$100,00 a R$146,00", "bonus_ref2": "R$184,00 a R$284,00", "bonus_ref3": "ACIMA R$352,00"}),
            ((1, 2), {"rate1": 9300, "rate2": 10300, "rate3": 11300, "mult1": 0.0012, "mult2": 0.0025, "mult3": 0.0038, "bonus_ref1": "R$100,00 a R$140,48", "bonus_ref2": "R$184,00 a R$284,00", "bonus_ref3": "ACIMA R$355,36"}),
            ((2, 1), {"rate1": 11500, "rate2": 13500, "rate3": 15000, "mult1": 0.0010, "mult2": 0.0022, "mult3": 0.0033, "bonus_ref1": "R$100,00 a R$141,00", "bonus_ref2": "R$192,40 a R$277,10", "bonus_ref3": "ACIMA R$342,55"}),
            ((2, 2), {"rate1": 9300, "rate2": 10300, "rate3": 11300, "mult1": 0.0011, "mult2": 0.0025, "mult3": 0.0038, "bonus_ref1": "R$100,00 a R$140,48", "bonus_ref2": "R$184,00 a R$284,00", "bonus_ref3": "ACIMA R$355,36"}),
            ((3, 1), {"rate1": 7500, "rate2": 8500, "rate3": 9500, "mult1": 0.0015, "mult2": 0.0020, "mult3": 0.0030, "bonus_ref1": "R$100,00 a R$131,50", "bonus_ref2": "R$142,00 a R$184,00", "bonus_ref3": "ACIMA R$226,00"}),
            ((3, 2), {"rate1": 6300, "rate2": 7300, "rate3": 8300, "mult1": 0.0015, "mult2": 0.0020, "mult3": 0.0030, "bonus_ref1": "R$100,00 a R$131,50", "bonus_ref2": "R$142,00 a R$184,00", "bonus_ref3": "ACIMA R$226,00"}),
            ((4, 1), {"rate1": 9000, "rate2": 10000, "rate3": 11000, "mult1": 0.0012, "mult2": 0.0025, "mult3": 0.0038, "bonus_ref1": "R$100,00 a R$144,16", "bonus_ref2": "R$184,00 a R$284,00", "bonus_ref3": "ACIMA R$355,36"}),
            ((4, 2), {"rate1": 8400, "rate2": 9400, "rate3": 10400, "mult1": 0.0012, "mult2": 0.0025, "mult3": 0.0038, "bonus_ref1": "R$100,00 a R$144,16", "bonus_ref2": "R$184,00 a R$284,00", "bonus_ref3": "ACIMA R$355,36"}),
            ((5, 1), {"rate1": 11500, "rate2": 13500, "rate3": 15000, "mult1": 0.0010, "mult2": 0.0020, "mult3": 0.0030, "bonus_ref1": "R$100,00 a R$146,00", "bonus_ref2": "R$184,00 a R$284,00", "bonus_ref3": "ACIMA R$352,00"}),
            ((5, 2), {"rate1": 9300, "rate2": 10300, "rate3": 11300, "mult1": 0.0011, "mult2": 0.0025, "mult3": 0.0038, "bonus_ref1": "R$100,00 a R$140,48", "bonus_ref2": "R$155,00 a R$284,00", "bonus_ref3": "ACIMA R$355,36"}),
            ((6, 1), {"rate1": 11500, "rate2": 13500, "rate3": 15000, "mult1": 0.0010, "mult2": 0.0020, "mult3": 0.0030, "bonus_ref1": "R$100,00 a R$146,00", "bonus_ref2": "R$184,00 a R$284,00", "bonus_ref3": "ACIMA R$352,00"}),
            ((6, 2), {"rate1": 9800, "rate2": 10800, "rate3": 11800, "mult1": 0.0011, "mult2": 0.0025, "mult3": 0.0038, "bonus_ref1": "R$100,00 a R$140,48", "bonus_ref2": "R$155,00 a R$284,00", "bonus_ref3": "ACIMA R$223,2"}),
        ]

        for identity, cfg in cases:
            with self.subTest(machine=identity[0], shift=identity[1]):
                display = build_bonus_display(business_days=23, **cfg)
                self.assertEqual(display["rate1"], cfg["rate1"])
                self.assertEqual(display["rate2"], cfg["rate2"])
                self.assertEqual(display["rate3"], cfg["rate3"])
                self.assertEqual(display["bonus_ref1"], cfg["bonus_ref1"])
                self.assertEqual(display["bonus_ref2"], cfg["bonus_ref2"])
                self.assertEqual(display["bonus_ref3"], cfg["bonus_ref3"])

    def test_formula_fallback_still_works_without_explicit_refs(self) -> None:
        display = build_bonus_display(
            business_days=23,
            rate1=11500,
            rate2=13500,
            rate3=15000,
            mult1=0.0010,
            mult2=0.0020,
            mult3=0.0030,
        )

        self.assertEqual(display["bonus_ref1"], "R$100,00 a R$146,00")
        self.assertEqual(display["bonus_ref2"], "R$192,00 a R$261,00")
        self.assertEqual(display["bonus_ref3"], "ACIMA R$341,50")


if __name__ == "__main__":
    unittest.main()

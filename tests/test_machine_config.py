from datetime import date
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError

from app.schemas import RatesUpdate, ShiftMinutesUpdate
from app.services.machine_config import build_shift_minutes_view


def row(shift: int, machine_id: int, minutes: int, valid_from: date) -> dict:
    return {"shift": shift, "machine_id": machine_id, "minutes": minutes, "valid_from": valid_from}


BASE = date(2000, 1, 1)


class ShiftMinutesViewTests(unittest.TestCase):
    def find(self, view: list[dict], shift: int, machine_id: int) -> dict:
        return next(r for r in view if r["shift"] == shift and r["machine_id"] == machine_id)

    def test_defaults_when_table_is_empty(self) -> None:
        view = build_shift_minutes_view([])
        self.assertEqual(self.find(view, 1, 0)["minutes"], 525)
        self.assertEqual(self.find(view, 2, 3)["minutes"], 435)
        self.assertEqual(len(view), 2 * 8)

    def test_machine_row_wins_over_shift_default(self) -> None:
        view = build_shift_minutes_view([
            row(2, 0, 195, date(2026, 10, 1)),
            row(2, 6, 255, date(2026, 10, 1)),
        ])
        self.assertEqual(self.find(view, 2, 0)["minutes"], 195)
        self.assertEqual(self.find(view, 2, 6)["minutes"], 255)
        self.assertEqual(self.find(view, 2, 6)["source"], "maquina")
        # as demais máquinas herdam o padrão do turno
        self.assertEqual(self.find(view, 2, 4)["minutes"], 195)
        self.assertEqual(self.find(view, 2, 4)["source"], "turno")

    def test_factory_default_is_not_reported_as_change(self) -> None:
        view = build_shift_minutes_view([row(1, 0, 525, BASE)])
        self.assertIsNone(self.find(view, 1, 0)["valid_from"])
        view = build_shift_minutes_view([row(1, 0, 500, date(2026, 11, 3))])
        self.assertEqual(self.find(view, 1, 5)["valid_from"], "2026-11-03")


class RatesUpdateTests(unittest.TestCase):
    base = {"machine_id": 4, "shift": 2, "year": 2026, "month": 11,
            "rate1": 3656.3333, "rate2": 4029.5178, "rate3": 4402.7022}

    def test_accepts_decimal_rates(self) -> None:
        self.assertEqual(RatesUpdate(**self.base).rate1, 3656.3333)

    def test_rates_must_be_ordered(self) -> None:
        with self.assertRaises(ValidationError):
            RatesUpdate(**{**self.base, "rate1": 5000})

    def test_rates_must_be_positive(self) -> None:
        with self.assertRaises(ValidationError):
            RatesUpdate(**{**self.base, "rate1": 0})


class ShiftMinutesUpdateTests(unittest.TestCase):
    def test_default_machine_is_all(self) -> None:
        update = ShiftMinutesUpdate(shift=2, valid_from=date(2026, 10, 1), minutes=195)
        self.assertEqual(update.machine_id, 0)

    def test_minutes_bounds(self) -> None:
        for minutes in (0, 29, 1441):
            with self.subTest(minutes=minutes), self.assertRaises(ValidationError):
                ShiftMinutesUpdate(shift=1, valid_from=date(2026, 10, 1), minutes=minutes)


if __name__ == "__main__":
    unittest.main()

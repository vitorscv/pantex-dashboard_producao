from datetime import date
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.analytics.stats.paradas import UNCLASSIFIED_CODE, _load_day, build_downtime_stat


def entry(day: int, machine: int, shift: int, minutes: int, month: int = 11) -> dict:
    return {"entry_date": date(2026, month, day), "machine_id": machine, "shift": shift, "downtime_minutes": minutes}


def cause(day: int, machine: int, shift: int, code: int, minutes: int, month: int = 11) -> dict:
    return {"entry_date": date(2026, month, day), "machine_id": machine, "shift": shift, "code": code, "minutes": minutes}


def stat(entries=(), causes=(), prev_entries=(), prev_causes=()):
    return build_downtime_stat(2026, 11, list(entries), list(causes), list(prev_entries), list(prev_causes))


def by_code(result) -> dict:
    return {c.code: c for c in result.causes}


class DowntimeStatTests(unittest.TestCase):
    def test_empty_month(self) -> None:
        result = stat()
        self.assertEqual(result.total_minutes, 0)
        self.assertFalse(result.has_causes)
        self.assertEqual(result.causes, [])
        self.assertEqual(result.machines, [])

    def test_causes_split_the_entry_total(self) -> None:
        result = stat(
            entries=[entry(3, 1, 1, 120)],
            causes=[cause(3, 1, 1, 1, 90), cause(3, 1, 1, 7, 30)],
        )
        causes = by_code(result)
        self.assertEqual(result.total_minutes, 120)
        self.assertEqual(causes[1].minutes, 90)
        self.assertEqual(causes[7].minutes, 30)
        self.assertNotIn(UNCLASSIFIED_CODE, causes)
        self.assertTrue(result.has_causes)
        self.assertEqual(result.unclassified_minutes, 0)
        self.assertEqual(causes[1].pct, 75.0)

    def test_minutes_without_cause_become_unclassified(self) -> None:
        # lançamento antigo (sem causas) + lançamento novo com detalhe parcial
        result = stat(
            entries=[entry(2, 1, 1, 60), entry(3, 2, 1, 100)],
            causes=[cause(3, 2, 1, 5, 40)],
        )
        causes = by_code(result)
        self.assertEqual(causes[UNCLASSIFIED_CODE].minutes, 60 + 60)
        self.assertEqual(result.unclassified_minutes, 120)
        self.assertEqual(result.classified_minutes, 40)
        self.assertEqual(sum(c.minutes for c in result.causes), result.total_minutes)

    def test_only_legacy_entries_means_no_causes(self) -> None:
        result = stat(entries=[entry(2, 1, 1, 60)])
        self.assertFalse(result.has_causes)
        self.assertEqual(result.unclassified_minutes, 60)

    def test_bonus_minutes_follow_the_summary_rule(self) -> None:
        # 1 a 4 e o legado sem causa descontam a bonificação; 5 a 7 não.
        result = stat(
            entries=[entry(3, 1, 1, 200), entry(4, 1, 1, 50)],
            causes=[cause(3, 1, 1, 2, 100), cause(3, 1, 1, 6, 60), cause(3, 1, 1, 7, 40)],
        )
        self.assertEqual(result.total_minutes, 250)
        self.assertEqual(result.bonus_minutes, 250 - 60 - 40)
        causes = by_code(result)
        self.assertTrue(causes[2].affects_bonus)
        self.assertFalse(causes[6].affects_bonus)
        self.assertTrue(causes[UNCLASSIFIED_CODE].affects_bonus)

    def test_delta_against_previous_month_includes_vanished_causes(self) -> None:
        result = stat(
            entries=[entry(3, 1, 1, 90)],
            causes=[cause(3, 1, 1, 1, 90)],
            prev_entries=[entry(5, 1, 1, 100, month=10)],
            prev_causes=[cause(5, 1, 1, 1, 60, month=10), cause(5, 1, 1, 3, 40, month=10)],
        )
        causes = by_code(result)
        self.assertEqual(causes[1].delta_minutes, 30)
        self.assertEqual(causes[3].minutes, 0)
        self.assertEqual(causes[3].delta_minutes, -40)
        self.assertEqual(result.prev_total_minutes, 100)

    def test_orphan_cause_is_ignored(self) -> None:
        # causa de um lançamento que não tem parada não pode inflar o total
        result = stat(entries=[entry(3, 1, 1, 30)], causes=[cause(3, 1, 1, 1, 30), cause(9, 4, 2, 1, 500)])
        self.assertEqual(result.total_minutes, 30)
        self.assertEqual(by_code(result)[1].minutes, 30)

    def test_machines_days_and_shifts(self) -> None:
        result = stat(
            entries=[entry(3, 1, 1, 100), entry(3, 1, 2, 20), entry(4, 2, 1, 300)],
            causes=[cause(3, 1, 1, 1, 100), cause(3, 1, 2, 1, 20), cause(4, 2, 1, 2, 300)],
        )
        self.assertEqual([m.key for m in result.machines], [2, 1])  # mais parada primeiro
        self.assertEqual(result.machines[1].total_minutes, 120)
        self.assertEqual([d.key for d in result.days], [3, 4])      # ordem cronológica
        causes = by_code(result)
        self.assertEqual((causes[1].shift1_minutes, causes[1].shift2_minutes), (100, 20))
        self.assertEqual(causes[2].shift1_minutes, 300)

    def test_causes_sorted_by_minutes(self) -> None:
        result = stat(
            entries=[entry(3, 1, 1, 100)],
            causes=[cause(3, 1, 1, 3, 10), cause(3, 1, 1, 5, 70), cause(3, 1, 1, 6, 20)],
        )
        self.assertEqual([c.code for c in result.causes], [5, 6, 3])


class FakeCursor:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def execute(self, sql: str, params: tuple | None = None) -> None:
        self.calls.append((sql, params))

    def fetchall(self) -> list:
        return []


class DowntimeDayLoadTests(unittest.TestCase):
    def test_day_filters_by_exact_date_on_both_tables(self) -> None:
        cursor = FakeCursor()
        _load_day(cursor, date(2026, 11, 25), True)
        self.assertEqual(len(cursor.calls), 2)
        self.assertTrue(all(params == (date(2026, 11, 25),) for _, params in cursor.calls))
        self.assertIn("prod_entries", cursor.calls[0][0])
        self.assertIn("downtime_causes", cursor.calls[1][0])

    def test_day_skips_causes_table_when_migration_is_missing(self) -> None:
        cursor = FakeCursor()
        _load_day(cursor, date(2026, 11, 25), False)
        self.assertEqual(len(cursor.calls), 1)
        self.assertIn("prod_entries", cursor.calls[0][0])
        self.assertNotIn("downtime_causes", cursor.calls[0][0])


if __name__ == "__main__":
    unittest.main()

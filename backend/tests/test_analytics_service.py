import math
import unittest

from services.analytics_service import calculate_transfer_analytics


class TransferAnalyticsTests(unittest.TestCase):
    def test_empty_dataset_reports_insufficient_data(self):
        analytics = calculate_transfer_analytics([])

        self.assertEqual(analytics["record_count"], 0)
        self.assertEqual(analytics["outliers"]["count"], 0)
        self.assertEqual(analytics["model_metrics"]["count"], 0)
        self.assertTrue(all(
            result["coefficient"] is None
            for result in analytics["correlations"].values()
        ))
        self.assertEqual(analytics["paired_predictions"], [])

    def test_statistics_baseline_and_perfect_correlations_use_real_records(self):
        records = [
            {
                "file_size_mb": 10,
                "bandwidth_mbps": 20,
                "latency_ms": 1,
                "packet_loss_percent": 0,
                "predicted_transfer_time_seconds": 4,
            },
            {
                "file_size_mb": 20,
                "bandwidth_mbps": 10,
                "latency_ms": 2,
                "packet_loss_percent": 1,
                "predicted_transfer_time_seconds": 8,
            },
            {
                "file_size_mb": 30,
                "bandwidth_mbps": 0,
                "latency_ms": 3,
                "packet_loss_percent": 2,
                "predicted_transfer_time_seconds": 12,
            },
        ]

        analytics = calculate_transfer_analytics(records)

        self.assertEqual(analytics["feature_statistics"]["file_size_mb"]["mean"], 20)
        self.assertEqual(analytics["feature_statistics"]["file_size_mb"]["median"], 20)
        self.assertEqual(analytics["feature_statistics"]["file_size_mb"]["min"], 10)
        self.assertEqual(analytics["feature_statistics"]["file_size_mb"]["max"], 30)
        self.assertAlmostEqual(
            analytics["feature_statistics"]["file_size_mb"]["standard_deviation"],
            10,
        )
        self.assertEqual(analytics["records"][0]["baseline_transfer_time_seconds"], 4)
        self.assertAlmostEqual(analytics["correlations"]["file_size_mb"]["coefficient"], 1)
        self.assertAlmostEqual(analytics["correlations"]["bandwidth_mbps"]["coefficient"], -1)
        self.assertEqual(analytics["model_metrics"]["count"], 0)

    def test_actual_metrics_only_use_available_actual_targets(self):
        records = [
            {
                "file_size_mb": 1,
                "bandwidth_mbps": 10,
                "actual_transfer_time_seconds": 2,
                "predicted_transfer_time_seconds": 3,
            },
            {
                "file_size_mb": 2,
                "bandwidth_mbps": 10,
                "actual_transfer_time_seconds": 4,
                "predicted_transfer_time_seconds": 3,
            },
        ]

        analytics = calculate_transfer_analytics(records)

        self.assertEqual(analytics["time_target"], "actual")
        self.assertEqual(analytics["model_metrics"]["count"], 2)
        self.assertEqual(analytics["model_metrics"]["mae"], 1)
        self.assertEqual(analytics["model_metrics"]["rmse"], 1)
        self.assertAlmostEqual(analytics["model_metrics"]["r2"], 0)
        self.assertEqual(len(analytics["paired_predictions"]), 2)

    def test_single_record_zero_bandwidth_and_invalid_values_are_safe(self):
        analytics = calculate_transfer_analytics([
            {
                "file_size_mb": float("nan"),
                "bandwidth_mbps": 0,
                "latency_ms": "invalid",
                "predicted_transfer_time_seconds": 5,
            }
        ])

        self.assertIsNone(analytics["records"][0]["file_size_mb"])
        self.assertIsNone(analytics["records"][0]["baseline_transfer_time_seconds"])
        self.assertIsNone(analytics["correlations"]["file_size_mb"]["coefficient"])
        self.assertIn("file_size_mb", analytics["correlations"])
        self.assertEqual(analytics["outliers"]["normal_count"], 0)
        self.assertIsNone(analytics["feature_statistics"].get("file_size_mb"))
        self.assertTrue(self._contains_no_non_finite_numbers(analytics))

    def test_z_score_outliers_are_flagged_not_removed(self):
        records = [
            {"predicted_transfer_time_seconds": value, "file_name": str(value)}
            for value in [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 1000]
        ]

        analytics = calculate_transfer_analytics(records)

        self.assertEqual(analytics["outliers"]["count"], 1)
        self.assertEqual(analytics["outliers"]["records"][0]["file_name"], "1000")
        self.assertEqual(analytics["outliers"]["normal_count"], 11)
        self.assertEqual(len(analytics["records"]), len(records))

    def _contains_no_non_finite_numbers(self, value):
        if isinstance(value, dict):
            return all(self._contains_no_non_finite_numbers(item) for item in value.values())
        if isinstance(value, list):
            return all(self._contains_no_non_finite_numbers(item) for item in value)
        if isinstance(value, float):
            return math.isfinite(value)
        return True


if __name__ == "__main__":
    unittest.main()

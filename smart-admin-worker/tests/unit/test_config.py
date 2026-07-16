from smart_admin_worker.config import Settings


def test_settings_reads_kafka_bootstrap_from_env(monkeypatch):
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    s = Settings()
    assert s.kafka_bootstrap_servers == "kafka:9092"
    assert s.kafka_consumer_group == "smart-admin-worker"


def test_settings_clamps_max_concurrent_rotate_to_cap(monkeypatch):
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    monkeypatch.setenv("MAX_CONCURRENT_ROTATE", "42")
    monkeypatch.setenv("MAX_CONCURRENT_ROTATE_CAP", "3")
    s = Settings()
    assert s.max_concurrent_rotate == 3


def test_settings_floors_max_concurrent_rotate_to_one(monkeypatch):
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    monkeypatch.setenv("MAX_CONCURRENT_ROTATE", "0")
    s = Settings()
    assert s.max_concurrent_rotate == 1


def test_konami_allowlist_parsed_to_frozenset(monkeypatch):
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    monkeypatch.setenv("KONAMI_SENDER_ALLOWLIST", "a@x, b@y ,C@Z")
    s = Settings()
    assert s.konami_sender_allowlist_set == frozenset({"a@x", "b@y", "c@z"})

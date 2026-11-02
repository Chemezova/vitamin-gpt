"""Refresh PWA reference-data copies from a local Vitamin CHE vault."""

import argparse
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "data"
FILES = {
    "conflict-registry.json": "conflict-registry.json",
    "markers.json": "markers.json",
    "showcase.json": "showcase.json",
    "sku/catalog.json": "catalog.json",
    "sku/products.json": "products.json",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, help="Path to the Vitamin CHE vault root")
    source = Path(parser.parse_args().source_root).expanduser() / "02-product" / "data" / "json"
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for source_name, destination_name in FILES.items():
        source_path = source / source_name
        if not source_path.is_file():
            raise FileNotFoundError(f"Missing source reference dataset: {source_path}")
        shutil.copy2(source_path, DESTINATION / destination_name)
        print(f"Updated data/{destination_name}")


if __name__ == "__main__":
    main()

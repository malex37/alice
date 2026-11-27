import importlib.util
import sys
from pathlib import Path

# Load core/ by path: importing custom_components.qdify would pull in Home Assistant.
CORE = Path(__file__).parents[1] / "custom_components" / "qdify" / "core" / "__init__.py"
spec = importlib.util.spec_from_file_location(
    "qdify_core", CORE, submodule_search_locations=[str(CORE.parent)]
)
module = importlib.util.module_from_spec(spec)
sys.modules["qdify_core"] = module
spec.loader.exec_module(module)

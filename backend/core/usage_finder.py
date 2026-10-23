import os
import re
from api.models import DependencyInfo, UsageLocation

SKIP_DIRS = {".git", "node_modules", "venv", ".venv", "env", "__pycache__", "dist", "build", ".next", "site-packages"}
PYTHON_EXTS = {".py"}
JS_EXTS = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte"}
MAX_FILE_BYTES = 1_000_000
MAX_USAGES_PER_DEP = 20

# PyPI names whose import name differs from the package name
PYTHON_IMPORT_NAMES = {
    "beautifulsoup4": ["bs4"],
    "pyyaml": ["yaml"],
    "pillow": ["PIL"],
    "scikit-learn": ["sklearn"],
    "scikit-image": ["skimage"],
    "opencv-python": ["cv2"],
    "opencv-python-headless": ["cv2"],
    "python-dotenv": ["dotenv"],
    "python-dateutil": ["dateutil"],
    "pygithub": ["github"],
    "gitpython": ["git"],
    "protobuf": ["google.protobuf"],
    "attrs": ["attr", "attrs"],
    "pyjwt": ["jwt"],
    "python-multipart": ["multipart"],
    "google-generativeai": ["google.generativeai"],
    "psycopg2-binary": ["psycopg2"],
    "msgpack-python": ["msgpack"],
}

def _python_pattern(package: str) -> re.Pattern:
    key = package.lower()
    names = PYTHON_IMPORT_NAMES.get(key) or [key.replace("-", "_").replace(".", "_")]
    if key.startswith("python-") and key not in PYTHON_IMPORT_NAMES:
        names.append(key[len("python-"):].replace("-", "_"))
    alternatives = "|".join(re.escape(name) for name in names)
    return re.compile(rf"^\s*(?:from\s+(?:{alternatives})(?:\.|\s)|import\s+(?:{alternatives})(?:\.|\s|,|$))", re.IGNORECASE)

def _js_pattern(package: str) -> re.Pattern:
    name = re.escape(package)
    return re.compile(rf"""(?:from\s+|require\(\s*|import\(\s*|import\s+)['"]{name}(?:/[^'"]*)?['"]""")

def find_usages(repo_dir: str, dependencies: list[DependencyInfo]):
    """Attaches the import sites of each dependency, searching the folder that holds its manifest."""
    patterns = []
    for dep in dependencies:
        # A package from backend/requirements.txt is only matched against code under backend/
        scope = os.path.dirname(dep.file_path)
        scope = scope + os.sep if scope else ""
        if dep.ecosystem == "PyPI":
            patterns.append((dep, _python_pattern(dep.name), PYTHON_EXTS, scope))
        elif dep.ecosystem == "npm":
            patterns.append((dep, _js_pattern(dep.name), JS_EXTS, scope))
    if not patterns:
        return

    for root, dirs, files in os.walk(repo_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for filename in files:
            path = os.path.join(root, filename)
            rel_path = os.path.relpath(path, repo_dir)
            ext = os.path.splitext(filename)[1]
            candidates = [
                (dep, pattern) for dep, pattern, exts, scope in patterns
                if ext in exts and rel_path.startswith(scope)
            ]
            if not candidates:
                continue

            try:
                if os.path.getsize(path) > MAX_FILE_BYTES:
                    continue
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()
            except OSError:
                continue

            for line_no, line in enumerate(lines, start=1):
                for dep, pattern in candidates:
                    if len(dep.usages) < MAX_USAGES_PER_DEP and pattern.search(line):
                        dep.usages.append(UsageLocation(file=rel_path, line=line_no, code=line.strip()[:200]))

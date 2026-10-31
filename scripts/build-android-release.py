"""Build a signed Play bundle; signing configuration stays outside source."""
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
config = Path(os.environ.get('CATGRID_SIGNING_CONFIG', str(Path.home() / '.config/catgrid/signing/android.json')))
values = json.loads(config.read_text())
env = dict(os.environ)
for key, name in [('storeFile', 'CATGRID_STORE_FILE'), ('storePassword', 'CATGRID_STORE_PASSWORD'), ('keyAlias', 'CATGRID_KEY_ALIAS'), ('keyPassword', 'CATGRID_KEY_PASSWORD')]:
    env[name] = values[key]
subprocess.run([str(root / 'android/gradlew'), '-p', str(root / 'android'), 'bundleRelease', '--console=plain'], env=env, check=True)

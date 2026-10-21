"""Dependency-free Windows APK build using official Android SDK tools and a JDK.
Run: python tools/build.py [--test]
Also supports opening app/ in Android Studio via the supplied Gradle project.
"""
import hashlib, os, pathlib, shutil, subprocess, sys, urllib.request, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
os.chdir(ROOT)
TC = ROOT / '.toolchain'
SDK = TC / 'sdk'
JAVA = pathlib.Path(os.environ.get('JAVA_HOME', '')) / 'bin'
if not (JAVA / 'javac.exe').exists():
    found = shutil.which('javac')
    if not found:
        sys.exit('A JDK with javac is required. Set JAVA_HOME first.')
    JAVA = pathlib.Path(found).parent

def run(*args):
    args = [str(a) for a in args]
    print('>', pathlib.Path(args[0]).name, ' '.join(args[1:4]), flush=True)
    subprocess.run(args, check=True, cwd=ROOT)

def sdk_archive(filename, url):
    TC.mkdir(exist_ok=True)
    archive = TC / filename
    if not archive.exists():
        print('Downloading official Android SDK:', url, flush=True)
        urllib.request.urlretrieve(url, archive)
    SDK.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        z.extractall(SDK)

if '--test' in sys.argv:
    test_dir = ROOT / 'build' / 'tests'
    test_dir.mkdir(parents=True, exist_ok=True)
    run(JAVA/'javac.exe', '--release', '8', '-encoding', 'UTF-8', '-d', test_dir,
        ROOT/'app/src/main/java/cn/stride/offline/RouteEngine.java', ROOT/'tests/RouteEngineTest.java')
    run(JAVA/'java.exe', '-cp', test_dir, 'RouteEngineTest')
    sys.exit(0)

if not (SDK/'android-35/android.jar').exists():
    sdk_archive('platform.zip', 'https://dl.google.com/android/repository/platform-35_r02.zip')
if not (SDK/'android-15/aapt2.exe').exists():
    sdk_archive('build-tools.zip', 'https://dl.google.com/android/repository/build-tools_r35_windows.zip')
TOOLS = SDK/'android-15'
ANDROID = SDK/'android-35/android.jar'
BUILD = ROOT/'build'
DIST = ROOT/'dist'
for p in [BUILD, DIST, BUILD/'generated', BUILD/'classes', BUILD/'dex']:
    p.mkdir(parents=True, exist_ok=True)
run(TOOLS/'aapt2.exe', 'compile', '--dir', ROOT/'app/src/main/res', '-o', BUILD/'resources.zip')
manifest = ROOT/'app/src/main/AndroidManifest.xml'
if '--debug' in sys.argv:
    debug_manifest = BUILD/'AndroidManifest.xml'
    debug_manifest.write_text(manifest.read_text(encoding='utf-8').replace('<application ', '<application android:debuggable="true" '),encoding='utf-8')
    manifest = debug_manifest
run(TOOLS/'aapt2.exe', 'link', '-o', BUILD/'base.apk', '-I', ANDROID,
    '--manifest', manifest, '--java', BUILD/'generated',
    '--min-sdk-version', '26', '--target-sdk-version', '35', '--version-code', '8',
    '--version-name', '1.3.4', '-A', ROOT/'app/src/main/assets', BUILD/'resources.zip')
sources = list((ROOT/'app/src/main/java').rglob('*.java'))+list((BUILD/'generated').rglob('*.java'))
source_list = BUILD/'sources.txt'
source_list.write_text('\n'.join('"'+p.as_posix()+'"' for p in sources), encoding='utf-8')
run(JAVA/'javac.exe', '--release', '8', '-encoding', 'UTF-8', '-cp', ANDROID,
    '-d', BUILD/'classes', '@'+str(source_list))
run(JAVA/'jar.exe', 'cf', BUILD/'classes.jar', '-C', BUILD/'classes', '.')
run(JAVA/'java.exe', '-cp', TOOLS/'lib/d8.jar', 'com.android.tools.r8.D8',
    '--lib', ANDROID, '--min-api', '26', '--output', BUILD/'dex', BUILD/'classes.jar')
with zipfile.ZipFile(BUILD/'base.apk') as original, zipfile.ZipFile(BUILD/'unsigned.apk','w') as out:
    for entry in original.infolist():
        out.writestr(entry, original.read(entry.filename))
    for dex in (BUILD/'dex').glob('*.dex'):
        out.write(dex, dex.name, compress_type=zipfile.ZIP_STORED)
run(TOOLS/'zipalign.exe','-f','-p','4',BUILD/'unsigned.apk',BUILD/'aligned.apk')
key=TC/'debug.jks'
if not key.exists():
    run(JAVA/'keytool.exe','-genkeypair','-keystore',key,'-storepass','android','-keypass','android',
        '-alias','androiddebugkey','-dname','CN=Stride Local Build,O=Local Development,C=CN',
        '-keyalg','RSA','-keysize','2048','-validity','10000')
apk=BUILD/'stride-debug.apk' if '--debug' in sys.argv else DIST/'stride-1.3.4.apk'
run(JAVA/'java.exe','-jar',TOOLS/'lib/apksigner.jar','sign','--ks',key,'--ks-key-alias','androiddebugkey',
    '--ks-pass','pass:android','--key-pass','pass:android','--out',apk,BUILD/'aligned.apk')
run(JAVA/'java.exe','-jar',TOOLS/'lib/apksigner.jar','verify','--verbose',apk)
digest=hashlib.sha256(apk.read_bytes()).hexdigest()
if '--debug' not in sys.argv:
    (DIST/'SHA256SUMS.txt').write_text(digest+'  '+apk.name+'\n',encoding='utf-8')
print('\nAPK:',apk,'\nSHA256:',digest, flush=True)
